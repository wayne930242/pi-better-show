import { statSync } from "node:fs";
import { win32 } from "node:path";

/** Platform details the extension needs from the operating system: the browser opener, the PATH lookup, the fallback text editor. */

type Env = Record<string, string | undefined>;

/** A Windows program under `%SystemRoot%`, by absolute path, so that a `rundll32` or `notepad` earlier on PATH (Git for Windows puts its own tools there) is never the one run. */
export const systemProgram = (env: Env, ...parts: string[]): string =>
  win32.join(env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows", ...parts);

/**
 * The command that opens a URL in the default browser. On Windows it is `rundll32 url.dll,FileProtocolHandler`, which takes the URL as one
 * argument with no shell in between, so `&` and `%` in a query reach the browser as written (`cmd /c start` would parse them), and exits 0.
 */
export function urlOpener(
  platform: string,
  env: Env = process.env,
): [command: string, args: (url: string) => string[]] {
  if (platform === "darwin") return ["open", (url) => [url]];
  if (platform === "win32")
    return [systemProgram(env, "System32", "rundll32.exe"), (url) => ["url.dll,FileProtocolHandler", url]];
  return ["xdg-open", (url) => [url]];
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * Whether `command` names a program on PATH. On Windows the PATH is scanned with each `PATHEXT` extension (a name that has one is tried as
 * it is too), with no shell: a desk machine need not have `sh`. Elsewhere `sh -c 'command -v'` answers, as it did before.
 */
export function onPath(
  command: string,
  platform: string,
  env: Env = process.env,
  exists: (path: string) => boolean = isFile,
  shell: (command: string) => boolean = () => false,
): boolean {
  if (platform !== "win32") return shell(command);
  const path = env.PATH ?? env.Path ?? "";
  const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((ext) => ext !== "");
  const names = /\.[^\\/.]+$/.test(command) ? [command] : extensions.map((ext) => command + ext.toLowerCase());
  if (/[\\/]/.test(command)) return names.some((name) => exists(name));
  const dirs = path.split(";").filter((dir) => dir !== "");
  return dirs.some((dir) => names.some((name) => exists(win32.join(dir, name))));
}

/** The text editor a Windows machine always has, for edit mode when neither PI_BETTER_SHOW_EDITOR nor VS Code is there; it opens one file per window. */
export const windowsTextEditor = (env: Env = process.env): string => systemProgram(env, "notepad.exe");

/**
 * `git diff --no-index` output with git's own header lines taken out, so that what is left reads like `diff -U0` without `--label`: the
 * `@@` hunks and their lines. The `---` and `+++` lines go too; the caller names the file itself. Git writes the line before a hunk after its
 * header (`@@ -2 +2 @@ one`); that context is dropped, as `diff` has none.
 */
export function gitDiffHunks(stdout: string): string {
  const lines = stdout.split("\n");
  const first = lines.findIndex((line) => line.startsWith("@@"));
  if (first === -1) return "";
  return lines
    .slice(first)
    .map((line) => (line.startsWith("@@") ? line.replace(/^(@@ [^@]* @@).*$/, "$1") : line))
    .join("\n");
}
