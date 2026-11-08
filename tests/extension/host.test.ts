import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { feedbackAnswer, wordsFor } from "../../src/extension/client/feedback.ts";
import { mountHost } from "../../src/extension/client/host-page.ts";

interface Posted {
  url: string;
  body: { answerId: string; answer: unknown; page: string };
}

/** A host page as the server builds it, with a frame whose window is a stand-in (frames never load under happy-dom). */
function setup(accepted = true) {
  document.body.innerHTML = '<iframe class="pbs-frame"></iframe>';
  const frame = document.querySelector("iframe") as HTMLIFrameElement;
  const toFrame: unknown[] = [];
  const frameWindow = { postMessage: (message: unknown) => void toFrame.push(message) };
  Object.defineProperty(frame, "contentWindow", { value: frameWindow });
  const posted: Posted[] = [];
  const store = new Map<string, string>();
  const host = mountHost({
    frame,
    prefix: "/t",
    page: "The plan",
    words: wordsFor("en"),
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
    },
    storageKey: "k",
    post: async (url, body) => {
      posted.push({ url, body });
      return accepted ? { accepted: true } : { accepted: false, reason: "closed" };
    },
  });
  const message = (source: unknown, data: unknown, origin = "null") => {
    const event = new Event("message");
    Object.defineProperties(event, { source: { value: source }, origin: { value: origin }, data: { value: data } });
    window.dispatchEvent(event);
  };
  const select = (text: string, extra: Record<string, unknown> = {}) =>
    message(frameWindow, { source: "pbs-frame", type: "selection", text, ...extra });
  return { host, frameWindow, toFrame, posted, message, select, store };
}

const add = () => document.querySelector<HTMLButtonElement>(".pbs-fb-add");
const click = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();

let current: ReturnType<typeof setup> | undefined;
beforeEach(() => {
  current = undefined;
});
afterEach(() => {
  current?.host.destroy();
  document.body.innerHTML = "";
});

describe("the host page's feedback panel", () => {
  test("mounts the panel around the frame", () => {
    current = setup();
    expect(document.querySelector(".pbs-fb-toggle")?.textContent).toBe("Feedback");
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  test("a selection from its own frame reaches the panel, and Add turns it into a comment", () => {
    current = setup();
    expect(add()?.hidden).toBe(true);
    current.select("the cache", { top: 100, left: 40 });
    expect(add()?.hidden).toBe(false);
    click(".pbs-fb-add");
    expect(add()?.hidden).toBe(true);
    expect(document.querySelector(".pbs-fb-toggle")?.textContent).toBe("Feedback (1)");
    expect(document.querySelector(".pbs-fb-item blockquote")?.textContent).toBe("the cache");
  });

  test("an empty selection from the frame hides the Add button", () => {
    current = setup();
    current.select("x");
    current.select("");
    expect(add()?.hidden).toBe(true);
  });

  test("a selection from another window, or another origin, is refused", () => {
    current = setup();
    const data = { source: "pbs-frame", type: "selection", text: "forged" };
    current.message({}, data);
    current.message(window, data);
    current.message(current.frameWindow, data, "http://127.0.0.1:1");
    current.message(current.frameWindow, { ...data, source: "other" });
    current.message(current.frameWindow, { ...data, text: 3 });
    expect(add()?.hidden).toBe(true);
  });

  test("a very long selection is cut to a bounded quote", () => {
    current = setup();
    current.select("x".repeat(100_000));
    click(".pbs-fb-add");
    const quote = document.querySelector(".pbs-fb-item blockquote")?.textContent ?? "";
    expect(quote.length).toBeGreaterThan(0);
    expect(quote.length).toBeLessThanOrEqual(2000);
  });

  test("Send posts one feedback answer for the page, with the comment and the overall note", async () => {
    current = setup();
    current.select("the cache");
    click(".pbs-fb-add");
    const comment = document.querySelector<HTMLTextAreaElement>(".pbs-fb-item textarea");
    if (!comment) throw new Error("no comment box");
    comment.value = "why?";
    comment.dispatchEvent(new Event("input"));
    const overall = document.querySelector<HTMLTextAreaElement>(".pbs-fb-overall");
    if (!overall) throw new Error("no overall box");
    overall.value = "fine";
    overall.dispatchEvent(new Event("input"));
    click(".pbs-fb-send");
    await Bun.sleep(10);
    expect(current.posted).toHaveLength(1);
    const [sent] = current.posted;
    expect(sent?.url).toBe("/t/answer");
    expect(sent?.body.answer).toEqual(feedbackAnswer("The plan", [{ quote: "the cache", comment: "why?" }], "fine"));
    expect(sent?.body.answerId).toBeTruthy();
    expect(sent?.body.page).toBe(location.pathname);
    expect(document.querySelector(".pbs-fb-status")?.textContent).toBe("Sent to the agent.");
  });

  test("a refused answer keeps the draft and says why", async () => {
    current = setup(false);
    const overall = document.querySelector<HTMLTextAreaElement>(".pbs-fb-overall");
    if (!overall) throw new Error("no overall box");
    overall.value = "keep";
    overall.dispatchEvent(new Event("input"));
    click(".pbs-fb-send");
    await Bun.sleep(10);
    expect(document.querySelector(".pbs-fb-status")?.textContent).toBe("Not sent: closed");
    expect(current.store.get("k")).toContain("keep");
  });
});

describe("the host page's answer bridge", () => {
  const answer = { kind: "form", fields: [["a", "b"]] };

  test("carries an answer from its own frame to the server and replies to the frame", async () => {
    current = setup();
    current.message(current.frameWindow, { source: "pbs-frame", type: "answer", answerId: "a1", answer });
    await Bun.sleep(10);
    expect(current.posted).toEqual([{ url: "/t/answer", body: { answerId: "a1", answer, page: location.pathname } }]);
    expect(current.toFrame).toEqual([{ source: "pbs-host", type: "answer-result", answerId: "a1", accepted: true }]);
  });

  test("ignores an answer from any other window", async () => {
    current = setup();
    current.message({}, { source: "pbs-frame", type: "answer", answerId: "a1", answer });
    await Bun.sleep(10);
    expect(current.posted).toEqual([]);
    expect(current.toFrame).toEqual([]);
  });
});
