import type { Answer } from "../../core/types.ts";

export interface FeedbackItem {
  quote: string;
  comment: string;
  /** Where a quote that is not selected text came from, for `requote`; kept with the draft, never sent. */
  ref?: string;
}

export interface FeedbackWords {
  feedback: string;
  comment: string;
  heading: string;
  hint: string;
  /** The hint on a page whose diagrams can be commented on. */
  hintDiagram: string;
  overall: string;
  send: string;
  sending: string;
  sent: string;
  empty: string;
  remove: string;
  notSent: string;
  commentLabel: string;
}

const ZH: FeedbackWords = {
  feedback: "回饋",
  comment: "留言",
  heading: "給 agent 的回饋",
  hint: "選取頁面上的文字可以針對那段留言。",
  hintDiagram: "選取頁面上的文字，或點圖表裡的節點與連線，可以針對它留言。",
  overall: "整體意見",
  send: "送給 agent",
  sending: "傳送中…",
  sent: "已送給 agent。",
  empty: "還沒有內容。",
  remove: "移除",
  notSent: "沒送出：",
  commentLabel: "你的留言",
};
const EN: FeedbackWords = {
  feedback: "Feedback",
  comment: "Comment",
  heading: "Feedback for the agent",
  hint: "Select text on the page to comment on it.",
  hintDiagram: "Select text on the page, or click a node or edge in a diagram, to comment on it.",
  overall: "Overall",
  send: "Send to agent",
  sending: "Sending…",
  sent: "Sent to the agent.",
  empty: "Nothing to send yet.",
  remove: "Remove",
  notSent: "Not sent: ",
  commentLabel: "Your comment",
};

export const wordsFor = (lang: string): FeedbackWords => (/^zh/i.test(lang) ? ZH : EN);

/** The answer a feedback panel sends: the page, each quoted passage with its comment, then the overall note. */
export function feedbackAnswer(page: string, items: readonly FeedbackItem[], overall: string): Answer {
  const fields: [string, string][] = [["page", page]];
  for (const item of items) fields.push(["quote", item.quote], ["comment", item.comment]);
  if (overall.trim()) fields.push(["overall", overall.trim()]);
  return { kind: "feedback", title: page, fields };
}

export interface FeedbackOptions {
  page: string;
  words: FeedbackWords;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  storageKey: string;
  /** Delivers the answer; rejects with the reason it was not taken. */
  send: (answer: Answer) => Promise<void>;
  /**
   * Whether the panel follows the selection in its own document (default). A host page around a frame turns this off
   * and passes the frame's selection to `offer` instead.
   */
  watchDocument?: boolean;
  /** Whether the page's diagrams can be commented on (the hint says so); a host calls `comment` for them. */
  diagrams?: boolean;
  /**
   * Rewrites a restored draft's quote that came with a `ref` for the page as it is now: the reload an agent's edit causes
   * may have moved what the quote names.
   */
  requote?: (quote: string, ref: string) => string;
}

/** A passage to comment on, and where the Add button goes (viewport coordinates of the panel's document). */
export interface Offered {
  text: string;
  top?: number;
  left?: number;
}

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) element.className = className;
  Object.assign(element, rest);
  return element;
};

/**
 * The feedback panel: select a passage, comment on it, and send the comments with an overall note in one message.
 * Drafts live in the tab's session storage, so they survive the reload an agent's edit causes.
 */
export function mountFeedback(options: FeedbackOptions): {
  /** Offers a passage to comment on, or withdraws the offer with no text or `undefined`. */
  offer: (passage: Offered | undefined) => void;
  /**
   * Adds `quote` to the panel as a commented target at once and opens the panel on its comment box; for what cannot be
   * selected as text (a diagram's node or edge). A target already in the panel is not added twice, only focused.
   * `ref` is kept with the draft for `requote`; Escape in the panel returns focus to `back`, the control it came from.
   */
  comment: (quote: string, from?: { ref?: string; back?: HTMLElement | SVGElement }) => void;
  destroy: () => void;
} {
  const { words, storage, storageKey } = options;
  let items: FeedbackItem[] = [];
  let overall = "";
  try {
    const saved = JSON.parse(storage.getItem(storageKey) ?? "null") as {
      items?: FeedbackItem[];
      overall?: string;
    } | null;
    const { requote } = options;
    items = (saved?.items ?? []).map((item) =>
      item.ref && requote ? { ...item, quote: requote(item.quote, item.ref) } : item,
    );
    overall = saved?.overall ?? "";
  } catch {
    // A draft that cannot be read is dropped.
  }
  const save = (): void => {
    if (items.length === 0 && !overall) storage.removeItem(storageKey);
    else storage.setItem(storageKey, JSON.stringify({ items, overall }));
  };

  const toggle = make("button", { type: "button", class: "pbs-fb-toggle", textContent: words.feedback });
  const panel = make("section", { class: "pbs-fb-panel", hidden: true });
  panel.setAttribute("aria-label", words.heading);
  const heading = make("h2", { textContent: words.heading });
  const hint = make("p", { class: "pbs-fb-hint", textContent: options.diagrams ? words.hintDiagram : words.hint });
  const list = make("div", { class: "pbs-fb-list" });
  const overallBox = make("textarea", { class: "pbs-fb-overall", rows: 3, value: overall });
  overallBox.setAttribute("aria-label", words.overall);
  overallBox.placeholder = words.overall;
  const sendButton = make("button", { type: "button", class: "pbs-fb-send", textContent: words.send });
  const status = make("p", { class: "pbs-fb-status" });
  status.setAttribute("role", "status");
  panel.append(heading, hint, list, overallBox, sendButton, status);
  const add = make("button", { type: "button", class: "pbs-fb-add", textContent: words.comment, hidden: true });
  const root = make("div", { class: "pbs-fb" });
  root.append(toggle, panel, add);

  const draw = (): void => {
    list.replaceChildren(
      ...items.map((item, index) => {
        const entry = make("div", { class: "pbs-fb-item" });
        const quote = make("blockquote", { textContent: item.quote });
        const box = make("textarea", { rows: 2, value: item.comment });
        box.setAttribute("aria-label", words.commentLabel);
        box.addEventListener("input", () => {
          item.comment = box.value;
          save();
        });
        const remove = make("button", { type: "button", textContent: words.remove });
        remove.addEventListener("click", () => {
          items.splice(index, 1);
          save();
          draw();
        });
        entry.append(quote, box, remove);
        return entry;
      }),
    );
    toggle.textContent = items.length > 0 ? `${words.feedback} (${items.length})` : words.feedback;
  };
  overallBox.addEventListener("input", () => {
    overall = overallBox.value;
    save();
  });
  /** Where Escape in the panel returns focus: the diagram element a comment was opened from. */
  let back: HTMLElement | SVGElement | undefined;
  toggle.addEventListener("click", () => {
    back = undefined;
    panel.hidden = !panel.hidden;
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !back?.isConnected) return;
    event.preventDefault();
    back.focus();
  });

  let pending = "";
  const offer = (passage: Offered | undefined): void => {
    const text = passage?.text.trim();
    if (!passage || !text) {
      pending = "";
      add.hidden = true;
      return;
    }
    pending = text;
    add.hidden = false;
    add.style.top = `${Math.max(8, (passage.top ?? 44) - 36)}px`;
    add.style.left = `${Math.max(8, Math.min(passage.left ?? 8, innerWidth - 120))}px`;
  };
  const selected = (): Offered | undefined => {
    const selection = getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
    const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
    if (anchor?.closest(".pbs-fb, input, textarea")) return undefined;
    const text = selection.toString().trim();
    if (!text) return undefined;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return { text, top: rect.top, left: rect.left };
  };
  const onSelect = (): void => offer(selected());
  // The button is pressed before the click lands, which would collapse the selection; keep what was picked.
  add.addEventListener("mousedown", (event) => event.preventDefault());
  const open = (index: number): void => {
    panel.hidden = false;
    list.querySelectorAll("textarea").item(index)?.focus();
  };
  const comment = (quote: string, from: { ref?: string; back?: HTMLElement | SVGElement } = {}): void => {
    const { ref } = from;
    back = from.back;
    const known = items.findIndex((item) => item.quote === quote);
    if (known === -1) {
      items.push(ref ? { quote, comment: "", ref } : { quote, comment: "" });
      save();
      draw();
    }
    open(known === -1 ? items.length - 1 : known);
  };
  add.addEventListener("click", () => {
    back = undefined;
    const quote = pending;
    pending = "";
    add.hidden = true;
    getSelection()?.removeAllRanges();
    if (quote) items.push({ quote, comment: "" });
    save();
    draw();
    open(items.length - 1);
  });
  sendButton.addEventListener("click", () => {
    if (items.length === 0 && !overall.trim()) {
      status.textContent = words.empty;
      return;
    }
    sendButton.disabled = true;
    status.textContent = words.sending;
    options
      .send(feedbackAnswer(options.page, items, overall))
      .then(
        () => {
          items = [];
          overall = "";
          overallBox.value = "";
          save();
          draw();
          status.textContent = words.sent;
        },
        (error: unknown) => {
          status.textContent = `${words.notSent}${error instanceof Error ? error.message : String(error)}`;
        },
      )
      .finally(() => {
        sendButton.disabled = false;
      });
  });
  const watch = options.watchDocument !== false;
  if (watch) document.addEventListener("selectionchange", onSelect);
  draw();
  document.body.append(root);
  return {
    offer,
    comment,
    destroy: () => {
      if (watch) document.removeEventListener("selectionchange", onSelect);
      root.remove();
    },
  };
}
