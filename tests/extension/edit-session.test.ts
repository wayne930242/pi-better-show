import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditSession, defaultRun } from "../../src/extension/edit.ts";

/** A session over real files and the real `diff` (`git diff --no-index` as `win32`), with no watcher: tests save the files and take reports by hand. */
function session(platform = "darwin") {
  const dir = mkdtempSync(join(tmpdir(), "pbs-edit-"));
  const path = join(dir, "spec.md");
  const other = join(dir, "notes.md");
  writeFileSync(path, "one\n");
  writeFileSync(other, "alpha\nbeta\n");
  const watchers = new Map<string, () => void>();
  /** Messages sent: what `take` returned, and what went out at once before an agent's write. */
  const sent: string[] = [];
  const changed: string[] = [];
  const edits = createEditSession(
    {
      editor: undefined,
      onPath: () => false,
      launch: async () => {},
      run: defaultRun,
      platform,
      readFile: (file) => {
        try {
          return readFileSync(file, "utf8");
        } catch {
          return undefined;
        }
      },
      writeFile: (file, content) => writeFileSync(file, content),
      makeDir: () => mkdtempSync(join(tmpdir(), "pbs-edit-scratch-")),
      removeDir: (scratch) => rmSync(scratch, { recursive: true, force: true }),
      watch: (file, onChange) => {
        watchers.set(file, onChange);
        return () => watchers.delete(file);
      },
    },
    { changed: (display) => changed.push(display), urgent: (message) => sent.push(message) },
  );
  const fail = (error: Error) => {
    throw error;
  };
  edits.watch(path, "spec.md", "one\n", fail);
  edits.watch(other, "notes.md", "alpha\nbeta\n", fail);
  /** The user's editor saves `file`, and the watcher notices. */
  const save = (file: string, content: string) => {
    writeFileSync(file, content);
    watchers.get(file)?.();
  };
  /** The next report, as a run start delivers it. */
  const take = () => {
    const message = s.edits.take();
    if (message) sent.push(message);
    return message;
  };
  const s = {
    path,
    other,
    sent,
    changed,
    edits,
    save,
    take,
    done: () => {
      edits.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return s;
}

describe("edit session on Windows", () => {
  test("without diff on PATH, git diff --no-index gives the same report", () => {
    const mac = session();
    const win = session("win32");
    for (const s of [mac, win]) s.save(s.path, "one\ntwo\n");
    const [a, b] = [mac.take(), win.take()];
    expect(a).toContain("@@");
    expect(b).toBe(a);
    mac.done();
    win.done();
  });
});

describe("edit session coalescing", () => {
  test("many saves of one file report once, as the diff from what the agent saw to the final content", () => {
    const s = session();
    let text = "one\n";
    for (const word of ["t", "tw", "two", "two ", "two l", "two li", "two lin", "two line", "two lines"]) {
      text = `one\n${word}\n`;
      s.save(s.path, text);
    }
    expect(s.changed.length).toBe(9);
    expect(s.sent).toEqual([]);
    expect(s.take()).toBe("User edited spec.md:\n```diff\n@@ -1,0 +2 @@\n+two lines\n```");
    expect(s.sent.length).toBe(1);
    // Nothing more to report until the next change, which is measured from the version just reported.
    expect(s.take()).toBeUndefined();
    s.save(s.path, `${text}three\n`);
    expect(s.take()).toBe("User edited spec.md:\n```diff\n@@ -2,0 +3 @@\n+three\n```");
    s.done();
  });

  test("saves of two files report once, one section per file", () => {
    const s = session();
    for (let round = 1; round <= 5; round++) {
      s.save(s.path, `one\nround ${round}\n`);
      s.save(s.other, `alpha\nbeta ${round}\n`);
    }
    expect(s.take()).toBe(
      "User edited spec.md:\n```diff\n@@ -1,0 +2 @@\n+round 5\n```\n\n" +
        "User edited notes.md:\n```diff\n@@ -2 +2 @@\n-beta\n+beta 5\n```",
    );
    expect(s.sent.length).toBe(1);
    s.done();
  });

  test("edits undone before the report send nothing", () => {
    const s = session();
    s.save(s.path, "one\ntypo\n");
    s.save(s.path, "one\nty\n");
    s.save(s.path, "one\n");
    s.save(s.other, "alpha\n");
    s.save(s.other, "alpha\nbeta\n");
    expect(s.take()).toBeUndefined();
    expect(s.sent).toEqual([]);
    s.done();
  });

  test("before the agent writes a file, the user's unreported change to it goes out at once, and only that file's", () => {
    const s = session();
    s.save(s.path, "one\nuser\n");
    s.save(s.other, "alpha\nbeta\ngamma\n");
    s.edits.willWrite("e1", s.path);
    expect(s.sent).toEqual(["User edited spec.md:\n```diff\n@@ -1,0 +2 @@\n+user\n```"]);
    writeFileSync(s.path, "one\nuser\nagent\n");
    s.edits.wrote("e1");
    // The agent's own write is not reported; the other file still waits.
    expect(s.take()).toBe("User edited notes.md:\n```diff\n@@ -2,0 +3 @@\n+gamma\n```");
    s.done();
  });
});

describe("edit session around shell commands", () => {
  test("two shell commands running at once report one save once", () => {
    const s = session();
    s.edits.willWrite("b1", undefined);
    s.edits.willWrite("b2", undefined);
    writeFileSync(s.path, "one\ntwo\n");
    s.edits.wrote("b1");
    s.edits.wrote("b2");
    s.take();
    expect(s.sent.length).toBe(1);
    s.done();
  });

  test("a save the watcher had not seen when a shell command began is still reported, as the user's edit", () => {
    const s = session();
    writeFileSync(s.path, "one\nsaved\n");
    s.edits.willWrite("b1", undefined);
    s.edits.wrote("b1");
    s.take();
    expect(s.sent.length).toBe(1);
    expect(s.sent[0]).toStartWith("User edited spec.md:");
    s.done();
  });

  test("a change made while the command ran is labeled as possibly the command's own", () => {
    const s = session();
    s.edits.willWrite("b1", undefined);
    writeFileSync(s.path, "one\nduring\n");
    // A report taken while the command runs leaves its file for later.
    expect(s.take()).toBeUndefined();
    s.edits.wrote("b1");
    s.take();
    expect(s.sent.length).toBe(1);
    expect(s.sent[0]).toContain("changed while a shell command ran");
    s.done();
  });
});
