import type { Answer } from "../../core/types.ts";
import { MAX_SELECTION } from "./bridge.ts";
import { newAnswerId } from "./host-config.ts";

/**
 * Injected into every HTML page that runs in the sandboxed frame. A form whose action is `cgi-bin:pi-answer`
 * sends its fields to the agent, and `piBetterShow.send(fields | answer)` does the same for a page's own script.
 * Both go through the parent page (see host-page.ts), which is the only party that talks to the server.
 * The text the user selects is reported to the parent too, for its feedback panel: the frame cannot show the panel
 * itself, and the parent cannot read the frame.
 */

const ACTION = "cgi-bin:pi-answer";
const WAIT_MS = 10_000;

interface Reply {
  accepted: boolean;
  reason?: string;
}

const waiting = new Map<string, (reply: Reply) => void>();

window.addEventListener("message", (event) => {
  if (event.source !== parent) return;
  const data = event.data as {
    source?: unknown;
    type?: unknown;
    answerId?: unknown;
    accepted?: unknown;
    reason?: unknown;
  } | null;
  if (data?.source !== "pbs-host" || data.type !== "answer-result" || typeof data.answerId !== "string") return;
  const resolve = waiting.get(data.answerId);
  if (!resolve) return;
  waiting.delete(data.answerId);
  resolve({ accepted: data.accepted === true, ...(typeof data.reason === "string" ? { reason: data.reason } : {}) });
});

type Fields = Record<string, unknown> | Iterable<readonly [string, unknown]>;

const isAnswer = (value: unknown): value is Answer =>
  typeof value === "object" && value !== null && "kind" in value && "fields" in value;

function toAnswer(input: Fields | Answer): Answer {
  if (isAnswer(input)) return input;
  const pairs = Symbol.iterator in input ? [...(input as Iterable<readonly [string, unknown]>)] : Object.entries(input);
  return {
    kind: "form",
    fields: pairs.filter(([, value]) => typeof value === "string").map(([name, value]) => [name, value as string]),
  };
}

function send(input: Fields | Answer): Promise<Reply> {
  const answerId = newAnswerId();
  return new Promise<Reply>((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(answerId);
      resolve({ accepted: false, reason: "no reply from the page server" });
    }, WAIT_MS);
    waiting.set(answerId, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
    parent.postMessage({ source: "pbs-frame", type: "answer", answerId, answer: toAnswer(input) }, "*");
  });
}

const note = (text: string): void => {
  const box = document.createElement("div");
  box.textContent = text;
  box.setAttribute("role", "status");
  box.style.cssText =
    "position:fixed;right:1em;bottom:1em;padding:.5em 1em;background:#222;color:#fff;border-radius:4px;z-index:2147483647;font:14px system-ui";
  document.body.append(box);
  setTimeout(() => box.remove(), 4000);
};

(window as unknown as { piBetterShow: unknown }).piBetterShow = { send };

document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute("action") !== ACTION) return;
    event.preventDefault();
    const buttons = [
      ...form.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input[type=submit]"),
    ].filter((button) => !button.disabled);
    for (const button of buttons) button.disabled = true;
    const fields = new FormData(form, event.submitter);
    const shown = new Promise((resolve) => setTimeout(resolve, 1000));
    send(fields)
      .then((reply) => note(reply.accepted ? "Sent to the agent." : `Not sent: ${reply.reason ?? "refused"}`))
      .then(() => shown)
      .then(() => {
        for (const button of buttons) button.disabled = false;
      });
  },
  true,
);

/** The text the user has selected on the page, with where it starts; none when it is empty or inside a field. */
function selectedText(): { text: string; top: number; left: number } {
  const none = { text: "", top: 0, left: 0 };
  const selection = getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return none;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return none;
  const text = selection.toString().trim().slice(0, MAX_SELECTION);
  if (!text) return none;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return { text, top: rect.top, left: rect.left };
}

let reported = "";
document.addEventListener("selectionchange", () => {
  const { text, top, left } = selectedText();
  // The parent already has what it is told; only a change is worth a message.
  const key = text === "" ? "" : `${top}:${left}:${text}`;
  if (key === reported) return;
  reported = key;
  parent.postMessage({ source: "pbs-frame", type: "selection", text, top, left }, "*");
});
