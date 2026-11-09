import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unwatchFile,
  watchFile,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { encodeAnswer } from "../core/answer.ts";
import type { Answer } from "../core/types.ts";
import { checkText } from "./check.ts";
import {
  ANSWER_EVENT,
  ANSWER_RESULT_EVENT,
  type AnswerResult,
  CONTRACT_VERSION,
  DOCUMENTS_EVENT,
  DOCUMENTS_REQUEST_EVENT,
  type DocKind,
  type PublishedDocument,
  parseAnswer,
} from "./contract.ts";
import { createEditSession, defaultLaunch, defaultRun, EDITOR_ENV, type EditDeps, WATCH_MS } from "./edit.ts";
import { createAllowList, HTML_FILE, IMAGE_FILE, MARKDOWN_FILE, REACT_FILE } from "./files.ts";
import type { PageServer, PageServerOptions } from "./server.ts";

export const MESSAGE_TYPE = "better-show";
export const MINI_SDD_FILE = /(^|\/)docs\/specs\/[^/]+\/(decision|spec|design|verification)\.md$/;
export const MINI_SDD_PHASES = ["decision.md", "spec.md", "design.md", "verification.md"];
export const PROPOSED_STATUS = /^Status:\s*proposed\b/m;
/** The list keeps the most recently shown documents. */
export const MAX_DOCUMENTS = 32;
/** Answer results remembered so a repeated `answerId` replays instead of delivering twice. */
export const MAX_REMEMBERED_ANSWERS = 256;
/** How long a page just sent to the browser counts as open before its tab connects. */
export const PAGE_OPEN_WAIT_MS = 15_000;
/** The command that opens a URL in the default browser. */
export const OPENER = process.platform === "darwin" ? "open" : "xdg-open";

export type View = "page" | "edit";

export interface ShowResult {
  opened: string[];
  text: string;
}

export interface Deps extends EditDeps {
  servePages: (options: PageServerOptions) => Promise<PageServer>;
  /** Opens a URL in the default browser. */
  openUrl: (url: string) => void;
  realpath: (path: string) => string;
  newId: () => string;
  now: () => number;
}

/**
 * Starts the page server, loading it (with the renderers, Mermaid, and the page bundler it pulls in) on the first
 * call. An idle session that never shows a page never pays for any of it.
 */
export const createPageServer = async (options: PageServerOptions): Promise<PageServer> =>
  (await import("./server.ts")).createPageServer(options);

export const defaultDeps = (): Deps => ({
  editor: process.env[EDITOR_ENV],
  onPath: (command) => spawnSync("sh", ["-c", 'command -v "$1"', "sh", command], { stdio: "ignore" }).status === 0,
  launch: defaultLaunch,
  run: defaultRun,
  platform: process.platform,
  readFile: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  },
  writeFile: (path, content) => writeFileSync(path, content),
  makeDir: () => mkdtempSync(join(tmpdir(), "pi-better-show-")),
  removeDir: (dir) => rmSync(dir, { recursive: true, force: true }),
  watch: (path, onChange) => {
    const listener = (): void => onChange();
    watchFile(path, { interval: WATCH_MS }, listener);
    return () => unwatchFile(path, listener);
  },
  servePages: createPageServer,
  openUrl: (url) => {
    const opened = defaultRun(OPENER, [url]);
    if (opened.status !== 0) throw new Error(`${OPENER} failed: ${(opened.stderr || opened.stdout).trim()}`);
  },
  realpath: (path) => (existsSync(path) ? realpathSync(path) : path),
  newId: randomUUID,
  now: Date.now,
});

interface DocEntry {
  id: string;
  path: string;
  kind: DocKind;
  display: string;
  reason: string;
  revision: number;
  onScreen: boolean;
  /** The content last published, so a revision bumps only when the file really changed. */
  seen: string;
  screen: "browser" | "editor";
}

interface Loaded {
  absolute: string;
  content: string;
  display: string;
}

const isFile = (path: string, ...patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(path));

export function createBetterShow(pi: ExtensionAPI, deps: Deps = defaultDeps()) {
  let ctx: ExtensionContext | undefined;
  let server: PageServer | undefined;
  let closed = false;
  const allow = createAllowList();
  /** Every document shown, by real path, oldest first; this is what the `documents` event lists. */
  const docs = new Map<string, DocEntry>();
  /** Pages open in the browser, with the content the server last rendered for them. */
  const pages = new Map<string, string>();
  const openedAt = new Map<string, number>();
  const answers = new Map<string, { id: string | undefined; result: { accepted: boolean; reason?: string } }>();

  // A save waits for the user's next message; an answer is an explicit send, so it starts a turn when idle.
  const deliver = (text: string, notice: string, start = false): void => {
    const message = { customType: MESSAGE_TYPE, content: text, display: true };
    if (ctx && !ctx.isIdle()) {
      pi.sendMessage(message, { deliverAs: "steer" });
      return;
    }
    if (start) return void pi.sendMessage(message, { triggerTurn: true });
    pi.sendMessage(message, { deliverAs: "nextTurn" });
    if (ctx?.hasUI) ctx.ui.notify(`${notice} go to the agent with your next message.`, "info");
  };

  const edits = createEditSession(deps, (message, display) => deliver(message, `Your edits to ${display}`));

  const listed = (): PublishedDocument[] =>
    [...docs.values()].map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      display: entry.display,
      reason: entry.reason,
      revision: entry.revision,
      onScreen: entry.onScreen,
      ...(server && (entry.onScreen || entry.screen === "editor")
        ? { capability: server.capabilityOf(entry.id, entry.path), assets: server.assetsOf(entry.id) }
        : {}),
    }));
  const publish = (): void => void pi.events.emit(DOCUMENTS_EVENT, { version: CONTRACT_VERSION, documents: listed() });

  const closeServer = (): void => {
    const current = server;
    server = undefined;
    pages.clear();
    openedAt.clear();
    current?.close();
  };

  /** The user closed the last tab: browser pages leave the screen, and the server stops unless an editor document still lists a capability. */
  const onIdle = (): void => {
    let changed = false;
    for (const entry of docs.values()) {
      if (entry.screen !== "browser" || !entry.onScreen) continue;
      entry.onScreen = false;
      changed = true;
    }
    if (![...docs.values()].some((entry) => entry.screen === "editor")) closeServer();
    if (changed || !server) publish();
  };

  const pathOfDoc = (id: string): string | undefined => [...docs.values()].find((entry) => entry.id === id)?.path;
  const displayOf = (path: string): string => docs.get(path)?.display ?? basename(path);

  /** The server being started; two first uses at once share it, so only one server listens. */
  let starting: Promise<PageServer> | undefined;
  const ensureServer = async (): Promise<PageServer> => {
    if (server) return server;
    starting ??= deps
      .servePages({
        canServe: allow.canServe,
        pathOfDoc,
        displayOf,
        onAnswer: ({ answerId, answer, page }) => {
          const entry = page ? docs.get(page) : undefined;
          const result = decide(entry?.id, answerId, answer, true);
          return result.reason === undefined
            ? { accepted: result.accepted }
            : { accepted: result.accepted, reason: result.reason };
        },
        onIdle,
      })
      .then((started) => {
        server = started;
        return started;
      })
      .finally(() => {
        starting = undefined;
      });
    return starting;
  };

  /** Lists documents that were just opened: new ones get an id, known ones keep theirs. */
  const register = (group: { doc: Loaded; kind: DocKind }[], screen: "browser" | "editor", reason: string): void => {
    if (closed) return;
    for (const { doc, kind } of group) {
      const known = docs.get(doc.absolute);
      docs.delete(doc.absolute);
      docs.set(doc.absolute, {
        id: known?.id ?? deps.newId(),
        path: doc.absolute,
        kind,
        display: doc.display,
        reason,
        revision: known ? known.revision + (known.seen === doc.content ? 0 : 1) : 1,
        onScreen: true,
        seen: doc.content,
        screen,
      });
    }
    for (const oldest of docs.keys()) {
      if (docs.size <= MAX_DOCUMENTS) break;
      docs.delete(oldest);
    }
    publish();
  };

  /** A listed document whose file changed gets the next revision; one event covers all of them. */
  const bump = (paths: Iterable<string>): void => {
    let changed = false;
    for (const path of paths) {
      const entry = docs.get(path);
      const content = entry && deps.readFile(path);
      if (!entry || content === undefined || content === entry.seen) continue;
      entry.revision += 1;
      entry.seen = content;
      changed = true;
    }
    if (changed) publish();
  };

  /** Reloads the pages whose content changed since the server last rendered them. */
  const reloadPages = (paths: Iterable<string>): void => {
    for (const path of paths) {
      const before = pages.get(path);
      const content = deps.readFile(path);
      if (before === undefined || content === undefined || content === before) continue;
      pages.set(path, content);
      server?.reload(path);
    }
  };

  /** Decides one answer, from a page or from the bus, and delivers it unless it was seen before. */
  function decide(
    id: string | undefined,
    answerId: string,
    raw: unknown,
    fromPage = false,
    version?: unknown,
  ): { accepted: boolean; reason?: string } {
    const remembered = answers.get(answerId);
    // A repeated answerId never delivers again; it gets the first result back.
    if (remembered) return remembered.id === id ? remembered.result : { accepted: false, reason: "invalid" };
    const outcome = ((): { accepted: boolean; reason?: string } => {
      const answer: Answer | undefined = parseAnswer(raw);
      if ((!fromPage && version !== CONTRACT_VERSION) || !answer) return { accepted: false, reason: "invalid" };
      const entry = id === undefined ? undefined : [...docs.values()].find((doc) => doc.id === id);
      if (!fromPage && !entry) return { accepted: false, reason: "closed" };
      if (entry?.kind === "text") return { accepted: false, reason: "invalid" };
      // An answer without fields never reaches the agent.
      if (answer.fields.length === 0) return { accepted: false, reason: "empty" };
      try {
        // A page the agent wrote runs its own script, so its sends are not a user's click; the agent is told which.
        const text = encodeAnswer(answer);
        deliver(entry?.kind === "html" ? `Agent page ${entry.display} sent:\n${text}` : text, "Your answer", true);
      } catch (error) {
        return { accepted: false, reason: `delivery failed: ${(error as Error).message}` };
      }
      return { accepted: true };
    })();
    answers.set(answerId, { id, result: outcome });
    for (const oldest of answers.keys()) {
      if (answers.size <= MAX_REMEMBERED_ANSWERS) break;
      answers.delete(oldest);
    }
    return outcome;
  }

  /** An answer from another viewer, with its result on `better-show:answer-result`. */
  const onAnswer = (data: unknown): void => {
    if (typeof data !== "object" || data === null) return;
    const { version, id, answerId, answer } = data as Record<string, unknown>;
    if (typeof id !== "string" || typeof answerId !== "string") return;
    const result = decide(id, answerId, answer, false, version);
    const reply: AnswerResult = { version: CONTRACT_VERSION, id, answerId, accepted: result.accepted };
    if (result.reason !== undefined) reply.reason = result.reason;
    pi.events.emit(ANSWER_RESULT_EVENT, reply);
  };

  /** A viewer that started late asks for the list: it is sent again as it stands, changing nothing else. */
  const onRequest = (data: unknown): void => {
    if (closed || typeof data !== "object" || data === null) return;
    if ((data as Record<string, unknown>).version !== CONTRACT_VERSION) return;
    publish();
  };

  /** How a file outside the working directory is named: below the home directory by a `~` path, else by its base name, never an absolute path. */
  const outside = (absolute: string): string => {
    const fromHome = relative(deps.realpath(homedir()), absolute);
    return fromHome.startsWith("..") || isAbsolute(fromHome) ? basename(absolute) : join("~", fromHome);
  };

  const nameFor = (cwd: string, absolute: string): string => {
    const rel = relative(deps.realpath(cwd), absolute);
    return rel.startsWith("..") ? outside(absolute) : rel;
  };

  const load = (cwd: string, path: string): Loaded => {
    if (/[\n\r]/.test(path)) throw new Error(`cannot open a path containing a line break: ${JSON.stringify(path)}`);
    const absolute = deps.realpath(isAbsolute(path) ? path : resolve(cwd, path));
    const content = deps.readFile(absolute);
    if (content === undefined) throw new Error(`cannot read ${path}`);
    return { absolute, content, display: nameFor(cwd, absolute) };
  };

  /** What is wrong with the blocks of a Markdown text, worded for the agent; a failure of the check itself is reported, not hidden. */
  const problemsIn = async (display: string, content: string): Promise<string | undefined> => {
    try {
      return await checkText(display, content);
    } catch (error) {
      return `Block check of ${display} failed: ${(error as Error).message}`;
    }
  };

  /** The block problems of a Markdown file the agent just wrote, or undefined. */
  const problemsOfFile = async (cwd: string, absolute: string): Promise<string | undefined> => {
    if (!MARKDOWN_FILE.test(absolute)) return undefined;
    const content = deps.readFile(absolute);
    return content === undefined
      ? undefined
      : problemsIn(docs.get(absolute)?.display ?? nameFor(cwd, absolute), content);
  };

  /** Opens pages in the default browser; a page whose tab the user closed opens again. */
  const showPages = async (group: Loaded[]): Promise<Loaded[]> => {
    const running = await ensureServer();
    for (const doc of group) allow.add(doc.absolute);
    const isClosed = (path: string): boolean =>
      !running.isOpen(path) && deps.now() - (openedAt.get(path) ?? -Infinity) >= PAGE_OPEN_WAIT_MS;
    const fresh = group.filter((doc) => !pages.has(doc.absolute) || isClosed(doc.absolute));
    for (const doc of fresh) pages.delete(doc.absolute);
    reloadPages(group.map((doc) => doc.absolute));
    for (const doc of fresh) {
      // Each page counts as open once it is, so a failure part way leaves no page to open twice.
      running.touch();
      deps.openUrl(running.urlOf(doc.absolute));
      openedAt.set(doc.absolute, deps.now());
      pages.set(doc.absolute, doc.content);
    }
    return fresh;
  };

  const show = async (cwd: string, paths: string[], reason: string, view: View = "edit"): Promise<ShowResult> => {
    const loaded = paths.map((path) => load(cwd, path));
    const asPage = (doc: Loaded): boolean =>
      isFile(doc.absolute, HTML_FILE, IMAGE_FILE) ||
      (view === "page" && isFile(doc.absolute, MARKDOWN_FILE, REACT_FILE));
    const texts = loaded.filter((doc) => !asPage(doc));
    const browsed = loaded.filter(asPage);
    if (view === "page" && texts.length > 0) {
      throw new Error(
        `view "page" renders Markdown, React (.tsx, .jsx), HTML, and images; open ${texts.map((doc) => doc.display).join(", ")} with view "edit"`,
      );
    }
    // A NUL byte marks a binary file, which an editor would show as bytes; nothing opens when one is asked for.
    const binary = texts.filter((doc) => doc.content.includes("\0"));
    if (binary.length > 0) {
      throw new Error(
        `cannot show binary files: ${binary.map((doc) => doc.display).join(", ")}; show_doc opens text, HTML, and images (png, jpg, gif, webp, bmp, svg)`,
      );
    }
    const list = (group: Loaded[]): string => group.map((doc) => doc.display).join(", ");
    const opened: string[] = [];
    if (browsed.length > 0) {
      await showPages(browsed);
      // Images stay off the bus: its contract lists pages and text documents only.
      const listedPages = browsed.filter((doc) => !IMAGE_FILE.test(doc.absolute));
      register(
        listedPages.map((doc) => ({ doc, kind: MARKDOWN_FILE.test(doc.absolute) ? "blocks" : "html" })),
        "browser",
        reason,
      );
      opened.push(`${list(browsed)} in the default browser (one tab per page)`);
    }
    if (texts.length > 0) {
      await ensureServer();
      for (const doc of texts) allow.add(doc.absolute);
      const editor = await edits.open(texts.map((doc) => doc.absolute));
      for (const doc of texts) {
        edits.watch(doc.absolute, doc.display, doc.content, (error) => {
          if (ctx?.hasUI) ctx.ui.notify(`better-show: ${error.message}`, "error");
        });
      }
      register(
        texts.map((doc) => ({ doc, kind: "text" })),
        "editor",
        reason,
      );
      opened.push(`${list(texts)} in ${editor}`);
    }
    const feedback = texts.length > 0 ? " Their saved edits will reach you as review feedback." : "";
    const checks = (
      await Promise.all(
        loaded.filter((doc) => MARKDOWN_FILE.test(doc.absolute)).map((doc) => problemsIn(doc.display, doc.content)),
      )
    ).filter((found): found is string => found !== undefined);
    const problems = checks.map((found) => `\n\n${found}`).join("");
    return {
      opened: loaded.map((doc) => doc.display),
      text: `Opened ${opened.join(" and ")} and returned without waiting for the user.${feedback}${problems}`,
    };
  };

  /** The Mini SDD files to open after the agent wrote `path`, or none. */
  const miniSddFollowUp = (path: string): string[] => {
    if (docs.has(path) || !MINI_SDD_FILE.test(path)) return [];
    const folder = dirname(path);
    if ([...docs.keys()].some((open) => dirname(open) === folder)) return [path];
    if (basename(path) !== "spec.md" || !PROPOSED_STATUS.test(deps.readFile(path) ?? "")) return [];
    return MINI_SDD_PHASES.map((phase) => join(folder, phase)).filter(
      (phasePath) => deps.readFile(phasePath) !== undefined,
    );
  };

  /** After the agent changed a shown document, the pages reload it and the version the agent saw is the new one. */
  const agentWrote = (id: string, path: string | undefined): void => {
    edits.wrote(id);
    if (path === undefined) {
      reloadPages([...pages.keys()]);
      server?.refreshFrames();
      bump(docs.keys());
      return;
    }
    reloadPages([path]);
    server?.refreshFrames();
    bump([path]);
  };

  /** The agent is about to write: a change the watcher sees until the result arrives is not the user's. */
  const agentWillWrite = (id: string, path: string | undefined): void => edits.willWrite(id, path);

  /** A turn or run ended: tool calls that never ended no longer hold back the user's saves. */
  const agentSettled = (): void => edits.settle();

  const shutdown = (): void => {
    closed = true;
    docs.clear();
    answers.clear();
    edits.close();
    allow.clear();
    closeServer();
    pi.events.emit(DOCUMENTS_EVENT, { version: CONTRACT_VERSION, documents: [] });
  };

  return {
    show,
    problemsOfFile,
    docs,
    pages,
    edits,
    onAnswer,
    onRequest,
    miniSddFollowUp,
    agentWrote,
    agentWillWrite,
    agentSettled,
    shutdown,
    setContext: (next: ExtensionContext) => {
      ctx = next;
    },
    get server() {
      return server;
    },
  };
}

export type BetterShow = ReturnType<typeof createBetterShow>;
export { ANSWER_EVENT, DOCUMENTS_REQUEST_EVENT };
