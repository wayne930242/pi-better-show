import { NOTE_FIELD, pickField, reviewItemName, reviewPicks, reviewSections } from "../core/blocks.ts";
import { inlinePlain } from "../core/inline.ts";
import type { ReviewData, ReviewItemData } from "../core/types.ts";
import { type AnsweredFields, define, PbsElement } from "./base.ts";
import { configuration } from "./config.ts";
import { controlCss, noteBox, noteField, sendingForm, sentBadge, submitRow } from "./controls.ts";
import { type Child, h, inlineNodes, prose, uid } from "./dom.ts";

const reviewCss = `${controlCss}
.review { container-type: inline-size; }
.review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: var(--_gap); }
.review-grid[data-columns="1"] { grid-template-columns: minmax(0, 1fr); }
.review-grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.review-grid[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.review-grid[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.review-grid[data-columns="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.review-grid[data-columns="6"] { grid-template-columns: repeat(6, minmax(0, 1fr)); }
@container (max-width: 40rem) { .review-grid[data-columns] { grid-template-columns: minmax(0, 1fr); } }
.item { display: flex; flex-direction: column; gap: 0.6rem; }
.item .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.2rem 0.75rem; }
.item .pick { display: inline-flex; gap: 0.4rem; align-items: center; cursor: pointer; font-size: 0.92em; white-space: nowrap; }
.item .pick input { margin: 0; }
.item .media { min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; }
.item .media img { display: block; max-width: 100%; height: auto; border-radius: 4px; }
.item .media iframe { width: 100%; border: 1px solid var(--_line); border-radius: 4px; background: #fff; }
.item .media .btn { padding: 0.1em 0.7em; font-size: 0.85em; }
.item .copy { min-width: 0; overflow-x: auto; }
.item textarea { min-height: 4rem; }
dialog { width: min(96vw, 110rem); max-width: 96vw; max-height: 96vh; overflow: auto; padding: 0; border: 0; background: transparent; color: var(--_fg); }
dialog::backdrop { background: rgb(0 0 0 / 0.82); }
.lightbox { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem); gap: var(--_gap); align-items: start; }
.lightbox .stage { min-width: 0; display: flex; justify-content: center; }
.lightbox .stage img { display: block; max-width: 100%; max-height: 92vh; object-fit: contain; border-radius: var(--_radius); background: var(--_bg); }
.lightbox .side { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem; border: 1px solid var(--_line); border-radius: var(--_radius); background: var(--_bg); }
.lightbox .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.2rem 0.75rem; }
.lightbox .nav { display: flex; gap: 0.5rem; }
.lightbox .nav .btn { flex: 1; }
.lightbox textarea { min-height: 8rem; }
@media (max-width: 48rem) {
  .lightbox { grid-template-columns: minmax(0, 1fr); }
  .lightbox .stage img { max-height: 60vh; }
}
`;

/** An item's picture the lightbox can show: its item, the resolved URL, and the button that opened it. */
interface Shown {
  index: number;
  url: string;
  name: string;
  opener: HTMLElement;
}

export class PbsReview extends PbsElement<ReviewData> {
  static override css = reviewCss;
  #picked = new Set<number>();
  #comments: string[] | undefined;
  #note = "";
  /** The pictures of the current view in item order, which the lightbox steps through. */
  #shown: Shown[] = [];
  /** Each item's comment box of the current view, kept in step with the lightbox's box. */
  #boxes: HTMLTextAreaElement[] = [];

  protected override reset(): void {
    this.#picked.clear();
    this.#comments = undefined;
    this.#note = "";
  }

  protected view(data: ReviewData): Node {
    const title = data.title && h("div", { part: "title", class: "title" }, inlineNodes(data.title));
    if (this.answered) return this.sentView(title);
    this.#comments ??= data.items.map(() => "");
    const comments = this.#comments;
    this.#shown = [];
    this.#boxes = [];
    const pickLabel =
      typeof data.pick === "string" ? data.pick : data.pick || data.pickMode ? this.t("pick") : undefined;
    const sections = reviewSections(data);
    const firstChoice = new Map<string, HTMLInputElement>();
    const grids = [...sections].map(([group, indices]) => {
      const radioName = uid("pbs-pick");
      const items = indices.map((index) => {
        const item = data.items[index] as ReviewItemData;
        const control =
          pickLabel === undefined
            ? undefined
            : h("input", {
                type: data.pickMode === "multi" ? "checkbox" : "radio",
                name: radioName,
                value: item.name,
                checked: this.#picked.has(index),
                required: group !== undefined,
                "aria-label": `${pickLabel}: ${reviewItemName(item)}`,
              });
        if (group !== undefined && control && !firstChoice.has(group)) firstChoice.set(group, control);
        control?.addEventListener("change", () => {
          if (data.pickMode !== "multi") for (const i of indices) this.#picked.delete(i);
          if (control.checked) this.#picked.add(index);
          else this.#picked.delete(index);
        });
        return this.item(
          item,
          index,
          control && h("label", { part: "pick", class: "pick" }, control, pickLabel),
          comments,
        );
      });
      const grid = h(
        "div",
        {
          part: "items",
          class: "review-grid",
          "data-columns": data.columns ? Math.min(6, Math.max(1, Math.floor(data.columns))) : null,
        },
        items,
      );
      return group === undefined
        ? grid
        : h("fieldset", { part: "group", class: "question" }, h("legend", { class: "heading" }, group), grid);
    });
    const { row, status } = submitRow(data.submit ? inlinePlain(data.submit) : this.t("send"));
    const send = () => {
      const named = data.items.map(reviewItemName);
      const fields: [string, string][] = [["title", data.title ? inlinePlain(data.title) : this.t("reviewFallback")]];
      for (const [group, indices] of sections) {
        const selected = indices.filter((i) => this.#picked.has(i));
        if (group !== undefined && selected.length === 0) {
          status.textContent = this.t("unanswered") + group;
          firstChoice.get(group)?.focus();
          return;
        }
        for (const i of selected) fields.push([pickField(group), named[i] as string]);
      }
      // A blank box means no feedback, so a review with every box blank is still an answer.
      comments.forEach((comment, index) => {
        if (comment.trim()) fields.push(["item", named[index] as string], ["comment", comment.trim()]);
      });
      const silent = named.filter((_, index) => !(comments[index] as string).trim());
      if (silent.length > 0) fields.push(["silent", silent.join(", ")]);
      fields.push(...noteField(this.#note));
      if (this.answer({ kind: "review", ...(data.title ? { title: inlinePlain(data.title) } : {}), fields }))
        status.textContent = this.t("sent");
    };
    return sendingForm(
      send,
      { part: "review", class: "panel form-panel review" },
      title,
      grids,
      noteBox(this.t("otherComments"), this.#note, (text) => {
        this.#note = text;
      }),
      row,
    );
  }

  private item(item: ReviewItemData, index: number, pick: HTMLElement | undefined, comments: string[]): HTMLElement {
    const name = reviewItemName(item);
    const head = h("div", { class: "head" }, h("span", { part: "item-title", class: "heading" }, inlineNodes(name)));
    if (pick) head.append(pick);
    const media: Child[] = [];
    const config = configuration();
    if (item.image) media.push(this.image(item.image, name, index, config.imageUrl(item.image), comments));
    if (item.page) {
      const url = config.pageUrl?.(item.page);
      media.push(
        url
          ? h("iframe", {
              part: "frame",
              src: url,
              title: name,
              sandbox: "allow-scripts",
              height: item.height ?? 480,
              loading: "lazy",
            })
          : h("p", { class: "muted" }, this.t("pageUnavailable"), h("code", null, item.page)),
      );
    }
    const note = h("textarea", {
      part: "comment",
      "aria-label": `${name}: ${this.t("feedbackNote")}`,
      placeholder: this.t("feedbackNote"),
      value: comments[index],
    });
    note.addEventListener("input", () => {
      comments[index] = note.value;
    });
    this.#boxes[index] = note;
    return h(
      "article",
      { part: "item", class: "panel item", "data-picked": this.#picked.has(index) },
      head,
      media.length > 0 && h("div", { part: "media", class: "media" }, media),
      item.body && h("div", { part: "body", class: "copy" }, prose(item.body)),
      note,
    );
  }

  /** An image the host resolved, with an enlarge button; a reference the host will not resolve, or one that fails to load, shows a note. */
  private image(ref: string, name: string, index: number, url: string | undefined, comments: string[]): Node {
    const missing = () =>
      h("p", { part: "unavailable", class: "muted" }, `${this.t("imageUnavailable")}: `, h("code", null, ref));
    if (url === undefined) return missing();
    const wrap = h("div", { class: "media" });
    const image = h("img", { part: "image", src: url, alt: name, loading: "lazy" });
    const enlarge = h("button", { type: "button", part: "enlarge", class: "btn quiet" }, this.t("enlarge"));
    const shown: Shown = { index, url, name, opener: enlarge };
    this.#shown.push(shown);
    enlarge.addEventListener("click", () => this.lightbox(shown, comments));
    image.addEventListener("error", () => {
      this.#shown = this.#shown.filter((entry) => entry !== shown);
      wrap.replaceChildren(missing());
    });
    wrap.append(image, enlarge);
    return wrap;
  }

  /**
   * One modal for every picture of the review: Previous and Next (or the arrow keys outside the comment box) step
   * through them in item order, wrapping at the ends, and the box beside the picture is that item's comment box.
   */
  private lightbox(first: Shown, comments: string[]): void {
    let current = first;
    const picture = h("img", { part: "lightbox-image" });
    const heading = h("span", { part: "lightbox-title", class: "heading" });
    const position = h("span", { part: "position", class: "muted" });
    const previous = h(
      "button",
      { type: "button", part: "previous", class: "btn quiet" },
      `‹ ${this.t("previousImage")}`,
    );
    const next = h("button", { type: "button", part: "next", class: "btn quiet" }, `${this.t("nextImage")} ›`);
    const note = h("textarea", { part: "lightbox-comment", placeholder: this.t("feedbackNote") });
    const close = h("button", { type: "button", part: "close", class: "btn" }, this.t("close"));
    const dialog = h(
      "dialog",
      { part: "lightbox" },
      h(
        "div",
        { class: "lightbox" },
        h("div", { class: "stage" }, picture),
        h(
          "div",
          { class: "side" },
          h("div", { class: "head" }, heading, position),
          h("div", { part: "nav", class: "nav" }, previous, next),
          note,
          close,
        ),
      ),
    );
    const show = (entry: Shown) => {
      current = entry;
      const shown = this.#shown;
      picture.src = entry.url;
      picture.alt = entry.name;
      dialog.setAttribute("aria-label", entry.name);
      heading.replaceChildren(...inlineNodes(entry.name));
      position.textContent = this.t("imagePosition", { n: shown.indexOf(entry) + 1, total: shown.length });
      previous.hidden = next.hidden = shown.length < 2;
      note.value = comments[entry.index] ?? "";
      note.setAttribute("aria-label", `${entry.name}: ${this.t("feedbackNote")}`);
    };
    const step = (by: number) => {
      const shown = this.#shown;
      if (shown.length === 0) return;
      const at = Math.max(0, shown.indexOf(current));
      show(shown[(at + by + shown.length) % shown.length] as Shown);
    };
    const end = () => dialog.close();
    note.addEventListener("input", () => {
      comments[current.index] = note.value;
      const box = this.#boxes[current.index];
      if (box) box.value = note.value;
    });
    previous.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    close.addEventListener("click", end);
    dialog.addEventListener("keydown", (event) => {
      if (event.target === note || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) end();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      (current.opener.isConnected ? current.opener : first.opener).focus();
    });
    show(first);
    (first.opener.closest(".review") ?? first.opener.parentNode)?.append(dialog);
    dialog.showModal();
    (next.hidden ? note : next).focus();
  }

  /** The locked view: the pick, each comment, and the items left blank. */
  private sentView(title: Child): Node {
    const sent: AnsweredFields = this.answered ?? [];
    const values = (name: string) => sent.filter(([key]) => key === name).map(([, value]) => value);
    const items = values("item");
    const comments = values("comment");
    const [silent] = values("silent");
    const [note] = values(NOTE_FIELD);
    const row = (label: string, value: string) => h("div", null, h("dt", null, label), h("dd", null, value));
    return h(
      "section",
      { part: "review", class: "panel form-panel review" },
      h("div", { class: "sent-head" }, title, sentBadge(this.t("submitted"))),
      h(
        "dl",
        { part: "sent", class: "sent" },
        reviewPicks(sent).map(({ group, value }) => row(group ?? this.t("picked"), value)),
        items.map((item, index) => row(item, comments[index] ?? "")),
        silent && row(this.t("noFeedback"), silent),
        note && row(this.t("otherComments"), note),
      ),
    );
  }
}

export function defineReview(): void {
  define("pbs-review", PbsReview);
}
