import { describe, expect, test } from "bun:test";
import { encodeAnswer } from "../../src/core/index.ts";
import { frameAnswer, frameSelection, MAX_SELECTION } from "../../src/extension/client/bridge.ts";
import { feedbackAnswer, mountFeedback, wordsFor } from "../../src/extension/client/feedback.ts";
import { parseAnswer } from "../../src/extension/contract.ts";
import { feedbackMessage, MAX_DIFF_CHARS, shellWords } from "../../src/extension/edit.ts";
import { createAllowList } from "../../src/extension/files.ts";
import { injectFrameHook } from "../../src/extension/server.ts";

describe("parseAnswer", () => {
  test("accepts exactly the shape of an Answer", () => {
    expect(parseAnswer({ kind: "form", fields: [["a", "b"]] })).toEqual({ kind: "form", fields: [["a", "b"]] });
    expect(parseAnswer({ kind: "pick", title: "T", fields: [], ref: { doc: "d.md", block: 2 } })).toEqual({
      kind: "pick",
      title: "T",
      fields: [],
      ref: { doc: "d.md", block: 2 },
    });
    expect(parseAnswer({ kind: "pick", fields: [], ref: { block: 0 } })?.ref).toEqual({ block: 0 });
    for (const bad of [
      null,
      "x",
      3,
      [],
      {},
      { kind: "nope", fields: [] },
      { kind: "form" },
      { kind: "form", fields: "x" },
      { kind: "form", fields: [["a"]] },
      { kind: "form", fields: [["a", 1]] },
      { kind: "form", fields: [[1, "a"]] },
      { kind: "form", title: 3, fields: [] },
      { kind: "form", fields: [], ref: 3 },
      { kind: "form", fields: [], ref: { block: "1" } },
      { kind: "form", fields: [], ref: { block: 1.5 } },
      { kind: "form", fields: [], ref: { doc: 1, block: 1 } },
    ]) {
      expect(parseAnswer(bad)).toBeUndefined();
    }
  });

  test("drops anything an Answer does not carry", () => {
    const parsed = parseAnswer({ kind: "form", fields: [["a", "b"]], extra: "x", __proto__: { evil: 1 } });
    expect(Object.keys(parsed ?? {})).toEqual(["kind", "fields"]);
  });
});

describe("edit mode helpers", () => {
  test("shellWords splits like a shell without expanding anything", () => {
    expect(shellWords("code -r")).toEqual(["code", "-r"]);
    expect(shellWords(`my-editor --flag="a b" 'c d' e\\ f ""`)).toEqual(["my-editor", "--flag=a b", "c d", "e f", ""]);
    expect(shellWords("  subl   -w ")).toEqual(["subl", "-w"]);
    expect(shellWords("echo $HOME `x`")).toEqual(["echo", "$HOME", "`x`"]);
    expect(() => shellWords("code 'unterminated")).toThrow(/unterminated/);
  });

  test("feedbackMessage drops the file headers and truncates a long diff", () => {
    const diff = "--- a/x.md\n+++ b/x.md\n@@ -1 +1 @@\n-a\n+b\n";
    expect(feedbackMessage("x.md", diff)).toBe("User edited x.md:\n```diff\n@@ -1 +1 @@\n-a\n+b\n```");
    const long = feedbackMessage("x.md", "+".repeat(MAX_DIFF_CHARS + 50));
    expect(long).toContain("… (truncated; read x.md)");
    expect(long.length).toBeLessThan(MAX_DIFF_CHARS + 100);
  });
});

describe("the allow-list", () => {
  test("admits files below a page's directory, never a dotted name or anything above", () => {
    const allow = createAllowList();
    allow.add("/work/doc/page.md");
    expect(allow.canServe("/work/doc/page.md")).toBe(true);
    expect(allow.canServe("/work/doc/img/a.png")).toBe(true);
    for (const outside of [
      "/work/other.md",
      "/work",
      "/work/doc",
      "/etc/passwd",
      "/work/doc/.env",
      "/work/doc/.git/config",
      "/work/doc/x/.y/z",
      "/work/doc/../other",
    ]) {
      expect(allow.canServe(outside)).toBe(false);
    }
    allow.clear();
    expect(allow.canServe("/work/doc/img/a.png")).toBe(false);
  });
});

describe("injectFrameHook", () => {
  const hook = '<script src="/t/assets/frame.js"></script>';
  test("goes first in the head, else after <html>, else after the doctype, else first", () => {
    expect(injectFrameHook("<head><title>x</title></head>", "/t")).toBe(`<head>${hook}<title>x</title></head>`);
    expect(injectFrameHook('<html lang="en"><body>x', "/t")).toBe(`<html lang="en">${hook}<body>x`);
    expect(injectFrameHook("<!doctype html><p>x", "/t")).toBe(`<!doctype html>${hook}<p>x`);
    expect(injectFrameHook("<p>x", "/t")).toBe(`${hook}<p>x`);
  });
});

describe("the host page's bridge", () => {
  const frame = {};
  const message = {
    source: "pbs-frame",
    type: "answer",
    answerId: "a1",
    answer: { kind: "form", fields: [["a", "b"]] },
  };
  test("takes an answer only from its own frame, with the opaque origin", () => {
    expect(frameAnswer({ source: frame, origin: "null", data: message }, frame)).toEqual({
      answerId: "a1",
      answer: message.answer as never,
    });
    expect(frameAnswer({ source: {}, origin: "null", data: message }, frame)).toBeUndefined();
    expect(frameAnswer({ source: frame, origin: "https://evil.example", data: message }, frame)).toBeUndefined();
    expect(frameAnswer({ source: frame, origin: "http://127.0.0.1:1", data: message }, frame)).toBeUndefined();
    expect(frameAnswer({ source: null, origin: "null", data: message }, null)).toBeUndefined();
  });

  test("ignores a message that is not an answer", () => {
    for (const data of [
      null,
      "x",
      {},
      { ...message, source: "other" },
      { ...message, type: "ping" },
      { ...message, answerId: "" },
      { ...message, answerId: 3 },
      { ...message, answer: null },
      { ...message, answer: "x" },
    ]) {
      expect(frameAnswer({ source: frame, origin: "null", data }, frame)).toBeUndefined();
    }
  });
});

describe("the host page's selection bridge", () => {
  const frame = {};
  const message = { source: "pbs-frame", type: "selection", text: "the cache", top: 12, left: 30 };
  test("takes a selection only from its own frame, with the opaque origin", () => {
    expect(frameSelection({ source: frame, origin: "null", data: message }, frame)).toEqual({
      text: "the cache",
      top: 12,
      left: 30,
    });
    expect(frameSelection({ source: {}, origin: "null", data: message }, frame)).toBeUndefined();
    expect(frameSelection({ source: frame, origin: "https://evil.example", data: message }, frame)).toBeUndefined();
    expect(frameSelection({ source: null, origin: "null", data: message }, null)).toBeUndefined();
  });

  test("ignores a message that is not a selection, and drops a position that is not a number", () => {
    for (const data of [
      null,
      "x",
      {},
      { ...message, source: "other" },
      { ...message, type: "answer" },
      { ...message, text: 3 },
    ]) {
      expect(frameSelection({ source: frame, origin: "null", data }, frame)).toBeUndefined();
    }
    expect(
      frameSelection({ source: frame, origin: "null", data: { ...message, top: "x", left: Number.NaN } }, frame),
    ).toEqual({
      text: "the cache",
    });
  });

  test("an empty text is a selection that was cleared, and a long one is cut", () => {
    expect(frameSelection({ source: frame, origin: "null", data: { ...message, text: "" } }, frame)?.text).toBe("");
    const long = frameSelection(
      { source: frame, origin: "null", data: { ...message, text: "y".repeat(MAX_SELECTION + 5) } },
      frame,
    );
    expect(long?.text).toHaveLength(MAX_SELECTION);
  });
});

describe("the feedback panel", () => {
  test("its answer is the one pi-herdr-doc-review's panel sent", () => {
    const answer = feedbackAnswer(
      "Plan",
      [
        { quote: "the cache", comment: "why?" },
        { quote: "two\nlines", comment: "" },
      ],
      "  fine  ",
    );
    expect(answer).toEqual({
      kind: "feedback",
      title: "Plan",
      fields: [
        ["page", "Plan"],
        ["quote", "the cache"],
        ["comment", "why?"],
        ["quote", "two\nlines"],
        ["comment", ""],
        ["overall", "fine"],
      ],
    });
    expect(encodeAnswer(answer)).toBe(
      'User feedback on the page "Plan":\n\n> the cache\nwhy?\n\n> two\n> lines\n(no comment)\n\nOverall: fine',
    );
    expect(feedbackAnswer("Plan", [], "").fields).toEqual([["page", "Plan"]]);
  });

  test("words follow the language", () => {
    expect(wordsFor("zh-Hant").send).toBe("送給 agent");
    expect(wordsFor("en-US").send).toBe("Send to agent");
    expect(wordsFor("").feedback).toBe("Feedback");
  });

  test("restores a draft, sends it with the overall note, and clears it once taken", async () => {
    const store = new Map<string, string>([
      ["k", JSON.stringify({ items: [{ quote: "q1", comment: "c1" }], overall: "o1" })],
    ]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    const sent: unknown[] = [];
    const panel = mountFeedback({
      page: "Plan",
      words: wordsFor("en"),
      storage,
      storageKey: "k",
      send: async (answer) => void sent.push(answer),
    });
    expect(document.querySelector(".pbs-fb-toggle")?.textContent).toBe("Feedback (1)");
    expect(document.querySelector<HTMLTextAreaElement>(".pbs-fb-item textarea")?.value).toBe("c1");
    document.querySelector<HTMLButtonElement>(".pbs-fb-send")?.click();
    await Bun.sleep(10);
    expect(sent).toEqual([feedbackAnswer("Plan", [{ quote: "q1", comment: "c1" }], "o1")]);
    expect(store.has("k")).toBe(false);
    expect(document.querySelector(".pbs-fb-status")?.textContent).toBe("Sent to the agent.");
    // Nothing to send says so and sends nothing.
    document.querySelector<HTMLButtonElement>(".pbs-fb-send")?.click();
    expect(document.querySelector(".pbs-fb-status")?.textContent).toBe("Nothing to send yet.");
    expect(sent).toHaveLength(1);
    panel.destroy();
    expect(document.querySelector(".pbs-fb")).toBeNull();
  });

  test("keeps the draft when the answer is refused", async () => {
    const store = new Map<string, string>([["k", JSON.stringify({ items: [], overall: "keep me" })]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    const panel = mountFeedback({
      page: "P",
      words: wordsFor("en"),
      storage,
      storageKey: "k",
      send: async () => {
        throw new Error("closed");
      },
    });
    document.querySelector<HTMLButtonElement>(".pbs-fb-send")?.click();
    await Bun.sleep(10);
    expect(document.querySelector(".pbs-fb-status")?.textContent).toBe("Not sent: closed");
    expect(store.get("k")).toContain("keep me");
    panel.destroy();
  });
});
