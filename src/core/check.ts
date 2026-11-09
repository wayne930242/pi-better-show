import { isMap, isScalar, isSeq, LineCounter, type Node, parseDocument, type Scalar } from "yaml";
import { locate } from "./parse.ts";
import type { BlockKind } from "./types.ts";

/**
 * Finds what is wrong with the blocks of a Markdown file, so the agent that wrote it can fix them: a block that does
 * not parse (the page shows its source), and the slips that parse without an error and lose data (a value cut at a
 * ` #`, a key no block reads). Each problem carries the line of the Markdown file.
 */

export interface BlockProblem {
  kind: BlockKind;
  /** 1-based line of the Markdown file. */
  line: number;
  /** Where in the block, as the author reads it: `form question "o5" choice 1 label`. */
  path: string;
  message: string;
  /** `error`: the block cannot be drawn. `warning`: it is drawn, but part of what was written is lost. */
  severity: "error" | "warning";
}

export interface CheckOptions {
  /** Checks a Mermaid source and returns what is wrong with it; core carries no Mermaid parser, a host passes one. */
  mermaid?: (source: string) => string | undefined;
}

interface Shape {
  /** The keys the block reads at this level. */
  keys?: readonly string[];
  /** Keys that hold a list of items, with the shape of an item. */
  lists?: Record<string, ListShape>;
  /** Keys that hold a mapping. */
  maps?: Record<string, Shape>;
  /** The list a document that is a bare YAML list stands for. */
  bare?: string;
}
interface ListShape {
  noun: string;
  item?: Shape;
  /** Item keys that name an item, first found wins. */
  names?: readonly string[];
}

const items = (noun: string, keys: readonly string[], names?: readonly string[]): ListShape => ({
  noun,
  item: { keys },
  ...(names ? { names } : {}),
});

/** What each YAML kind reads, level by level; it mirrors the converters in blocks.ts and blocks-new.ts. */
const SHAPES: Record<string, Shape> = {
  cards: { keys: ["cards"], bare: "cards", lists: { cards: items("card", ["title", "tone", "body"]) } },
  options: {
    keys: ["options"],
    bare: "options",
    lists: { options: items("option", ["title", "recommended", "body", "pros", "cons"]) },
  },
  form: {
    keys: ["title", "submit", "questions"],
    bare: "questions",
    lists: {
      questions: {
        noun: "question",
        names: ["name", "label"],
        item: {
          keys: ["name", "label", "type", "hint", "required", "other", "choices"],
          lists: { choices: items("choice", ["value", "label", "note", "recommended"]) },
        },
      },
    },
  },
  review: {
    keys: ["title", "submit", "pick", "columns", "items"],
    bare: "items",
    lists: { items: items("item", ["name", "label", "image", "page", "height", "body"], ["name", "label"]) },
  },
  suggest: { keys: ["items"], bare: "items", lists: { items: items("suggestion", ["label", "text"]) } },
  checklist: {
    keys: ["title", "submit", "items"],
    bare: "items",
    lists: { items: items("item", ["name", "label", "checked", "note"], ["name", "label"]) },
  },
  table: {
    keys: ["columns", "rows", "sort", "filter"],
    lists: { columns: items("column", ["name", "label", "type", "align"], ["name", "label"]), rows: { noun: "row" } },
    maps: { sort: { keys: ["column", "by", "direction", "dir"] } },
  },
  steps: { keys: ["items"], bare: "items", lists: { items: items("step", ["title", "status", "when", "body"]) } },
  stats: {
    keys: ["items"],
    bare: "items",
    lists: { items: items("stat", ["label", "value", "delta", "tone", "note"]) },
  },
};

/** Keys whose value is an enum, flag or number: a ` #` after one is a plain comment, not lost text. */
const NON_TEXT_KEYS = new Set([
  "status",
  "type",
  "align",
  "direction",
  "dir",
  "checked",
  "required",
  "filter",
  "height",
  "columns",
  "tone",
]);

const QUOTE_HINT = 'quote any value that holds " #" or ": " (and commas inside {…})';

const short = (text: string, max = 40): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Edit distance, to offer the known key a misspelling was probably meant for. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        (next[j - 1] as number) + 1,
        (row[j] as number) + 1,
        (row[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    row = next;
  }
  return row[b.length] as number;
}

const nearest = (key: string, known: readonly string[]): string | undefined => {
  const lower = key.toLowerCase();
  return known.find((name) => name.toLowerCase() === lower || distance(lower, name.toLowerCase()) <= 2);
};

const quoteYaml = (text: string): string => `'${text.replace(/'/g, "''")}'`;

interface Context {
  kind: BlockKind;
  /** The file line of the block's opening fence: a source line n is file line `fence + n`. */
  fence: number;
  source: string;
  lines: LineCounter;
  out: BlockProblem[];
}

const lineOf = (context: Context, offset: number): number => context.fence + context.lines.linePos(offset).line;

function report(context: Context, offset: number, path: string, message: string): void {
  context.out.push({ kind: context.kind, line: lineOf(context, offset), path, message, severity: "warning" });
}

/** A plain value that a ` #` on its line cut short: YAML reads the rest as a comment, so that text is lost. */
function checkComment(context: Context, node: Scalar, path: string): void {
  if (node.type !== "PLAIN" || node.comment === undefined || node.comment === null || !node.range) return;
  const [start, end] = node.range;
  const rest = context.source.slice(
    end,
    context.source.indexOf("\n", end) < 0 ? undefined : context.source.indexOf("\n", end),
  );
  if (!/^[ \t]*#/.test(rest)) return;
  const kept = context.source.slice(start, end);
  const whole = `${kept}${rest}`.trimEnd();
  const read = kept === "" ? "no value" : `the value ${JSON.stringify(kept)}`;
  report(
    context,
    end,
    path,
    `a plain value ends at " #": ${JSON.stringify(rest.trim())} is read as a YAML comment and dropped, leaving ${read}; if it is text, quote the whole value: ${quoteYaml(whole)}`,
  );
}

function checkKeys(context: Context, node: Node, shape: Shape | undefined, owner: string): void {
  if (!isMap(node)) return;
  for (const pair of node.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : undefined;
    const keyAt = isScalar(pair.key) && pair.key.range ? pair.key.range[0] : (node.range?.[0] ?? 0);
    if (key !== undefined && shape?.keys && !shape.keys.includes(key)) {
      const near = nearest(key, shape.keys);
      report(
        context,
        keyAt,
        owner,
        `unknown key ${JSON.stringify(key)} is ignored${near ? ` (did you mean ${JSON.stringify(near)}?)` : ""}; this level reads: ${shape.keys.join(", ")}`,
      );
    }
    walk(context, pair.value as Node | null, key === undefined ? undefined : shape, owner, key);
  }
}

function itemName(item: Node | unknown, names: readonly string[] | undefined): string | undefined {
  if (!isMap(item) || !names) return undefined;
  for (const name of names) {
    const found = item.items.find((pair) => isScalar(pair.key) && pair.key.value === name);
    if (found && isScalar(found.value) && found.value.value !== null && found.value.value !== "")
      return short(String(found.value.value), 30);
  }
  return undefined;
}

/** Walks a value, checking keys against `shape` (the owner's) and plain values for a cut-off comment. */
function walk(context: Context, node: Node | null, shape: Shape | undefined, owner: string, key: string | undefined) {
  const path = key === undefined ? owner : `${owner} ${key}`;
  const list = key === undefined ? undefined : shape?.lists?.[key];
  if (isSeq(node)) {
    for (const [index, item] of node.items.entries()) {
      const name = itemName(item, list?.names);
      const here = list
        ? `${owner} ${list.noun} ${name === undefined ? index + 1 : JSON.stringify(name)}`
        : `${path} ${index + 1}`;
      walk(context, item as Node | null, list?.item, here, undefined);
    }
  } else if (isMap(node)) {
    checkKeys(context, node, key === undefined ? shape : shape?.maps?.[key], path);
  } else if (isScalar(node)) {
    if (key !== undefined && NON_TEXT_KEYS.has(key)) return;
    checkComment(context, node, path);
  }
}

/** The YAML kinds, whose body is parsed as a document. */
const isYamlKind = (kind: BlockKind): boolean => kind in SHAPES;

function checkBody(context: Context): void {
  const doc = parseDocument(context.source, { lineCounter: context.lines });
  if (doc.errors.length > 0) return;
  const shape = SHAPES[context.kind] as Shape;
  const root = doc.contents;
  const name = context.kind;
  if (isSeq(root)) {
    if (shape.bare === undefined) return;
    const list = shape.lists?.[shape.bare];
    for (const [index, item] of root.items.entries()) {
      const label = itemName(item, list?.names);
      const here = `${name} ${list?.noun ?? "item"} ${label === undefined ? index + 1 : JSON.stringify(label)}`;
      walk(context, item as Node | null, list?.item, here, undefined);
    }
  } else if (isMap(root)) {
    checkKeys(context, root, shape, name);
  }
}

/** An invalid YAML block: YAML's own error points past a broken flow collection, so look back for the line that opened it. */
function yamlError(context: Context, error: string): { line: number; message: string; hint: string } | undefined {
  const doc = parseDocument(context.source, { lineCounter: new LineCounter() });
  const first = doc.errors[0];
  if (!first) return undefined;
  const lines = context.source.split("\n");
  let at = first.linePos?.[0].line ?? 1;
  const message = first.message
    .split("\n")[0]
    ?.replace(/ at line \d+, column \d+:?$/, "")
    .replace(/:$/, "");
  if (first.message.startsWith("Flow ")) {
    const hit = (text: string): boolean => /[{[][^}\]]*\s#/.test(text);
    for (let n = at; n >= Math.max(1, at - 50); n--) {
      if (hit(lines[n - 1] ?? "")) {
        at = n;
        return { line: at, message: message ?? error, hint: QUOTE_HINT };
      }
    }
    at = Math.max(1, at - 1);
    return { line: at, message: message ?? error, hint: QUOTE_HINT };
  }
  const hint =
    first.code === "MISSING_CHAR" ? "close the quote" : 'check the indentation, and quote text holding ": " or " #"';
  return { line: at, message: message ?? error, hint };
}

/** A tree or mindmap error that names its source line. */
function sourceLine(context: Context, error: string): number | undefined {
  const numbered = /^line (\d+): /.exec(error);
  if (numbered) return Number(numbered[1]);
  const listed = /^not a list item: (.*)$/.exec(error);
  if (listed) {
    const at = context.source.split("\n").findIndex((line) => line.trim() === (listed[1] as string));
    return at < 0 ? undefined : at + 1;
  }
  return undefined;
}

/**
 * The problems of every block in `markdown`, in document order. `error` problems are blocks that cannot be drawn
 * (the page shows their source); `warning` problems are blocks that draw but lose part of what was written: a plain
 * value cut at ` #`, a key the block does not read, a fence that never closes, a diagram `options.mermaid` refuses.
 */
export function checkBlocks(markdown: string, options: CheckOptions = {}): BlockProblem[] {
  const out: BlockProblem[] = [];
  for (const { segment, line, closed, source } of locate(markdown)) {
    if (segment.type === "markdown") continue;
    const kind = segment.kind;
    const context: Context = { kind, fence: line, source, lines: new LineCounter(), out };
    if (segment.type === "invalid") {
      let at = line;
      let message = segment.error;
      let hint = "";
      if (isYamlKind(kind)) {
        const found = yamlError(context, segment.error);
        if (found) {
          at = line + found.line;
          message = found.message;
          hint = found.hint;
        }
      } else {
        const inner = sourceLine(context, segment.error);
        if (inner !== undefined) {
          at = line + inner;
          message = segment.error.replace(/^line \d+: /, "");
        }
      }
      out.push({
        kind,
        line: at,
        path: kind,
        message: `the ${kind} block is invalid and is shown as source: ${message}${hint ? `; ${hint}` : ""}`,
        severity: "error",
      });
    } else if (isYamlKind(kind)) {
      checkBody(context);
    } else if (kind === "mermaid" && options.mermaid) {
      const problem = options.mermaid(source);
      if (problem !== undefined) {
        out.push({
          kind,
          line: line + 1,
          path: kind,
          message: `the diagram will not draw: ${problem}`,
          severity: "error",
        });
      }
    }
    if (!closed) {
      out.push({
        kind,
        line,
        path: kind,
        message: `the ${kind} fence is never closed, so the block runs to the end of the file; add a closing fence`,
        severity: "warning",
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** The problems as the lines an agent reads: `Block problems in notes.md:` then one `- line N path: message` each. */
export function formatProblems(name: string, problems: readonly BlockProblem[]): string {
  const lines = problems.map(
    (problem) =>
      `- line ${problem.line} ${problem.path}${problem.severity === "warning" ? " (warning)" : ""}: ${problem.message}`,
  );
  return [`Block problems in ${name}:`, ...lines].join("\n");
}
