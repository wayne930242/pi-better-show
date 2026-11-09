import { NOTE_FIELD } from "./blocks.ts";
import type { Answer } from "./types.ts";

type Fields = readonly (readonly [string, string])[];

const first = (fields: Fields, name: string): string | undefined => fields.find(([key]) => key === name)?.[1];
const all = (fields: Fields, name: string): string[] =>
  fields.filter(([key]) => key === name).map(([, value]) => value);

/** The agent's view of one submitted form: one `- name: value` line per field. */
function formText(fields: Fields): string {
  const lines = fields.map(([name, value]) => `- ${name}: ${value}`);
  return `User submitted a form in the HTML review pane:\n${lines.join("\n") || "(no fields)"}`;
}

/** A page's feedback panel: each commented passage quoted with its comment, then the overall note. */
function feedbackText(fields: Fields, title: string | undefined): string {
  const quotes = all(fields, "quote");
  const comments = all(fields, "comment");
  const parts = quotes.map((quote, index) => {
    const quoted = quote
      ? quote
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      : "";
    return [quoted, comments[index] || "(no comment)"].filter(Boolean).join("\n");
  });
  const overall = first(fields, "overall");
  if (overall) parts.push(`Overall: ${overall}`);
  return `User feedback on the page "${first(fields, "page") ?? title ?? ""}":\n\n${parts.join("\n\n") || "(empty)"}`;
}

/** A sent review: the picked item, each commented item with its comment, and the items left blank (no feedback). */
function reviewText(fields: Fields, title: string | undefined): string {
  const comments = all(fields, "comment");
  const lines = all(fields, "item").map(
    (item, index) => `- ${item}: ${(comments[index] ?? "").replace(/\n/g, "\n  ")}`,
  );
  const picked = first(fields, "picked");
  const silent = first(fields, "silent");
  return [
    `User reviewed "${first(fields, "title") ?? title ?? ""}":`,
    ...(picked ? [`Picked: ${picked}`] : []),
    ...lines,
    ...(silent ? [`No feedback on: ${silent}`] : []),
  ].join("\n");
}

function pickText(fields: Fields, title: string | undefined): string {
  const picked = first(fields, "picked") ?? "";
  return `User picked "${picked}"${title ? ` for "${title}"` : ""}.`;
}

function checklistText(fields: Fields, title: string | undefined): string {
  const lines = fields.map(([name, state]) => `${state === "checked" ? "☑" : "☐"} ${name}`);
  return [`User updated the checklist${title ? ` "${title}"` : ""}:`, ...lines].join("\n");
}

/**
 * The text the agent reads for an answer. `form`, `review`, and `feedback` are byte-compatible with
 * pi-herdr-doc-review's `formMessage`, `reviewMessage`, and `pageFeedbackMessage` for the same fields;
 * the legacy `pi-kind` field is ignored because `answer.kind` carries it. `ref` addresses the block for
 * hosts and does not appear in the text.
 */
export function encodeAnswer(answer: Answer): string {
  const fields = answer.fields.filter(([name]) => name !== "pi-kind");
  if (answer.kind === "feedback") return encodeKind(answer, fields);
  const note = first(fields, NOTE_FIELD)?.trim();
  const body = encodeKind(
    answer,
    fields.filter(([name]) => name !== NOTE_FIELD),
  );
  return note ? `${body}\n\nOther comments: ${note}` : body;
}

function encodeKind(answer: Answer, fields: Fields): string {
  switch (answer.kind) {
    case "form":
      return formText(fields);
    case "review":
      return reviewText(fields, answer.title);
    case "feedback":
      return feedbackText(fields, answer.title);
    case "pick":
      return pickText(fields, answer.title);
    case "suggest":
      return first(fields, "text") ?? fields.map(([, value]) => value).join("\n");
    case "checklist":
      return checklistText(fields, answer.title);
  }
}
