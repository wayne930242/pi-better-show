import { NOTE_FIELD, optionName, reviewItemName } from "./blocks.ts";
import type { Answer, AnswerKind, BlockSegment, FormData, QuestionData } from "./types.ts";

/** `reason` says what is wrong, for a host's refusal. */
export type Validation = { ok: true } | { ok: false; reason: string };

const MAX_FIELDS = 64;
const MAX_LENGTH = 1024;
/** What the form element writes for a question left empty. */
const NO_ANSWER = "(no answer)";

const KINDS: Partial<Record<BlockSegment["kind"], AnswerKind>> = {
  options: "pick",
  suggest: "suggest",
  form: "form",
  checklist: "checklist",
  review: "review",
};

const fail = (reason: string): Validation => ({ ok: false, reason });
const PASS: Validation = { ok: true };
const quoted = (text: string): string => JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text);

type Fields = Answer["fields"];

const valuesOf = (fields: Fields, name: string): string[] =>
  fields.filter(([key]) => key === name).map(([, value]) => value);

/** A choice question's value is a choice's value, or the joined list the form element sends; free text only where `other` allows. */
function choiceProblem(question: QuestionData, value: string): string | undefined {
  if (question.other !== false || value === NO_ANSWER) return undefined;
  const known = new Set(question.choices.map((choice) => choice.value));
  if (known.has(value)) return undefined;
  const parts = question.type === "multi" ? value.split(", ") : [value];
  const unknown = parts.find((part) => !known.has(part));
  return unknown === undefined ? undefined : `unknown choice ${quoted(unknown)} for question ${quoted(question.name)}`;
}

function formProblem(data: FormData, fields: Fields): string | undefined {
  const questions = new Map(data.questions.map((question) => [question.name, question]));
  const seen = new Set<string>();
  for (const [name, value] of fields) {
    if (name === "form") continue;
    const question = questions.get(name);
    if (!question) return `unknown question ${quoted(name)}`;
    if (seen.has(name) && question.type !== "multi")
      return `several values for ${quoted(name)}, which is not a multi question`;
    seen.add(name);
    if (question.type !== "text") {
      const problem = choiceProblem(question, value);
      if (problem) return problem;
    }
  }
  const missing = data.questions.find(
    (question) =>
      question.required && !valuesOf(fields, question.name).some((value) => value.trim() !== "" && value !== NO_ANSWER),
  );
  return missing ? `required question ${quoted(missing.name)} is not answered` : undefined;
}

function reviewProblem(block: Extract<BlockSegment, { kind: "review" }>, fields: Fields): string | undefined {
  const names = block.data.items.map(reviewItemName);
  const known = new Set(names);
  for (const [name, value] of fields) {
    if (name === "title" || name === "comment") continue;
    if (name === "picked") {
      if (block.data.pick === undefined) return "this review has no pick";
      if (!known.has(value)) return `unknown item ${quoted(value)}`;
    } else if (name === "item") {
      if (!known.has(value)) return `unknown item ${quoted(value)}`;
    } else if (name === "silent") {
      const unknown = known.has(value) ? undefined : value.split(", ").find((part) => !known.has(part));
      if (unknown !== undefined) return `unknown item ${quoted(unknown)}`;
    } else return `unknown field ${quoted(name)}`;
  }
  if (valuesOf(fields, "picked").length > 1) return "only one item can be picked";
  if (valuesOf(fields, "title").length > 1) return "several titles";
  if (valuesOf(fields, "comment").length > valuesOf(fields, "item").length) return "a comment without an item";
  const items = valuesOf(fields, "item");
  if (new Set(items).size !== items.length) return "an item is named twice";
  return undefined;
}

function problem(block: BlockSegment, answer: Answer): string | undefined {
  const { fields } = answer;
  switch (block.kind) {
    case "options": {
      if (fields.length !== 1 || fields[0]?.[0] !== "picked") return "a pick carries exactly one picked field";
      const picked = fields[0][1];
      return block.data.options.some((option, index) => optionName(option, index) === picked)
        ? undefined
        : `unknown option ${quoted(picked)}`;
    }
    case "suggest": {
      if (fields.length !== 1 || fields[0]?.[0] !== "text") return "a suggestion carries exactly one text field";
      const text = fields[0][1];
      return block.data.items.some((item) => item.text === text) ? undefined : `unknown suggestion ${quoted(text)}`;
    }
    case "form":
      return formProblem(block.data, fields);
    case "review":
      return reviewProblem(block, fields);
    case "checklist": {
      const names = new Set(block.data.items.map((item) => item.name));
      const seen = new Set<string>();
      for (const [name, state] of fields) {
        if (!names.has(name)) return `unknown item ${quoted(name)}`;
        if (seen.has(name)) return `item ${quoted(name)} appears twice`;
        seen.add(name);
        if (state !== "checked" && state !== "unchecked") return `unknown mark ${quoted(state)}`;
      }
      return undefined;
    }
    default:
      return `a ${block.kind} block takes no answer`;
  }
}

/** A form question or checklist item named like the reserved note field could not be told from the comments box. */
function reservedName(block: BlockSegment): string | undefined {
  const clash =
    block.kind === "form"
      ? block.data.questions.some((question) => question.name === NOTE_FIELD)
      : block.kind === "checklist"
        ? block.data.items.some((item) => item.name === NOTE_FIELD)
        : false;
  return clash ? `the name ${quoted(NOTE_FIELD)} is reserved for other comments` : undefined;
}

/**
 * Whether an untrusted `answer` fits `block`: its kind is the block's, every field names a question, choice, or item
 * of the block, several values appear only for a `multi` form question, required questions are answered, one optional
 * `pi-note` field (the "Other comments" box) is accepted on every kind, and there are at most 64 fields of 1,024
 * characters each.
 */
export function validateAnswer(block: BlockSegment, answer: Answer): Validation {
  // The answer comes from outside: check its shape before reading it.
  const shaped = answer as { kind?: unknown; fields?: unknown };
  if (typeof shaped.kind !== "string") return fail("answer kind is not a string");
  if (
    !Array.isArray(shaped.fields) ||
    !shaped.fields.every(
      (pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string",
    )
  )
    return fail("answer fields are not pairs of strings");
  const expected = KINDS[block.kind];
  if (expected === undefined) return fail(`a ${block.kind} block takes no answer`);
  if (answer.kind !== expected) return fail(`answer kind ${quoted(answer.kind)} does not fit a ${block.kind} block`);
  if (answer.fields.filter(([name]) => name !== NOTE_FIELD).length > MAX_FIELDS)
    return fail(`more than ${MAX_FIELDS} fields`);
  if (answer.fields.some(([name, value]) => name.length > MAX_LENGTH || value.length > MAX_LENGTH))
    return fail(`a field is longer than ${MAX_LENGTH} characters`);
  const notes = answer.fields.filter(([name]) => name === NOTE_FIELD);
  if (notes.length > 1) return fail("several other comments");
  const reserved = reservedName(block);
  if (reserved) return fail(reserved);
  const found = problem(block, { ...answer, fields: answer.fields.filter(([name]) => name !== NOTE_FIELD) });
  return found === undefined ? PASS : fail(found);
}
