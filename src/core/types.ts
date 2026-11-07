/** Typed data of every block kind, as `parse` hands it to hosts and elements. Text fields hold restricted inline Markdown. */

export const BLOCK_KINDS = [
  "alert",
  "mermaid",
  "diff",
  "cards",
  "options",
  "form",
  "review",
  "mindmap",
  "suggest",
  "checklist",
  "table",
  "steps",
  "stats",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Present when something is recommended: `true`, or the label the author gave it. */
export type Recommended = true | string;

export type AlertTone = "note" | "ok" | "warn" | "risk";
export interface AlertData {
  tone: AlertTone;
  title: string;
  /** Markdown, the quote's text after the marker line. */
  body: string;
}

export interface MermaidData {
  source: string;
}
export interface DiffData {
  source: string;
}

export interface CardData {
  title?: string;
  /** Free-form; hosts know `note`, `ok`, `warn`, `risk`. */
  tone?: string;
  body?: string;
}
export interface CardsData {
  cards: CardData[];
}

export interface OptionData {
  title?: string;
  recommended?: Recommended;
  body?: string;
  pros: string[];
  cons: string[];
}
export interface OptionsData {
  options: OptionData[];
}

export interface ChoiceData {
  value: string;
  label: string;
  note?: string;
  recommended?: Recommended;
}
export type QuestionType = "single" | "multi" | "text";
export interface QuestionData {
  /** The answer's key: the author's `name`, else the label. */
  name: string;
  label?: string;
  type: QuestionType;
  hint?: string;
  required: boolean;
  /** A choice question's box for the user's own answer: `true` the default label, `false` none, a string its label. */
  other: boolean | string;
  choices: ChoiceData[];
}
export interface FormData {
  title?: string;
  submit?: string;
  questions: QuestionData[];
}

export interface ReviewItemData {
  /** The author's name, else the first letter no item claims (A, B, C, ...); repeated names get a number. */
  name: string;
  label?: string;
  image?: string;
  page?: string;
  height?: number;
  body?: string;
}
export interface ReviewData {
  title?: string;
  submit?: string;
  /** `true` or the pick's label; absent when the user does not pick a favourite. */
  pick?: Recommended;
  columns?: number;
  items: ReviewItemData[];
}

export interface MindmapNode {
  text: string;
  children: MindmapNode[];
}
export interface MindmapData {
  root: MindmapNode;
}

export interface SuggestItem {
  label: string;
  /** What a click sends as the user's message. */
  text: string;
}
export interface SuggestData {
  items: SuggestItem[];
}

export interface ChecklistItem {
  name: string;
  label: string;
  checked: boolean;
  note?: string;
}
export interface ChecklistData {
  title?: string;
  submit?: string;
  items: ChecklistItem[];
}

export type Cell = string | number | boolean | null;
export type ColumnType = "text" | "number" | "date";
export interface TableColumn {
  name: string;
  label: string;
  align: "left" | "center" | "right";
  type: ColumnType;
}
export interface TableData {
  columns: TableColumn[];
  /** Each row has one cell per column. */
  rows: Cell[][];
  /** The column the table starts sorted by (an index into `columns`). */
  sort?: { column: number; direction: "asc" | "desc" };
  filter: boolean;
}

export type StepStatus = "done" | "doing" | "todo" | "blocked";
export interface StepItem {
  title: string;
  status: StepStatus;
  when?: string;
  body?: string;
}
export interface StepsData {
  items: StepItem[];
}

export interface StatItem {
  label: string;
  value: string;
  delta?: string;
  tone?: string;
  note?: string;
}
export interface StatsData {
  items: StatItem[];
}

export interface BlockDataMap {
  alert: AlertData;
  mermaid: MermaidData;
  diff: DiffData;
  cards: CardsData;
  options: OptionsData;
  form: FormData;
  review: ReviewData;
  mindmap: MindmapData;
  suggest: SuggestData;
  checklist: ChecklistData;
  table: TableData;
  steps: StepsData;
  stats: StatsData;
}

export interface MarkdownSegment {
  type: "markdown";
  text: string;
}
export type BlockSegment = {
  [K in BlockKind]: {
    type: "block";
    kind: K;
    data: BlockDataMap[K];
    /** The block's exact original text, fences (or an alert's whole `>` quote) included. */
    raw: string;
    /** Counts the document's blocks of every kind from 0, in order; invalid blocks take no number. */
    index: number;
  };
}[BlockKind];
export interface InvalidSegment {
  type: "invalid";
  kind: BlockKind;
  /** The block's text between its fences (an alert's whole quote). */
  source: string;
  /** The block's exact original text, fences (or an alert's whole `>` quote) included. */
  raw: string;
  error: string;
}
export type Segment = MarkdownSegment | BlockSegment | InvalidSegment;

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: InlineToken[] }
  | { type: "em"; children: InlineToken[] }
  | { type: "link"; href: string; children: InlineToken[] }
  | { type: "br" };

export type AnswerKind = "form" | "review" | "feedback" | "pick" | "suggest" | "checklist";
export interface Answer {
  kind: AnswerKind;
  title?: string;
  fields: [string, string][];
  ref?: { doc?: string; block: number };
}

export type Flavor = "discord" | "line" | "plain";
export interface TextProfile {
  flavor: Flavor;
  /** Columns a diagram may take; default 60. */
  width?: number;
  /** Draws a diagram as text, or returns undefined when it cannot (invalid, or wider than `width`). */
  mermaid?: (source: string, width: number) => string | undefined;
  /** Kinds whose blocks (valid or invalid) are emitted as their `raw` text, for a surface that draws them itself. */
  keep?: readonly BlockKind[];
}

/** The kinds a display surface (a chat UI that draws blocks itself) typically keeps through `toText`. */
export const DISPLAY_KINDS = ["alert", "cards", "mermaid", "mindmap", "diff", "table", "steps", "stats"] as const;
