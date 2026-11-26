import { encodeAnswer } from "../../core/answer.ts";
import { parseAnswer } from "../contract.ts";

/** The words of the notice a page shows when an answer did not reach the agent. */
export interface FallbackWords {
  /** Prefixes the reason the answer was not taken. */
  notSent: string;
  /** Replaces a network failure's message: the page server is gone. */
  serverGone: string;
  /** Tells the user what the copy is for. */
  pasteHint: string;
  copy: string;
  copied: string;
  copyFailed: string;
  close: string;
}

/** What a failed `fetch` rejects with: the page server stopped (pi reloaded or quit, or the server went idle). */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network connection was lost/i;

/** The reason an answer was not taken, as the user reads it. */
export function failureReason(error: unknown, words: Pick<FallbackWords, "serverGone">): string {
  const message = error instanceof Error ? error.message : String(error);
  return NETWORK_FAILURE.test(message) ? words.serverGone : message;
}

/** The text the agent would have read for this answer, for the user to paste into pi; none when it is not an answer. */
export function answerText(raw: unknown): string | undefined {
  const answer = parseAnswer(raw);
  return answer && answer.fields.length > 0 ? encodeAnswer(answer) : undefined;
}

/**
 * Copies `text` to the clipboard. The page is served from 127.0.0.1, a secure context, so the Clipboard API is the
 * normal path; a selected text area with `execCommand("copy")` covers a browser that refuses it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** A copy button that says, for a moment, whether the copy worked; with no text to copy it calls `onEmpty`. */
export function copyButton(
  words: FallbackWords,
  text: () => string | undefined,
  className = "pbs-copy",
  onEmpty?: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = words.copy;
  let timer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener("click", () => {
    const value = text();
    if (value === undefined) {
      onEmpty?.();
      return;
    }
    void copyText(value).then((ok) => {
      button.textContent = ok ? words.copied : words.copyFailed;
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = words.copy;
      }, 2000);
    });
  });
  return button;
}

/**
 * Shows that an answer did not reach the agent. With the answer's text, the notice stays until the user closes it and
 * offers the text to copy and paste into pi, in a box the user can also select by hand; without it, the notice is a
 * short toast. One notice at a time: a newer failure replaces the one on screen.
 */
export function showFailure(words: FallbackWords, reason: string, text: string | undefined): HTMLElement {
  document.querySelector(".pbs-fallback")?.remove();
  const box = document.createElement("div");
  box.className = "pbs-toast pbs-fallback";
  box.setAttribute("role", "alert");
  const line = document.createElement("p");
  line.textContent = `${words.notSent}${reason}`;
  box.append(line);
  if (text === undefined) {
    document.body.append(box);
    setTimeout(() => box.remove(), 5000);
    return box;
  }
  const hint = document.createElement("p");
  hint.textContent = words.pasteHint;
  const area = document.createElement("textarea");
  area.readOnly = true;
  area.rows = 4;
  area.value = text;
  area.setAttribute("aria-label", words.pasteHint);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "pbs-fallback-close";
  close.textContent = words.close;
  close.addEventListener("click", () => box.remove());
  const actions = document.createElement("div");
  actions.className = "pbs-fallback-actions";
  actions.append(
    copyButton(words, () => text),
    close,
  );
  box.append(hint, area, actions);
  document.body.append(box);
  return box;
}
