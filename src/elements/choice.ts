import { NOTE_FIELD, optionName } from "../core/blocks.ts";
import { inlinePlain } from "../core/inline.ts";
import type { ChecklistData, OptionData, OptionsData, SuggestData } from "../core/types.ts";
import { define, PbsElement } from "./base.ts";
import { controlCss, fieldOf, noteBox, noteField, sendingForm, sentBadge, submitRow } from "./controls.ts";
import { h, inlineNodes, prose, uid } from "./dom.ts";

/** The elements that answer with a pick or ticks: options, suggest, checklist. */

/**
 * One-shot elements (options, suggest) lock themselves once a listener takes the answer, so a double click sends
 * once; the host's `answered` then shows what was sent. Setting `answered` (even to `undefined`) clears the local lock,
 * so a host whose delivery failed can reopen the element.
 */
export class PbsOptions extends PbsElement<OptionsData> {
  static override css = controlCss;
  #sent: number | undefined;
  #note = "";

  protected override reset(): void {
    this.#sent = undefined;
    this.#note = "";
  }
  protected override settled(): void {
    this.#sent = undefined;
  }

  protected view(data: OptionsData): Node[] {
    const picked = fieldOf(this.answered, "picked");
    const selected =
      this.#sent ?? (picked === undefined ? undefined : data.options.findIndex((o, i) => optionName(o, i) === picked));
    const locked = this.answered !== undefined || this.#sent !== undefined;
    const sentNote = fieldOf(this.answered, NOTE_FIELD) ?? (this.#sent === undefined ? "" : this.#note.trim());
    const pick = (index: number) => {
      if (locked) return;
      const ok = this.answer({
        kind: "pick",
        fields: [["picked", optionName(data.options[index] as OptionData, index)], ...noteField(this.#note)],
      });
      if (!ok) return;
      this.#sent = index;
      this.refresh();
      this.focusIn("[data-selected] button");
    };
    return [
      h(
        "div",
        { part: "grid", class: "grid", role: "list", "aria-label": this.t("options") },
        data.options.map((option, index) => {
          const chosen = selected === index;
          const name = optionName(option, index);
          const button = h(
            "button",
            {
              type: "button",
              part: "pick",
              class: "btn",
              "aria-disabled": locked ? "true" : null,
              "aria-label": `${this.t("pick")}: ${name}`,
            },
            chosen ? `✓ ${this.t("picked")}` : this.t("pick"),
          );
          button.addEventListener("click", () => pick(index));
          return h(
            "article",
            {
              part: "option",
              class: "panel option",
              role: "listitem",
              "data-selected": chosen,
              "data-dim": locked && !chosen,
            },
            h(
              "div",
              { part: "title", class: "heading" },
              option.title ? inlineNodes(option.title) : name,
              option.recommended !== undefined &&
                h(
                  "span",
                  { part: "badge", class: "badge", "data-tone": "ok" },
                  option.recommended === true ? this.t("recommended") : option.recommended,
                ),
            ),
            option.body && prose(option.body),
            option.pros.length > 0 &&
              h(
                "ul",
                { part: "pros", class: "pros" },
                option.pros.map((pro) => h("li", null, inlineNodes(pro))),
              ),
            option.cons.length > 0 &&
              h(
                "ul",
                { part: "cons", class: "cons" },
                option.cons.map((con) => h("li", null, inlineNodes(con))),
              ),
            h("div", { part: "actions", class: "row" }, button),
          );
        }),
      ),
      ...(locked
        ? sentNote
          ? [h("p", { part: "sent-note", class: "status" }, `${this.t("otherComments")}: ${sentNote}`)]
          : []
        : [
            noteBox(this.t("otherComments"), this.#note, (text) => {
              this.#note = text;
            }),
          ]),
      h("p", { part: "status", class: "status", role: "status", "aria-live": "polite" }, locked ? this.t("sent") : ""),
    ];
  }
}

export class PbsSuggest extends PbsElement<SuggestData> {
  static override css = controlCss;
  #sent: number | undefined;

  protected override reset(): void {
    this.#sent = undefined;
  }
  protected override settled(): void {
    this.#sent = undefined;
  }

  protected view(data: SuggestData): Node {
    const text = fieldOf(this.answered, "text");
    const selected =
      this.#sent ?? (text === undefined ? undefined : data.items.findIndex((item) => item.text === text));
    const locked = this.answered !== undefined || this.#sent !== undefined;
    const chips = data.items.map((item, index) => {
      const chosen = selected === index;
      const chip = h(
        "button",
        {
          type: "button",
          part: "chip",
          class: "chip",
          "aria-disabled": locked ? "true" : null,
          "aria-pressed": locked ? String(chosen) : null,
          "data-selected": chosen,
        },
        inlineNodes(item.label),
      );
      chip.addEventListener("click", () => {
        if (locked) return;
        if (!this.answer({ kind: "suggest", fields: [["text", item.text]] })) return;
        this.#sent = index;
        this.refresh();
        this.focusIn("[data-selected]");
      });
      return chip;
    });
    return h(
      "div",
      { part: "suggest", class: "suggest" },
      h("div", { part: "chips", class: "chips", role: "group", "aria-label": this.t("suggestions") }, chips),
      text !== undefined &&
        selected === -1 &&
        h("p", { part: "status", class: "status" }, `${this.t("submitted")}: ${text}`),
    );
  }
}

export class PbsChecklist extends PbsElement<ChecklistData> {
  static override css = controlCss;
  #checked: boolean[] | undefined;
  #note = "";

  protected override reset(): void {
    this.#checked = undefined;
    this.#note = "";
  }

  protected view(data: ChecklistData): Node {
    const locked = this.answered;
    this.#checked ??= data.items.map((item) => item.checked);
    const checked = this.#checked;
    const stateOf = (index: number): boolean => {
      const item = data.items[index] as ChecklistData["items"][number];
      return locked ? fieldOf(locked, item.name) === "checked" : (checked[index] as boolean);
    };
    const progress = h("span", { part: "progress", class: "status" });
    const tally = () =>
      (progress.textContent = this.t("checklistProgress", {
        done: data.items.filter((_, index) => stateOf(index)).length,
        total: data.items.length,
      }));
    const rows = data.items.map((item, index) => {
      const id = uid("pbs-check");
      const box = h("input", { type: "checkbox", id, checked: stateOf(index), disabled: locked !== undefined });
      box.addEventListener("change", () => {
        checked[index] = box.checked;
        tally();
      });
      return h(
        "label",
        { part: "item", class: "check", for: id },
        box,
        h(
          "span",
          { class: "text" },
          inlineNodes(item.label),
          item.note && h("span", { class: "note" }, inlineNodes(item.note)),
        ),
      );
    });
    tally();
    const title = data.title && h("div", { part: "title", class: "heading" }, inlineNodes(data.title));
    const group = h(
      "div",
      {
        part: "items",
        class: "choices",
        role: "group",
        "aria-label": data.title ? inlinePlain(data.title) : undefined,
      },
      rows,
    );
    const sentNote = fieldOf(locked, NOTE_FIELD);
    if (locked) {
      return h(
        "section",
        { part: "checklist", class: "panel form-panel" },
        h("div", { class: "sent-head" }, title, sentBadge(this.t("submitted"))),
        group,
        progress,
        sentNote && h("p", { part: "sent-note", class: "status" }, `${this.t("otherComments")}: ${sentNote}`),
      );
    }
    const { row, status } = submitRow(data.submit ? inlinePlain(data.submit) : this.t("send"));
    const send = () => {
      const fields: [string, string][] = data.items.map((item, index) => [
        item.name,
        checked[index] ? "checked" : "unchecked",
      ]);
      fields.push(...noteField(this.#note));
      if (this.answer({ kind: "checklist", ...(data.title ? { title: inlinePlain(data.title) } : {}), fields }))
        status.textContent = this.t("sent");
    };
    return sendingForm(
      send,
      { part: "checklist", class: "panel form-panel" },
      title,
      group,
      progress,
      noteBox(this.t("otherComments"), this.#note, (text) => {
        this.#note = text;
      }),
      row,
    );
  }
}

export function defineChoice(): void {
  define("pbs-options", PbsOptions);
  define("pbs-suggest", PbsSuggest);
  define("pbs-checklist", PbsChecklist);
}
