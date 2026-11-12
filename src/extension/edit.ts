import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { gitDiffHunks, windowsTextEditor } from "./system.ts";

/** Edit mode (D7): the user's own editor, no terminal pane. Saves are noticed by watching the file. */

export const EDITOR_ENV = "PI_BETTER_SHOW_EDITOR";
export const MAX_DIFF_CHARS = 20_000;
/** A reported diff keeps at most this many lines. */
export const MAX_DIFF_LINES = 200;
/** While the agent works, edits are reported once the user stopped saving for this long. */
export const SETTLE_MS = 3000;
export const WATCH_MS = 500;

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface EditDeps {
  /** The editor command the user chose, if any. */
  editor: string | undefined;
  onPath: (command: string) => boolean;
  /** Starts an editor and resolves once it started; it must not wait for the editor to exit. */
  launch: (command: string, args: string[]) => Promise<void>;
  /** Runs a short command to its end (`open`, `diff`). */
  run: (command: string, args: string[]) => RunResult;
  platform: string;
  readFile: (path: string) => string | undefined;
  writeFile: (path: string, content: string) => void;
  makeDir: () => string;
  removeDir: (dir: string) => void;
  watch: (path: string, onChange: () => void) => () => void;
}

export const defaultRun = (command: string, args: string[]): RunResult => {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") };
};

export const defaultLaunch = (command: string, args: string[]): Promise<void> =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", fail);
    child.once("spawn", () => {
      child.unref();
      done();
    });
  });

/**
 * Splits a command line into words, honouring single and double quotes and backslash escapes; no expansion happens. With `windows`, a
 * backslash is an ordinary character, so `"C:\\Program Files\\Editor\\editor.exe" -w` keeps its path.
 */
export function shellWords(line: string, windows = false): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  let started = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index] as string;
    if (quote) {
      if (char === quote) quote = undefined;
      else if (!windows && char === "\\" && quote === '"' && index + 1 < line.length) word += line[++index];
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (!windows && char === "\\" && index + 1 < line.length) {
      word += line[++index];
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote) throw new Error(`unterminated quote in ${EDITOR_ENV}`);
  if (started) words.push(word);
  return words;
}

/** The user's edits as zero-context hunks: the `@@` headers carry the line numbers. A long diff keeps its first lines and says how many it left out. */
export function feedbackMessage(display: string, diff: string, duringShell = false): string {
  const lines = diff.split("\n").filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "));
  if (lines.at(-1) === "") lines.pop();
  const kept = lines.slice(0, MAX_DIFF_LINES).join("\n");
  const body = kept.slice(0, MAX_DIFF_CHARS);
  const left = lines.length - Math.min(lines.length, MAX_DIFF_LINES);
  const more = left > 0 ? `: ${left} more diff line${left === 1 ? "" : "s"}` : "";
  const cut = left > 0 || body.length < kept.length ? `\n… (truncated${more}; read ${display})` : "";
  const head = duringShell
    ? `${display} changed while a shell command ran; this may include the command's own changes, not only the user's edits:`
    : `User edited ${display}:`;
  return `${head}\n\`\`\`diff\n${body}${cut}\n\`\`\``;
}

interface Watched {
  display: string;
  /** The content the agent last saw: the baseline of the next report. */
  snapshot: string;
  /** Part of the change not yet reported came while a shell command ran. */
  duringShell: boolean;
  stop: () => void;
  onError: (error: Error) => void;
}

/** A tool call that may write: `path` is undefined for a shell command, which may touch any shown file and keeps what each held when it began. */
interface Active {
  path: string | undefined;
  before: Map<string, string>;
}

export interface EditEvents {
  /** A shown file changed in a way the agent has not seen; it waits for `take`. Called on every such change. */
  changed: (display: string) => void;
  /** The agent is about to write a file whose unreported change it must see first: deliver this at once. */
  urgent: (message: string) => void;
}

/**
 * Watches the documents opened in the user's editor and keeps what changed since the agent last saw each one.
 * Saves are not reported one by one: `take` reports the net change of every file since the last report, once,
 * so intermediate states never reach the agent and a change undone before the report sends nothing.
 */
export function createEditSession(deps: EditDeps, events: EditEvents) {
  const watched = new Map<string, Watched>();
  /**
   * Tool calls running now, by tool call id: a change seen meanwhile is the agent's. They are keyed by id so a call
   * that never ends (aborted, or blocked after it was announced) is released by `settle` instead of silencing every save.
   */
  const active = new Map<string, Active>();
  let scratch: string | undefined;

  /** Opens the paths in the user's editor: the chosen command, else VS Code, else the system's text editor. */
  async function open(paths: string[]): Promise<string> {
    if (deps.editor) {
      const [command, ...args] = shellWords(deps.editor, deps.platform === "win32");
      if (!command) throw new Error(`${EDITOR_ENV} is empty`);
      if (!deps.onPath(command)) throw new Error(`${EDITOR_ENV}=${deps.editor}, but ${command} is not on PATH`);
      await deps.launch(command, [...args, ...paths]);
      return deps.editor;
    }
    if (deps.onPath("code")) {
      await deps.launch("code", paths);
      return "VS Code";
    }
    if (deps.platform === "win32") {
      // Notepad, by absolute path, is on every Windows machine; it opens one file per window.
      const notepad = windowsTextEditor();
      for (const path of paths) await deps.launch(notepad, [path]);
      return "Notepad";
    }
    const [command, args] =
      deps.platform === "darwin" ? (["open", ["-t", ...paths]] as const) : (["xdg-open", paths] as const);
    if (!deps.onPath(command)) throw new Error(`edit mode needs ${EDITOR_ENV}, VS Code (code), or ${command} on PATH`);
    if (command === "xdg-open") {
      for (const path of paths) {
        const result = deps.run(command, [path]);
        if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
      }
    } else {
      const result = deps.run(command, [...args]);
      if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    return "the system text editor";
  }

  /**
   * Zero-context hunks from `before` to `after`. `diff` when it is on PATH; on Windows without it (Git for Windows keeps `diff` out of the
   * PATH it adds), `git diff --no-index`, whose header lines are taken out. Both exit 1 when the files differ.
   */
  function diffOf(before: string, after: string, display: string): string {
    if (deps.platform === "win32" && !deps.onPath("diff")) {
      const git = deps.run("git", [
        "-c",
        "core.autocrlf=false",
        "-c",
        "core.safecrlf=false",
        "diff",
        "--no-index",
        "--no-color",
        "--no-ext-diff",
        "-U0",
        "--",
        before,
        after,
      ]);
      if (git.status !== 0 && git.status !== 1)
        throw new Error(`git diff failed: ${(git.stderr || git.stdout).trim()}`);
      return gitDiffHunks(git.stdout);
    }
    const diff = deps.run("diff", ["-U0", "--label", `a/${display}`, "--label", `b/${display}`, before, after]);
    if (diff.status !== 0 && diff.status !== 1) throw new Error(`diff failed: ${diff.stderr.trim()}`);
    return diff.stdout;
  }

  const paused = (path: string): boolean =>
    [...active.values()].some((call) => call.path === undefined || call.path === path);

  /** The diff of a file from what the agent saw to `content`, as a message section; the agent has now seen `content`. */
  function report(doc: Watched, content: string): string {
    scratch ??= deps.makeDir();
    const before = join(scratch, "before");
    const after = join(scratch, "after");
    deps.writeFile(before, doc.snapshot);
    // The content read, not the file: a save landing between the read and the diff waits for the next report.
    deps.writeFile(after, content);
    const section = feedbackMessage(doc.display, diffOf(before, after, doc.display), doc.duringShell);
    doc.snapshot = content;
    doc.duringShell = false;
    return section;
  }

  /** The net change of each file (of `only`, when given) since the agent last saw it, in one message; undefined when nothing changed. */
  function take(only?: string): string | undefined {
    const sections: string[] = [];
    for (const [path, doc] of watched) {
      if ((only !== undefined && path !== only) || paused(path)) continue;
      const content = deps.readFile(path);
      if (content === undefined) continue;
      if (content === doc.snapshot) {
        doc.duringShell = false;
        continue;
      }
      try {
        sections.push(report(doc, content));
      } catch (error) {
        doc.snapshot = content;
        doc.duringShell = false;
        doc.onError(error as Error);
      }
    }
    return sections.length > 0 ? sections.join("\n\n") : undefined;
  }

  function onChange(path: string): void {
    const doc = watched.get(path);
    if (!doc || paused(path)) return;
    const content = deps.readFile(path);
    if (content === undefined || content === doc.snapshot) return;
    events.changed(doc.display);
  }

  /** A call ended: a write or edit's result is the version the agent saw; a shell command's window joins what waits to be reported. */
  function release(id: string): void {
    const call = active.get(id);
    if (!call) return;
    active.delete(id);
    for (const [path, doc] of watched) {
      if (call.path !== undefined && call.path !== path) continue;
      const content = deps.readFile(path);
      if (content === undefined) continue;
      if (call.path !== undefined) {
        doc.snapshot = content;
        doc.duringShell = false;
        continue;
      }
      // Measured against what the agent last saw, so a save the watcher had not seen yet still counts, and a
      // second shell command ending on the same change adds nothing. The label says whether the change came while
      // the command ran.
      if (content === doc.snapshot) continue;
      const began = call.before.get(path);
      if (began === undefined || content !== began) doc.duringShell = true;
      events.changed(doc.display);
    }
  }

  return {
    open,
    take,
    /** Starts watching a document; a document already watched keeps the version the agent saw. */
    watch(path: string, display: string, content: string, onError: (error: Error) => void): void {
      const known = watched.get(path);
      if (known) {
        known.display = display;
        return;
      }
      const stop = deps.watch(path, () => {
        try {
          onChange(path);
        } catch (error) {
          onError(error as Error);
        }
      });
      watched.set(path, { display, snapshot: content, duringShell: false, stop, onError });
    },
    has: (path: string): boolean => watched.has(path),
    /**
     * The tool call `id` is about to write `path` (or run a shell command, when `path` is undefined). Before a write
     * or edit replaces the version the agent saw, the user's unreported change to that file goes out at once.
     */
    willWrite(id: string, path: string | undefined): void {
      const before = new Map<string, string>();
      if (path === undefined) {
        for (const watchedPath of watched.keys()) {
          const content = deps.readFile(watchedPath);
          if (content !== undefined) before.set(watchedPath, content);
        }
      } else if (watched.has(path)) {
        const message = take(path);
        if (message) events.urgent(message);
      }
      active.set(id, { path, before });
    },
    /** The tool call `id` finished. */
    wrote: release,
    /** The turn or run ended: calls that never reported an end are released. */
    settle(): void {
      for (const id of [...active.keys()]) release(id);
    },
    close(): void {
      for (const doc of watched.values()) doc.stop();
      watched.clear();
      active.clear();
      if (scratch) deps.removeDir(scratch);
      scratch = undefined;
    },
    /** For tests: the watched paths. */
    paths: (): string[] => [...watched.keys()],
  };
}

export type EditSession = ReturnType<typeof createEditSession>;
