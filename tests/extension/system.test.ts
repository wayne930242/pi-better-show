import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitDiffHunks, onPath, systemProgram, urlOpener, windowsTextEditor } from "../../src/extension/system.ts";

describe("urlOpener", () => {
  const url = "http://127.0.0.1:4321/doc?a=1&b=%20x";

  test("macOS and Linux keep open and xdg-open", () => {
    const [mac, macArgs] = urlOpener("darwin");
    expect([mac, macArgs(url)]).toEqual(["open", [url]]);
    const [linux, linuxArgs] = urlOpener("linux");
    expect([linux, linuxArgs(url)]).toEqual(["xdg-open", [url]]);
  });

  test("Windows runs rundll32 from SystemRoot with the URL as one argument, untouched", () => {
    const [command, args] = urlOpener("win32", { SystemRoot: "D:\\Win" });
    expect(command).toBe("D:\\Win\\System32\\rundll32.exe");
    expect(args(url)).toEqual(["url.dll,FileProtocolHandler", url]);
  });

  test("a missing SystemRoot falls back to C:\\Windows", () => {
    expect(systemProgram({}, "notepad.exe")).toBe("C:\\Windows\\notepad.exe");
    expect(windowsTextEditor({ SystemRoot: "C:\\W" })).toBe("C:\\W\\notepad.exe");
  });
});

describe("onPath", () => {
  const files = new Set(["C:\\Git\\cmd\\git.exe", "C:\\Tools\\code.cmd", "C:\\Tools\\plain"]);
  const exists = (path: string) => files.has(path);
  const env = { PATH: "C:\\Git\\cmd;;C:\\Tools", PATHEXT: ".COM;.EXE;.BAT;.CMD" };

  test("Windows scans PATH with each PATHEXT extension, without a shell", () => {
    const shell = () => {
      throw new Error("no shell on Windows");
    };
    expect(onPath("git", "win32", env, exists, shell)).toBe(true);
    expect(onPath("code", "win32", env, exists, shell)).toBe(true);
    expect(onPath("diff", "win32", env, exists, shell)).toBe(false);
    expect(onPath("plain", "win32", env, exists, shell)).toBe(false);
    expect(onPath("git.exe", "win32", env, exists, shell)).toBe(true);
  });

  test("Windows reads Path when PATH is absent, and a path with a slash is checked as it is", () => {
    expect(onPath("git", "win32", { Path: "C:\\Git\\cmd" }, exists)).toBe(true);
    expect(onPath("C:\\Tools\\code.cmd", "win32", env, exists)).toBe(true);
  });

  test("other systems ask the shell", () => {
    const asked: string[] = [];
    expect(onPath("diff", "linux", env, exists, (name) => asked.push(name) > 0)).toBe(true);
    expect(asked).toEqual(["diff"]);
  });
});

describe("gitDiffHunks", () => {
  test("drops git's header lines and keeps the hunks", () => {
    const out = "diff --git a/x b/y\nindex 1..2 100644\n--- a/x\n+++ b/y\n@@ -2 +2 @@ one\n-two\n+TWO\n";
    expect(gitDiffHunks(out)).toBe("@@ -2 +2 @@\n-two\n+TWO\n");
    expect(gitDiffHunks("")).toBe("");
  });

  const hasGit = spawnSync("git", ["--version"]).status === 0 && spawnSync("diff", ["--version"]).status === 0;
  test.skipIf(!hasGit)("gives the same hunks as diff -U0 for the same two files", () => {
    const dir = mkdtempSync(join(tmpdir(), "pbs-system-"));
    const before = join(dir, "before");
    const after = join(dir, "after");
    writeFileSync(before, "one\ntwo\nthree\nfour\n");
    writeFileSync(after, "one\nTWO\nthree\nfour\nfive\n");
    const git = spawnSync("git", ["diff", "--no-index", "--no-color", "--no-ext-diff", "-U0", "--", before, after], {
      encoding: "utf8",
    });
    const diff = spawnSync("diff", ["-U0", "--label", "a", "--label", "b", before, after], { encoding: "utf8" });
    expect(git.status).toBe(1);
    const hunks = (text: string) =>
      text.split("\n").filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "));
    expect(hunks(gitDiffHunks(git.stdout))).toEqual(hunks(diff.stdout));
  });
});
