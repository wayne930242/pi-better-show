/**
 * Framework-free custom elements for pi-better-show blocks. Importing this module defines every `pbs-*` tag
 * (once; it is safe to import twice, and safe to import where there is no DOM: nothing is defined then).
 *
 * A host sets `data` (the block's parsed data, a property) or `data-json` (an attribute), listens for `pbs-answer`,
 * and sets `answered` once the answer is delivered. Elements never read or write HTML.
 */
import { defineChoice } from "./choice.ts";
import { defineDisplay } from "./display.ts";
import { defineForm } from "./form.ts";
import { defineMindmap } from "./mindmap.ts";
import { defineReview } from "./review.ts";
import { defineTable } from "./table.ts";
import { defineTree } from "./tree.ts";

export type { AnsweredFields, BlockRef, Density } from "./base.ts";
export { PbsElement } from "./base.ts";
export { PbsChecklist, PbsOptions, PbsSuggest } from "./choice.ts";
export type { Configuration, Scheme } from "./config.ts";
export { configure, resetConfiguration } from "./config.ts";
export { PbsCallout, PbsCards, PbsDiagram, PbsDiff, PbsStats, PbsSteps } from "./display.ts";
export { PbsForm } from "./form.ts";
export { PbsMindmap } from "./mindmap.ts";
export { PbsReview } from "./review.ts";
export type { Locale, Strings } from "./strings.ts";
export { PbsTable } from "./table.ts";
export { PbsTree } from "./tree.ts";

/** The tag of every element, by the block kind it draws. `alert` is drawn by `pbs-callout`, `mermaid` by `pbs-diagram`. */
export const TAGS = {
  alert: "pbs-callout",
  cards: "pbs-cards",
  options: "pbs-options",
  form: "pbs-form",
  review: "pbs-review",
  mindmap: "pbs-mindmap",
  suggest: "pbs-suggest",
  checklist: "pbs-checklist",
  table: "pbs-table",
  steps: "pbs-steps",
  stats: "pbs-stats",
  diff: "pbs-diff",
  mermaid: "pbs-diagram",
  tree: "pbs-tree",
} as const;

/** Defines every element that is not defined yet. Importing the module already calls it. */
export function defineAll(): void {
  defineDisplay();
  defineChoice();
  defineForm();
  defineReview();
  defineMindmap();
  defineTable();
  defineTree();
}

defineAll();
