import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditSession, defaultRun } from "../../src/extension/edit.ts";

/** A session over a real file and the real `diff`, with no watcher: tests change the file and end calls by hand. */
function session() {
  const dir = mkdtempSync(join(tmpdir(), "pbs-edit-"));
  const path = join(dir, "spec.md");
  writeFileSync(path, "one\n");
  const sent: string[] = [];
  const edits = createEditSession(
    {
      editor: undefined,
      onPath: () => false,
      launch: async () => {},
      run: defaultRun,
      platform: "darwin",
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
      watch: () => () => {},
    },
    (message) => sent.push(message),
  );
  edits.watch(path, "spec.md", "one\n", (error) => {
    throw error;
  });
  return {
    path,
    sent,
    edits,
    done: () => {
      edits.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("edit session around shell commands", () => {
  test("two shell commands running at once report one save once", () => {
    const s = session();
    s.edits.willWrite("b1", undefined);
    s.edits.willWrite("b2", undefined);
    writeFileSync(s.path, "one\ntwo\n");
    s.edits.wrote("b1");
    s.edits.wrote("b2");
    expect(s.sent.length).toBe(1);
    s.done();
  });

  test("a save the watcher had not seen when a shell command began is still reported, as the user's edit", () => {
    const s = session();
    writeFileSync(s.path, "one\nsaved\n");
    s.edits.willWrite("b1", undefined);
    s.edits.wrote("b1");
    expect(s.sent.length).toBe(1);
    expect(s.sent[0]).toStartWith("User edited spec.md:");
    s.done();
  });

  test("a change made while the command ran is labeled as possibly the command's own", () => {
    const s = session();
    s.edits.willWrite("b1", undefined);
    writeFileSync(s.path, "one\nduring\n");
    s.edits.wrote("b1");
    expect(s.sent.length).toBe(1);
    expect(s.sent[0]).toContain("changed while a shell command ran");
    s.done();
  });
});
