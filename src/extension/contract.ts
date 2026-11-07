import type { Answer, AnswerKind } from "../core/types.ts";

/** The document contract on pi's event bus, version 2. Every payload carries `version`. */
export const CONTRACT_VERSION = 2;
export const DOCUMENTS_EVENT = "better-show:documents";
export const DOCUMENTS_REQUEST_EVENT = "better-show:documents-request";
export const ANSWER_EVENT = "better-show:answer";
export const ANSWER_RESULT_EVENT = "better-show:answer-result";

/** `blocks` is a Markdown page with blocks, `html` a page that runs in a sandbox, `text` a document edited in the user's editor. */
export type DocKind = "blocks" | "html" | "text";

/** A document as the event bus lists it: a capability instead of a path. */
export interface PublishedDocument {
  id: string;
  kind: DocKind;
  display: string;
  reason: string;
  revision: number;
  onScreen: boolean;
  /** Where the document is fetched while the page server runs: Markdown text for `blocks`, the page for `html`, the text for `text`. */
  capability?: string;
  /** The directory URL that the document's relative references (images, prototypes) resolve against. */
  assets?: string;
}

export interface AnswerResult {
  version: typeof CONTRACT_VERSION;
  id: string;
  answerId: string;
  accepted: boolean;
  /** `closed`, `invalid`, `empty`, or a delivery error. */
  reason?: string;
}

const KINDS: readonly AnswerKind[] = ["form", "review", "feedback", "pick", "suggest", "checklist"];

/** The answer a viewer sent, or undefined when it is not the shape of an `Answer`. */
export function parseAnswer(value: unknown): Answer | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { kind, title, fields, ref } = value as Record<string, unknown>;
  if (typeof kind !== "string" || !KINDS.includes(kind as AnswerKind)) return undefined;
  if (title !== undefined && typeof title !== "string") return undefined;
  if (!Array.isArray(fields)) return undefined;
  const pairs: [string, string][] = [];
  for (const field of fields) {
    if (!Array.isArray(field) || field.length !== 2) return undefined;
    const [name, text] = field as unknown[];
    if (typeof name !== "string" || typeof text !== "string") return undefined;
    pairs.push([name, text]);
  }
  const answer: Answer = { kind: kind as AnswerKind, fields: pairs };
  if (title !== undefined) answer.title = title;
  if (ref !== undefined) {
    if (typeof ref !== "object" || ref === null) return undefined;
    const { doc, block } = ref as Record<string, unknown>;
    if (!Number.isInteger(block) || (doc !== undefined && typeof doc !== "string")) return undefined;
    answer.ref = doc === undefined ? { block: block as number } : { doc, block: block as number };
  }
  return answer;
}
