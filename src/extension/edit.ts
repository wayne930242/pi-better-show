import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

/** Edit mode (D7): the user's own editor, no terminal pane. Saves are noticed by watching the file. */

export const EDITOR_ENV = "PI_BETTER_SHOW_EDITOR";
export const MAX_DIFF_CHARS = 20_000;
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

/** Splits a command line into words, honouring single and double quotes and backslash escapes; no expansion happens. */
export function shellWords(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  let started = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index] as string;
    if (quote) {
      if (char === quote) quote = undefined;
      else if (char === "\\" && quote === '"' && index + 1 < line.length) word += line[++index];
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\" && index + 1 < line.length) {
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

/** The user's edits as zero-context hunks: the `@@` headers carry the line numbers. */
export function feedbackMessage(display: string, diff: string, duringShell = false): string {
  const hunks = diff
    .split("\n")
    .filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "))
    .join("\n");
  const body =
    hunks.length > MAX_DIFF_CHARS ? `${hunks.slice(0, MAX_DIFF_CHARS)}\n… (truncated; read ${display})\n` : hunks;
  const head = duringShell
    ? `${display} changed while a shell command ran; this may include the command's own changes, not only the user's edits:`
    : `User edited ${display}:`;
  return `${head}\n\`\`\`diff\n${body}\`\`\``;
}

interface Watched {
  display: string;
  /** The content the agent last saw. */
  snapshot: string;
  stop: () => void;
  onError: (error: Error) => void;
}

/** A tool call that may write: `path` is undefined for a shell command, which may touch any shown file and keeps what each held when it began. */
interface Active {
  path: string | undefined;
  before: Map<string, string>;
}

export function createEditSession(deps: EditDeps, onEdit: (message: string, display: string) => void) {
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
      const [command, ...args] = shellWords(deps.editor);
      if (!command) throw new Error(`${EDITOR_ENV} is empty`);
      if (!deps.onPath(command)) throw new Error(`${EDITOR_ENV}=${deps.editor}, but ${command} is not on PATH`);
      await deps.launch(command, [...args, ...paths]);
      return deps.editor;
    }
    if (deps.onPath("code")) {
      await deps.launch("code", paths);
      return "VS Code";
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

  const paused = (path: string): boolean =>
    [...active.values()].some((call) => call.path === undefined || call.path === path);

  /** Reports how `path` went from `from` to `content`, and makes `content` the version the agent saw. */
  function report(path: string, doc: Watched, from: string, content: string, duringShell: boolean): void {
    scratch ??= deps.makeDir();
    const before = join(scratch, "before");
    deps.writeFile(before, from);
    const diff = deps.run("diff", ["-U0", "--label", `a/${doc.display}`, "--label", `b/${doc.display}`, before, path]);
    if (diff.status !== 0 && diff.status !== 1) throw new Error(`diff failed: ${diff.stderr.trim()}`);
    doc.snapshot = content;
    onEdit(feedbackMessage(doc.display, diff.stdout, duringShell), doc.display);
  }

  function onChange(path: string): void {
    const doc = watched.get(path);
    if (!doc || paused(path)) return;
    const content = deps.readFile(path);
    if (content === undefined || content === doc.snapshot) return;
    report(path, doc, doc.snapshot, content, false);
  }

  /** A call ended: the version the agent saw is what is on disk now, except that a shell command's window reports what changed in it. */
  function release(id: string): void {
    const call = active.get(id);
    if (!call) return;
    active.delete(id);
    for (const [path, doc] of watched) {
      if (call.path !== undefined && call.path !== path) continue;
      const content = deps.readFile(path);
      if (content === undefined) continue;
      // Measured against what the agent last saw, so a save the watcher had not seen yet still counts, and a
      // second shell command ending on the same change reports nothing again. The label says whether the change
      // came while the command ran.
      const began = call.before.get(path);
      if (call.path === undefined && content !== doc.snapshot) {
        try {
          report(path, doc, doc.snapshot, content, began === undefined || content !== began);
        } catch (error) {
          doc.snapshot = content;
          doc.onError(error as Error);
        }
      } else doc.snapshot = content;
    }
  }

  return {
    open,
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
      watched.set(path, { display, snapshot: content, stop, onError });
    },
    has: (path: string): boolean => watched.has(path),
    /** The tool call `id` is about to write `path` (or run a shell command, when `path` is undefined). */
    willWrite(id: string, path: string | undefined): void {
      const before = new Map<string, string>();
      if (path === undefined) {
        for (const watchedPath of watched.keys()) {
          const content = deps.readFile(watchedPath);
          if (content !== undefined) before.set(watchedPath, content);
        }
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
