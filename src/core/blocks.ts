import { inlinePlain } from "./inline.ts";
import { entryOf, itemsOf, list, mappingOf, oneOf, positiveNumber, recommended, record, text } from "./normalize.ts";
import type {
  CardsData,
  ChoiceData,
  FormData,
  OptionsData,
  QuestionData,
  QuestionType,
  ReviewData,
  ReviewItemData,
} from "./types.ts";

/** The show-doc blocks that predate pi-better-show; their YAML schemas are kept exactly (pi-herdr-doc-review). */

export function cards(data: unknown): CardsData {
  return {
    cards: itemsOf(data, "cards").map((item) => {
      const card = record(item, "card");
      return { title: text(card.title, "title"), tone: text(card.tone, "tone"), body: text(card.body, "body") };
    }),
  };
}

export function options(data: unknown): OptionsData {
  return {
    options: itemsOf(data, "options").map((item) => {
      const option = record(item, "option");
      return {
        title: text(option.title, "title"),
        recommended: recommended(option.recommended),
        body: text(option.body, "body"),
        pros: list(option.pros, "pros"),
        cons: list(option.cons, "cons"),
      };
    }),
  };
}

const QUESTION_TYPES = ["single", "multi", "text"] as const;

function choice(entry: unknown): ChoiceData {
  const raw = entryOf(entry, "label", "choice");
  const label = text(raw.label ?? raw.value, "choice label");
  if (label === undefined) throw new Error("each choice needs a label or a value");
  return {
    value: text(raw.value, "choice value") ?? label,
    label,
    note: text(raw.note, "note"),
    recommended: recommended(raw.recommended),
  };
}

function question(item: unknown): QuestionData {
  const raw = record(item, "question");
  const label = text(raw.label, "label");
  const name = text(raw.name, "name") ?? label;
  if (name === undefined) throw new Error("each question needs a name or a label");
  const entries: unknown[] = Array.isArray(raw.choices) ? raw.choices : list(raw.choices, "choices");
  const choices = entries.map(choice);
  const type: QuestionType = oneOf(raw.type, QUESTION_TYPES, "type") ?? (choices.length > 0 ? "single" : "text");
  const other =
    raw.other === undefined || raw.other === null
      ? choices.length > 0
      : typeof raw.other === "boolean"
        ? raw.other
        : String(raw.other);
  return {
    name,
    label,
    type,
    hint: text(raw.hint, "hint"),
    required: raw.required === true,
    other: type === "text" ? false : other,
    choices,
  };
}

export function form(data: unknown): FormData {
  const raw = mappingOf(data);
  return {
    title: text(raw.title, "title"),
    submit: text(raw.submit, "submit"),
    questions: itemsOf(data, "questions").map(question),
  };
}

/**
 * Item names: an item's own name, else the next letter no item claims (A, B, C, ..., then numbers);
 * a repeated name gets a number, so every item keeps its own pick value and comment.
 */
export function reviewNames(names: (string | undefined)[]): string[] {
  const claimed = new Set(names.filter(Boolean));
  const taken = new Set<string>();
  let next = 0;
  const free = (): string => {
    for (;;) {
      const name = next < 26 ? String.fromCharCode(65 + next) : String(next + 1);
      next++;
      if (!claimed.has(name)) return name;
    }
  };
  return names.map((name) => {
    const base = name || free();
    let unique = base;
    for (let count = 2; taken.has(unique); count++) unique = `${base}${count}`;
    taken.add(unique);
    return unique;
  });
}

/** An item's name with its label, as the agent reads it: `B (dark header)`. */
export const reviewItemName = (item: { name: string; label?: string }): string =>
  item.label ? `${item.name} (${item.label})` : item.name;

/** The name an option answers with: its plain title, else its 1-based number. */
export const optionName = (option: { title?: string }, index: number): string =>
  option.title ? inlinePlain(option.title) : String(index + 1);

export function review(data: unknown): ReviewData {
  const raw = mappingOf(data);
  const entries = itemsOf(data, "items").map((entry) => entryOf(entry, "image", "item"));
  const names = reviewNames(entries.map((entry) => text(entry.name, "name")));
  const items: ReviewItemData[] = entries.map((entry, index) => ({
    name: names[index] as string,
    label: text(entry.label, "label"),
    image: text(entry.image, "image"),
    page: text(entry.page, "page"),
    height: positiveNumber(entry.height, "height"),
    body: text(entry.body, "body"),
  }));
  return {
    title: text(raw.title, "title"),
    submit: text(raw.submit, "submit"),
    pick: recommended(raw.pick),
    columns: positiveNumber(raw.columns, "columns"),
    items,
  };
}
