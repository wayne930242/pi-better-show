import { entryOf, flag, itemsOf, mappingOf, oneOf, record, requiredText, text } from "./normalize.ts";
import type {
  Cell,
  ChecklistData,
  ColumnType,
  MindmapData,
  MindmapNode,
  StatsData,
  StepsData,
  SuggestData,
  TableColumn,
  TableData,
} from "./types.ts";

/** The blocks pi-better-show adds to the show-doc vocabulary. */

const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/;

/** An indented Markdown list; the first item is the root and every other item hangs below it. */
export function mindmap(source: string): MindmapData {
  const lines = source.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("a mindmap needs an indented list");
  const stack: { indent: number; node: MindmapNode }[] = [];
  let root: MindmapNode | undefined;
  for (const line of lines) {
    const item = LIST_ITEM.exec(line);
    if (!item) throw new Error(`not a list item: ${line.trim()}`);
    const label = (item[2] as string).trim();
    if (label === "") throw new Error("a list item has no text");
    const indent = (item[1] as string).replace(/\t/g, "    ").length;
    const node: MindmapNode = { text: label, children: [] };
    while (stack.length > 0 && (stack[stack.length - 1] as { indent: number }).indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.node.children.push(node);
    else if (root) throw new Error("a mindmap has one root: indent the other top-level items under it");
    else root = node;
    stack.push({ indent, node });
  }
  return { root: root as MindmapNode };
}

export function suggest(data: unknown): SuggestData {
  return {
    items: itemsOf(data, "items").map((entry) => {
      const raw = entryOf(entry, "label", "suggestion");
      const label = text(raw.label ?? raw.text, "label");
      if (label === undefined) throw new Error("each suggestion needs a label or a text");
      return { label, text: text(raw.text, "text") ?? label };
    }),
  };
}

export function checklist(data: unknown): ChecklistData {
  const raw = mappingOf(data);
  return {
    title: text(raw.title, "title"),
    submit: text(raw.submit, "submit"),
    items: itemsOf(data, "items").map((entry) => {
      const item = entryOf(entry, "label", "item");
      const label = text(item.label ?? item.name, "label");
      if (label === undefined) throw new Error("each checklist item needs a label or a name");
      return {
        name: text(item.name, "name") ?? label,
        label,
        checked: flag(item.checked, "checked") ?? false,
        note: text(item.note, "note"),
      };
    }),
  };
}

const COLUMN_TYPES = ["text", "number", "date"] as const;
const ALIGNS = ["left", "center", "right"] as const;

function column(entry: unknown): TableColumn {
  const raw = entryOf(entry, "name", "column");
  const name = text(raw.name ?? raw.label, "name");
  if (name === undefined) throw new Error("each column needs a name or a label");
  const type: ColumnType = oneOf(raw.type, COLUMN_TYPES, "type") ?? "text";
  return {
    name,
    label: text(raw.label, "label") ?? name,
    align: oneOf(raw.align, ALIGNS, "align") ?? (type === "number" ? "right" : "left"),
    type,
  };
}

function cell(value: unknown): Cell {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") throw new Error("a table cell must be text, a number, or a boolean");
  return value as Cell;
}

function sortOf(value: unknown, columns: TableColumn[]): TableData["sort"] {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === "object" ? record(value, "sort") : { column: value };
  let reference = text(raw.column ?? raw.by, "sort column") ?? "";
  let direction = oneOf(raw.direction ?? raw.dir, ["asc", "desc"] as const, "sort direction");
  if (typeof value !== "object" && reference.startsWith("-")) {
    reference = reference.slice(1);
    direction = "desc";
  }
  const index = columns.findIndex((entry) => entry.name === reference || entry.label === reference);
  if (index < 0) throw new Error(`sort names no column: ${reference}`);
  return { column: index, direction: direction ?? "asc" };
}

export function table(data: unknown): TableData {
  const raw = record(data, "table");
  const rawRows = itemsOf(raw, "rows");
  const given = raw.columns === undefined ? undefined : itemsOf(raw, "columns");
  const objects = rawRows.filter((row) => row !== null && typeof row === "object" && !Array.isArray(row)) as Record<
    string,
    unknown
  >[];
  // Without `columns`, the keys of the mapping rows name them, in the order they first appear.
  const columns = (given ?? [...new Set(objects.flatMap((row) => Object.keys(row)))]).map(column);
  if (columns.length === 0) throw new Error("a table needs `columns`, or rows written as mappings");
  const rows = rawRows.map((row) => {
    if (Array.isArray(row)) {
      if (row.length > columns.length) throw new Error(`a row has ${row.length} cells for ${columns.length} columns`);
      return columns.map((_, index) => cell(row[index]));
    }
    const mapping = record(row, "row");
    return columns.map((entry) => cell(mapping[entry.name] ?? mapping[entry.label]));
  });
  return { columns, rows, sort: sortOf(raw.sort, columns), filter: flag(raw.filter, "filter") ?? false };
}

const STEP_STATUSES = ["done", "doing", "todo", "blocked"] as const;

export function steps(data: unknown): StepsData {
  return {
    items: itemsOf(data, "items").map((entry) => {
      const item = entryOf(entry, "title", "step");
      return {
        title: requiredText(item.title, "a step's title"),
        status: oneOf(item.status, STEP_STATUSES, "status") ?? "todo",
        when: text(item.when, "when"),
        body: text(item.body, "body"),
      };
    }),
  };
}

export function stats(data: unknown): StatsData {
  return {
    items: itemsOf(data, "items").map((entry) => {
      const item = record(entry, "stat");
      return {
        label: requiredText(item.label, "a stat's label"),
        value: requiredText(item.value, "a stat's value"),
        delta: text(item.delta, "delta"),
        tone: text(item.tone, "tone"),
        note: text(item.note, "note"),
      };
    }),
  };
}
