import { NOTE_FIELD } from "../core/blocks.ts";
import type { AnsweredFields } from "./base.ts";
import { type Child, h } from "./dom.ts";

/** Pieces the interactive elements share: their CSS, the submit row, and the locked view of what was sent. */

export const controlCss = `
.choices { display: flex; flex-direction: column; gap: 0.4rem; }
.check {
  display: flex; gap: 0.6rem; align-items: flex-start; cursor: pointer;
  padding: var(--_pad-s) 0.7rem;
  background: var(--_bg);
  border: 1px solid var(--_line);
  border-radius: var(--_radius);
}
.check:has(input:checked) { border-color: var(--_accent); background: color-mix(in srgb, var(--_accent) 7%, var(--_bg)); }
.check .text { min-width: 0; flex: 1; }
.check .note { display: block; color: var(--_muted); font-size: 0.9em; }
.check .badge { margin-left: 0.4rem; }
.check[aria-disabled="true"], .check:has(input:disabled) { cursor: default; }
.check input[type="text"] { margin: -0.1rem 0; }

.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.chip {
  font: inherit; cursor: pointer;
  padding: 0.25em 0.95em;
  color: var(--_accent); background: var(--_bg);
  border: 1px solid var(--_control); border-radius: 999px;
}
.chip:hover:not([aria-disabled="true"]) { background: var(--_surface); }
.chip[aria-disabled="true"] { opacity: 0.55; cursor: default; }
.chip[aria-pressed="true"] { opacity: 1; font-weight: 600; border-color: var(--_accent); background: color-mix(in srgb, var(--_accent) 12%, var(--_bg)); }

.pros, .cons { list-style: none; padding: 0; margin: 0.5rem 0 0; }
.pros li, .cons li { position: relative; padding-left: 1.3em; }
.pros li::before, .cons li::before { position: absolute; left: 0.2em; font-weight: 700; }
.pros li::before { content: "+"; color: var(--_ok); }
.cons li::before { content: "\\2212"; color: var(--_risk); }

.option > .row { margin-top: 0.75rem; }
.panel[data-selected] { border-color: var(--_accent); background: color-mix(in srgb, var(--_accent) 8%, var(--_bg)); }
.panel[data-dim] { opacity: 0.6; }
.btn[aria-disabled="true"] { opacity: 0.6; cursor: default; }

.form-panel { display: flex; flex-direction: column; gap: var(--_gap); }
.form-panel > .title { font-size: 1.1em; font-weight: 650; }
fieldset.question { border: 0; min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.question .label { font-weight: 600; }
.question .req { color: var(--_risk); }
.question .hint { color: var(--_muted); font-size: 0.9em; }
.question[aria-invalid="true"] .label { color: var(--_risk); }
.note-field { display: flex; flex-direction: column; gap: 0.3rem; }
.note-field .label { font-weight: 600; }
.sent-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
`;

/** The send button with its live status line. */
export function submitRow(label: string): { row: HTMLElement; button: HTMLButtonElement; status: HTMLElement } {
  const button = h("button", { type: "submit", part: "submit", class: "btn" }, label);
  const status = h("span", { part: "status", class: "status", role: "status", "aria-live": "polite" });
  return { row: h("div", { part: "actions", class: "row" }, button, status), button, status };
}

/** The fixed "Other comments" box above a submit button: its text is sent as the reserved `note` field when not blank. */
export function noteBox(label: string, value: string, onInput: (text: string) => void): HTMLElement {
  const box = h("textarea", {
    part: "note",
    class: "note-box",
    maxlength: 1024,
    rows: 2,
    value,
  });
  box.addEventListener("input", () => onInput(box.value));
  return h("label", { part: "note-field", class: "note-field" }, h("span", { class: "label" }, label), box);
}

/** The reserved field for a note, or nothing when blank. */
export const noteField = (text: string): [string, string][] => (text.trim() ? [[NOTE_FIELD, text.trim()]] : []);

/** A form wrapper that submits through `onSend`, from the button, Enter in a one-line box, or Ctrl/Cmd+Enter anywhere inside. */
export function sendingForm(onSend: () => void, props: Record<string, string>, ...children: Child[]): HTMLFormElement {
  const form = h("form", { novalidate: true, ...props }, ...children);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSend();
  });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      onSend();
    }
  });
  return form;
}

/** The first value submitted under a name, or undefined. */
export const fieldOf = (fields: AnsweredFields | undefined, name: string): string | undefined =>
  fields?.find(([key]) => key === name)?.[1];

/** What a locked element shows: each submitted field as a label and its value. */
export function sentList(fields: AnsweredFields, skip: string[] = []): HTMLElement {
  return h(
    "dl",
    { part: "sent", class: "sent" },
    fields
      .filter(([name]) => !skip.includes(name))
      .map(([name, value]) => h("div", null, h("dt", null, name), h("dd", null, value))),
  );
}

/** A tone-coloured "Sent" marker for a locked element. */
export const sentBadge = (text: string): HTMLElement =>
  h("span", { part: "badge", class: "badge", "data-tone": "ok" }, `✓ ${text}`);
