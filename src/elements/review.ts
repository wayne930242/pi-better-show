import { NOTE_FIELD, reviewItemName } from "../core/blocks.ts";
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
dialog { max-width: 96vw; max-height: 96vh; padding: 0; border: 0; background: transparent; color: var(--_fg); }
dialog::backdrop { background: rgb(0 0 0 / 0.82); }
dialog img { display: block; max-width: 94vw; max-height: 88vh; margin: 0 auto; object-fit: contain; border-radius: var(--_radius); background: var(--_bg); }
dialog .btn { display: block; margin: 0.5rem auto 0; }
`;

export class PbsReview extends PbsElement<ReviewData> {
  static override css = reviewCss;
  #picked: string | undefined;
  #comments: string[] | undefined;
  #note = "";
  readonly #group = uid("pbs-pick");

  protected override reset(): void {
    this.#picked = undefined;
    this.#comments = undefined;
    this.#note = "";
  }

  protected view(data: ReviewData): Node {
    const title = data.title && h("div", { part: "title", class: "title" }, inlineNodes(data.title));
    if (this.answered) return this.sentView(title);
    this.#comments ??= data.items.map(() => "");
    const comments = this.#comments;
    const pickLabel = data.pick === undefined ? undefined : data.pick === true ? this.t("pick") : data.pick;
    const items = data.items.map((item, index) => this.item(item, index, pickLabel, comments));
    const grid = h(
      "div",
      {
        part: "items",
        class: "review-grid",
        "data-columns": data.columns ? Math.min(6, Math.max(1, Math.floor(data.columns))) : null,
      },
      items,
    );
    const { row, status } = submitRow(data.submit ? inlinePlain(data.submit) : this.t("send"));
    const send = () => {
      const named = data.items.map(reviewItemName);
      const fields: [string, string][] = [["title", data.title ? inlinePlain(data.title) : this.t("reviewFallback")]];
      const picked = data.items.findIndex((item) => item.name === this.#picked);
      if (picked >= 0) fields.push(["picked", named[picked] as string]);
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
      grid,
      noteBox(this.t("otherComments"), this.#note, (text) => {
        this.#note = text;
      }),
      row,
    );
  }

  private item(item: ReviewItemData, index: number, pickLabel: string | undefined, comments: string[]): HTMLElement {
    const name = reviewItemName(item);
    const head = h("div", { class: "head" }, h("span", { part: "item-title", class: "heading" }, inlineNodes(name)));
    if (pickLabel !== undefined) {
      const radio = h("input", {
        type: "radio",
        name: this.#group,
        value: item.name,
        checked: this.#picked === item.name,
      });
      radio.addEventListener("change", () => {
        this.#picked = item.name;
      });
      head.append(h("label", { part: "pick", class: "pick" }, radio, pickLabel));
    }
    const media: Child[] = [];
    const config = configuration();
    if (item.image) media.push(this.image(item.image, name, config.imageUrl(item.image)));
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
    return h(
      "article",
      { part: "item", class: "panel item", "data-picked": this.#picked === item.name },
      head,
      media.length > 0 && h("div", { part: "media", class: "media" }, media),
      item.body && h("div", { part: "body", class: "copy" }, prose(item.body)),
      note,
    );
  }

  /** An image the host resolved, with an enlarge button; a reference the host will not resolve, or one that fails to load, shows a note. */
  private image(ref: string, name: string, url: string | undefined): Node {
    const missing = () =>
      h("p", { part: "unavailable", class: "muted" }, `${this.t("imageUnavailable")}: `, h("code", null, ref));
    if (url === undefined) return missing();
    const wrap = h("div", { class: "media" });
    const image = h("img", { part: "image", src: url, alt: name, loading: "lazy" });
    const enlarge = h("button", { type: "button", part: "enlarge", class: "btn quiet" }, this.t("enlarge"));
    enlarge.addEventListener("click", () => this.lightbox(url, name, enlarge));
    image.addEventListener("error", () => wrap.replaceChildren(missing()));
    wrap.append(image, enlarge);
    return wrap;
  }

  private lightbox(url: string, name: string, opener: HTMLElement): void {
    const close = h("button", { type: "button", part: "close", class: "btn" }, this.t("close"));
    const dialog = h("dialog", { part: "lightbox", "aria-label": name }, h("img", { src: url, alt: name }), close);
    const end = () => dialog.close();
    close.addEventListener("click", end);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) end();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      opener.focus();
    });
    opener.after(dialog);
    dialog.showModal();
    close.focus();
  }

  /** The locked view: the pick, each comment, and the items left blank. */
  private sentView(title: Child): Node {
    const sent: AnsweredFields = this.answered ?? [];
    const values = (name: string) => sent.filter(([key]) => key === name).map(([, value]) => value);
    const items = values("item");
    const comments = values("comment");
    const [picked] = values("picked");
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
        picked && row(this.t("picked"), picked),
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
