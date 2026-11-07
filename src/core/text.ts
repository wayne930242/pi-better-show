import { reviewItemName } from "./blocks.ts";
import { inlinePlain } from "./inline.ts";
import type {
  AlertData,
  BlockSegment,
  CardsData,
  Cell,
  ChecklistData,
  FormData,
  InvalidSegment,
  MindmapData,
  MindmapNode,
  OptionsData,
  Recommended,
  ReviewData,
  Segment,
  StatsData,
  StepStatus,
  StepsData,
  SuggestData,
  TableData,
  TextProfile,
} from "./types.ts";
import { displayWidth } from "./width.ts";

const DEFAULT_WIDTH = 60;
const TABLE_ROWS = 20;
const STEP_MARKS: Record<StepStatus, string> = { done: "✓", doing: "▶", todo: "○", blocked: "✕" };

/** How one surface writes: Discord keeps its Markdown, LINE and plain text drop the markers. */
interface Dialect {
  markdown: boolean;
  width: number;
  mermaid: TextProfile["mermaid"];
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const letter = (index: number): string => (index < 26 ? String.fromCharCode(97 + index) : String(index + 1));
const star = (recommended: Recommended | undefined): string =>
  recommended === undefined ? "" : recommended === true ? " ★" : ` ★ ${recommended}`;
const indent = (text: string, by: string): string =>
  text
    .split("\n")
    .map((line) => by + line)
    .join("\n");

/** A text field as the surface reads it. */
const field = (dialect: Dialect, text: string): string => (dialect.markdown ? text : inlinePlain(text));
const bold = (dialect: Dialect, text: string): string => (dialect.markdown ? `**${text}**` : text);
const joined = (dialect: Dialect, ...parts: (string | undefined)[]): string =>
  parts.filter((part) => part !== undefined && part !== "").join(dialect.markdown ? " — " : " - ");

/** Code that keeps its layout: a fence on Discord (longer than any backtick run inside), indented lines elsewhere. */
function code(dialect: Dialect, text: string, language = ""): string {
  if (!dialect.markdown) return indent(text, "  ");
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

function alert(dialect: Dialect, data: AlertData): string {
  const quote = data.body === "" ? [] : data.body.split("\n").map((line) => `> ${field(dialect, line)}`.trimEnd());
  return [bold(dialect, field(dialect, data.title)), ...quote].join("\n");
}

function cards(dialect: Dialect, data: CardsData): string {
  return data.cards
    .map((card) => {
      const title = card.title ? bold(dialect, field(dialect, card.title)) : undefined;
      const body = card.body ? oneLine(field(dialect, card.body)) : undefined;
      return `• ${[title, body].filter(Boolean).join(": ")}`;
    })
    .join("\n");
}

function options(dialect: Dialect, data: OptionsData): string {
  const lines = data.options.flatMap((option, index) => {
    const title = bold(dialect, field(dialect, option.title ?? `Option ${index + 1}`));
    const head = joined(
      dialect,
      `${title}${star(option.recommended)}`,
      option.body && oneLine(field(dialect, option.body)),
    );
    return [
      `${index + 1}. ${head}`,
      ...option.pros.map((pro) => `   + ${oneLine(field(dialect, pro))}`),
      ...option.cons.map((con) => `   − ${oneLine(field(dialect, con))}`),
    ];
  });
  return [...lines, "", "Reply with a number."].join("\n");
}

function form(dialect: Dialect, data: FormData): string {
  const lines = data.questions.flatMap((question, index) => {
    const marks = [question.required ? " (required)" : "", question.type === "multi" ? " (pick any)" : ""].join("");
    const label = bold(dialect, field(dialect, question.label ?? question.name));
    return [
      `${index + 1}. ${label}${marks}`,
      ...(question.hint ? [`   ${oneLine(field(dialect, question.hint))}`] : []),
      ...question.choices.map(
        (choice, at) =>
          `   ${letter(at)}) ${joined(dialect, `${field(dialect, choice.label)}${star(choice.recommended)}`, choice.note && oneLine(field(dialect, choice.note)))}`,
      ),
      ...(question.choices.length > 0 && question.other !== false ? ["   or write your own answer"] : []),
    ];
  });
  const title = data.title ? [bold(dialect, field(dialect, data.title))] : [];
  const example = dialect.markdown ? "`1: b`" : "1: b";
  return [...title, ...lines, "", `Reply in text, one line per question, like ${example}.`].join("\n");
}

function review(dialect: Dialect, data: ReviewData): string {
  const lines = data.items.flatMap((item, index) => [
    `${index + 1}. ${joined(dialect, bold(dialect, field(dialect, reviewItemName(item))), item.body && oneLine(field(dialect, item.body)))}`,
    ...(item.image ? [`   image: ${item.image}`] : []),
    ...(item.page ? [`   page: ${item.page}`] : []),
  ]);
  const pick = data.pick === undefined ? "" : ` Say which one you pick${data.pick === true ? "" : ` (${data.pick})`}.`;
  const title = data.title ? [bold(dialect, field(dialect, data.title))] : [];
  return [...title, ...lines, "", `Reply with a comment for each item, naming the item.${pick}`].join("\n");
}

function mindmap(dialect: Dialect, data: MindmapData): string {
  const walk = (node: MindmapNode, depth: number): string[] => [
    `${"  ".repeat(depth)}- ${field(dialect, node.text)}`,
    ...node.children.flatMap((child) => walk(child, depth + 1)),
  ];
  return [bold(dialect, field(dialect, data.root.text)), ...data.root.children.flatMap((child) => walk(child, 0))].join(
    "\n",
  );
}

function suggest(dialect: Dialect, data: SuggestData): string {
  if (data.items.length === 0) return "";
  return `You can reply: ${data.items.map((item) => field(dialect, item.label)).join(" | ")}`;
}

function checklist(dialect: Dialect, data: ChecklistData): string {
  const title = data.title ? [bold(dialect, field(dialect, data.title))] : [];
  return [
    ...title,
    ...data.items.map(
      (item) =>
        `${item.checked ? "☑" : "☐"} ${joined(dialect, field(dialect, item.label), item.note && oneLine(field(dialect, item.note)))}`,
    ),
  ].join("\n");
}

/** The rows as the table opens: in the author's order, or sorted by `sort` (empty cells last, ties keep their order). */
function sortedRows(data: TableData): TableData["rows"] {
  const { sort } = data;
  if (!sort) return data.rows;
  const type = data.columns[sort.column]?.type ?? "text";
  const key = (cell: Cell | undefined): number | string =>
    type === "number" ? Number(cell) : type === "date" ? Date.parse(String(cell)) : String(cell);
  const sign = sort.direction === "asc" ? 1 : -1;
  const empty = (cell: Cell | undefined): boolean => cell === null || cell === undefined || Number.isNaN(key(cell));
  return [...data.rows].sort((a, b) => {
    const [left, right] = [a[sort.column], b[sort.column]];
    if (empty(left) || empty(right)) return Number(empty(left)) - Number(empty(right));
    const [x, y] = [key(left), key(right)];
    return sign * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
  });
}

function table(data: TableData): string {
  const shown = sortedRows(data)
    .slice(0, TABLE_ROWS)
    .map((row) => {
      const pairs = data.columns.flatMap((column, index) => {
        const cell = row[index];
        return cell === null || cell === undefined ? [] : [`${column.label}: ${cell}`];
      });
      return `• ${pairs.join(" · ")}`;
    });
  const more = data.rows.length - shown.length;
  return [...shown, ...(more > 0 ? [`… ${more} more row${more === 1 ? "" : "s"}`] : [])].join("\n");
}

function steps(dialect: Dialect, data: StepsData): string {
  return data.items
    .flatMap((item, index) => [
      `${index + 1}. ${STEP_MARKS[item.status]} ${bold(dialect, field(dialect, item.title))}${item.when ? ` (${field(dialect, item.when)})` : ""}`,
      ...(item.body ? [`   ${oneLine(field(dialect, item.body))}`] : []),
    ])
    .join("\n");
}

function stats(dialect: Dialect, data: StatsData): string {
  return data.items
    .map((item) => {
      const head = `${bold(dialect, field(dialect, item.label))}: ${item.value}${item.delta ? ` (${item.delta})` : ""}`;
      return joined(dialect, head, item.note && oneLine(field(dialect, item.note)));
    })
    .join("\n");
}

const widest = (text: string): number => Math.max(0, ...text.split("\n").map(displayWidth));

/** A diagram as a text drawing when the hook can and it fits; else its source and a pointer to the web view. */
function mermaid(dialect: Dialect, source: string): string {
  let drawn = dialect.mermaid?.(source, dialect.width);
  // The hook is told the width, but a drawing that does not fit is never shown, whatever the hook did.
  if (drawn !== undefined && widest(drawn) > dialect.width) drawn = undefined;
  if (drawn !== undefined) return code(dialect, drawn);
  // No `mermaid` fence language: a Discord reply must carry no block-kind fence.
  return [code(dialect, source), "(The web view shows this diagram drawn.)"].join("\n");
}

const diff = (dialect: Dialect, source: string): string => (dialect.markdown ? code(dialect, source, "diff") : source);

function block(dialect: Dialect, segment: BlockSegment): string {
  switch (segment.kind) {
    case "alert":
      return alert(dialect, segment.data);
    case "mermaid":
      return mermaid(dialect, segment.data.source);
    case "diff":
      return diff(dialect, segment.data.source);
    case "cards":
      return cards(dialect, segment.data);
    case "options":
      return options(dialect, segment.data);
    case "form":
      return form(dialect, segment.data);
    case "review":
      return review(dialect, segment.data);
    case "mindmap":
      return mindmap(dialect, segment.data);
    case "suggest":
      return suggest(dialect, segment.data);
    case "checklist":
      return checklist(dialect, segment.data);
    case "table":
      return table(segment.data);
    case "steps":
      return steps(dialect, segment.data);
    case "stats":
      return stats(dialect, segment.data);
  }
}

/** Prose for a surface without Markdown: markers dropped, code kept as it is. */
function plainProse(text: string): string {
  let fence: string | undefined;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const edge = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === undefined && edge) {
      fence = edge;
    } else if (fence !== undefined) {
      if (edge && edge[0] === fence[0] && edge.length >= fence.length && line.trim() === edge) fence = undefined;
      else out.push(`  ${line}`);
    } else {
      out.push(inlinePlain(line.replace(/^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/, "$1")));
    }
  }
  return out.join("\n");
}

function invalid(dialect: Dialect, segment: InvalidSegment): string {
  return code(dialect, segment.source);
}

/**
 * A document for a surface that cannot draw blocks: prose as it is (Discord) or without Markdown markers
 * (LINE, plain), and each block as the text its kind reads best as. Blocks that failed to parse keep their source in a code block.
 */
export function toText(segments: Segment[], profile: TextProfile): string {
  const dialect: Dialect = {
    markdown: profile.flavor === "discord",
    width: profile.width ?? DEFAULT_WIDTH,
    mermaid: profile.mermaid,
  };
  const keep = new Set<string>(profile.keep ?? []);
  return segments
    .map((segment) => {
      if (segment.type !== "markdown" && keep.has(segment.kind)) return segment.raw;
      if (segment.type === "markdown") return dialect.markdown ? segment.text : plainProse(segment.text);
      if (segment.type === "invalid") return invalid(dialect, segment);
      return block(dialect, segment);
    })
    .filter((part) => part !== "")
    .join("\n\n");
}
