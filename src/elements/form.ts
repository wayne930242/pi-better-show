import { inlinePlain } from "../core/inline.ts";
import type { FormData, QuestionData } from "../core/types.ts";
import { define, PbsElement } from "./base.ts";
import { controlCss, fieldOf, sendingForm, sentBadge, submitRow } from "./controls.ts";
import { type Child, h, inlineNodes, uid } from "./dom.ts";

/** What the agent reads for a question left empty; kept in English whatever the element's language, as pi-herdr-doc-review did. */
const NO_ANSWER = "(no answer)";

interface Entry {
  /** Values of the ticked choices. */
  picks: string[];
  /** Whether the "other" control is on, and what was typed in its box. */
  otherOn: boolean;
  other: string;
  /** A text question's answer. */
  text: string;
}

const emptyEntry = (): Entry => ({ picks: [], otherOn: false, other: "", text: "" });

const otherLabel = (question: QuestionData, fallback: string): string | undefined =>
  question.other === false ? undefined : question.other === true ? fallback : question.other;

/** The question's answer as the agent reads it: ticked values and the typed "other", joined; "" when unanswered. */
function answerOf(question: QuestionData, entry: Entry): string {
  if (question.type === "text") return entry.text.trim();
  const other = entry.otherOn ? entry.other.trim() : "";
  return [...entry.picks, other].filter(Boolean).join(", ");
}

export class PbsForm extends PbsElement<FormData> {
  static override css = controlCss;
  #entries: Entry[] | undefined;

  protected override reset(): void {
    this.#entries = undefined;
  }

  protected view(data: FormData): Node {
    this.#entries ??= data.questions.map(emptyEntry);
    const entries = this.#entries;
    const title = data.title && h("div", { part: "title", class: "title" }, inlineNodes(data.title));
    if (this.answered) return this.sentView(data, title);

    const groups: HTMLElement[] = [];
    const questions = data.questions.map((question, index) => {
      const group = this.question(question, entries[index] as Entry);
      groups.push(group);
      return group;
    });
    const error = h("p", { part: "error", class: "error", role: "alert" });
    const { row, status } = submitRow(data.submit ? inlinePlain(data.submit) : this.t("send"));

    const send = () => {
      const missing = data.questions.flatMap((question, index) =>
        question.required && answerOf(question, entries[index] as Entry) === "" ? [index] : [],
      );
      groups.forEach((group, index) => {
        if (missing.includes(index)) group.setAttribute("aria-invalid", "true");
        else group.removeAttribute("aria-invalid");
      });
      if (missing.length > 0) {
        status.textContent = "";
        error.textContent =
          this.t("unanswered") +
          missing
            .map((index) =>
              inlinePlain(
                (data.questions[index] as QuestionData).label ?? (data.questions[index] as QuestionData).name,
              ),
            )
            .join(", ");
        groups[missing[0] as number]?.querySelector<HTMLElement>("input, textarea")?.focus();
        return;
      }
      error.textContent = "";
      const fields: [string, string][] = data.questions.map((question, index) => [
        question.name,
        answerOf(question, entries[index] as Entry) || NO_ANSWER,
      ]);
      if (data.title) fields.unshift(["form", inlinePlain(data.title)]);
      const delivered = this.answer({
        kind: "form",
        ...(data.title ? { title: inlinePlain(data.title) } : {}),
        fields,
      });
      if (delivered) status.textContent = this.t("sent");
    };
    return sendingForm(
      send,
      { part: "form", class: "panel form-panel", ...(data.title ? { "aria-label": inlinePlain(data.title) } : {}) },
      title,
      questions,
      error,
      row,
    );
  }

  /** One question: a fieldset with its label, hint, and either choices (with a box for the user's own answer) or a text area. */
  private question(question: QuestionData, entry: Entry): HTMLElement {
    const labelId = uid("pbs-label");
    const hintId = uid("pbs-hint");
    const name = uid("pbs-q");
    const legend = h(
      "legend",
      { part: "label", class: "label", id: labelId },
      inlineNodes(question.label ?? question.name),
      question.required && [
        " ",
        h("span", { class: "req", "aria-hidden": "true" }, "*"),
        h("span", { class: "sr" }, ` (${this.t("required")})`),
      ],
    );
    const hint = question.hint && h("p", { part: "hint", class: "hint", id: hintId }, inlineNodes(question.hint));
    const body: Child[] = [];

    if (question.type === "text") {
      const box = h("textarea", {
        part: "textarea",
        "aria-labelledby": labelId,
        "aria-describedby": hint ? hintId : null,
        value: entry.text,
      });
      box.addEventListener("input", () => {
        entry.text = box.value;
      });
      body.push(box);
    } else {
      const kind = question.type === "multi" ? "checkbox" : "radio";
      const rows: HTMLElement[] = question.choices.map((choice) => {
        const control = h("input", {
          type: kind,
          name,
          value: choice.value,
          checked: entry.picks.includes(choice.value),
        });
        control.addEventListener("change", () => {
          if (question.type === "single") {
            entry.picks = [choice.value];
            entry.otherOn = false;
          } else
            entry.picks = control.checked
              ? [...entry.picks, choice.value]
              : entry.picks.filter((pick) => pick !== choice.value);
        });
        return h(
          "label",
          { part: "choice", class: "check" },
          control,
          h(
            "span",
            { class: "text" },
            inlineNodes(choice.label),
            choice.recommended !== undefined &&
              h(
                "span",
                { part: "badge", class: "badge", "data-tone": "ok" },
                choice.recommended === true ? this.t("recommended") : choice.recommended,
              ),
            choice.note && h("span", { class: "note" }, inlineNodes(choice.note)),
          ),
        );
      });
      const label = otherLabel(question, this.t("other"));
      if (label !== undefined) rows.push(this.otherRow(question, entry, kind, name, label, rows));
      body.push(h("div", { part: "choices", class: "choices" }, rows));
    }
    return h(
      "fieldset",
      { part: "question", class: "question", "aria-describedby": hint ? hintId : null },
      legend,
      hint,
      body,
    );
  }

  /** The row for the user's own answer: its control, and a box that turns the control on once it has text. */
  private otherRow(
    question: QuestionData,
    entry: Entry,
    kind: "radio" | "checkbox",
    name: string,
    label: string,
    siblings: HTMLElement[],
  ): HTMLElement {
    const control = h("input", { type: kind, name, class: "other-pick", "aria-label": label, checked: entry.otherOn });
    const box = h("input", {
      type: "text",
      part: "other",
      class: "other",
      placeholder: label,
      "aria-label": label,
      value: entry.other,
    });
    const single = question.type === "single";
    control.addEventListener("change", () => {
      entry.otherOn = control.checked;
      if (single && control.checked) entry.picks = [];
      if (control.checked) box.focus();
    });
    box.addEventListener("input", () => {
      entry.other = box.value;
      entry.otherOn = box.value !== "";
      control.checked = entry.otherOn;
      if (single && entry.otherOn) {
        entry.picks = [];
        for (const row of siblings) {
          const radio = row.querySelector<HTMLInputElement>("input");
          if (radio && radio !== control) radio.checked = false;
        }
      }
    });
    return h("div", { part: "choice", class: "check" }, control, h("span", { class: "text" }, box));
  }

  /** The locked view: each question with the value that was sent. */
  private sentView(data: FormData, title: Child): Node {
    const sent = this.answered ?? [];
    const known = new Set(data.questions.map((question) => question.name));
    const rows: [string, string][] = [
      ...data.questions.flatMap((question): [string, string][] => {
        const value = fieldOf(sent, question.name);
        return value === undefined ? [] : [[inlinePlain(question.label ?? question.name), value]];
      }),
      ...sent
        .filter(([name]) => name !== "form" && !known.has(name))
        .map(([name, value]): [string, string] => [name, value]),
    ];
    return h(
      "section",
      { part: "form", class: "panel form-panel" },
      h("div", { class: "sent-head" }, title, sentBadge(this.t("submitted"))),
      h(
        "dl",
        { part: "sent", class: "sent" },
        rows.map(([label, value]) => h("div", null, h("dt", null, label), h("dd", null, value))),
      ),
    );
  }
}

export function defineForm(): void {
  define("pbs-form", PbsForm);
}
