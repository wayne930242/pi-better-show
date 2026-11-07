import { parse as parseYaml } from "yaml";
import * as legacy from "./blocks.ts";
import * as added from "./blocks-new.ts";
import {
  type AlertData,
  type AlertTone,
  BLOCK_KINDS,
  type BlockDataMap,
  type BlockKind,
  type BlockSegment,
  type InvalidSegment,
  type Segment,
} from "./types.ts";

const ALERTS: Record<string, { tone: AlertTone; label: string }> = {
  NOTE: { tone: "note", label: "Note" },
  TIP: { tone: "ok", label: "Tip" },
  IMPORTANT: { tone: "note", label: "Important" },
  WARNING: { tone: "warn", label: "Warning" },
  CAUTION: { tone: "risk", label: "Caution" },
};
const ALERT_LINE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.*)$/i;
const QUOTE = /^ {0,3}> ?/;
const BACKTICK_FENCE = /^( {0,3})(`{3,})[ \t]*([^`]*)$/;
const TILDE_FENCE = /^( {0,3})(~{3,})[ \t]*(.*)$/;

const fenceKinds = new Set<string>(BLOCK_KINDS.filter((kind) => kind !== "alert"));

/** One block's text between its fences, or the YAML it holds. */
type Convert<K extends BlockKind> = (source: string) => BlockDataMap[K];
const yaml =
  <K extends BlockKind>(convert: (data: unknown) => BlockDataMap[K]): Convert<K> =>
  (source) =>
    convert(parseYaml(source));

const CONVERTERS: { [K in Exclude<BlockKind, "alert">]: Convert<K> } = {
  mermaid: (source) => {
    if (source.trim() === "") throw new Error("the diagram is empty");
    return { source };
  },
  diff: (source) => ({ source }),
  cards: yaml(legacy.cards),
  options: yaml(legacy.options),
  form: yaml(legacy.form),
  review: yaml(legacy.review),
  mindmap: added.mindmap,
  suggest: yaml(added.suggest),
  checklist: yaml(added.checklist),
  table: yaml(added.table),
  steps: yaml(added.steps),
  stats: yaml(added.stats),
};

/** The first line of the error: YAML's own messages end it with a colon and append a source excerpt. */
const messageOf = (error: unknown): string =>
  ((error instanceof Error ? error.message : String(error)).split("\n")[0] as string).replace(/:$/, "");

function convert(
  kind: Exclude<BlockKind, "alert">,
  source: string,
  index: number,
  raw: string,
): BlockSegment | InvalidSegment {
  try {
    const data = (CONVERTERS[kind] as Convert<BlockKind>)(source);
    return { type: "block", kind, data, raw, index } as BlockSegment;
  } catch (error) {
    return { type: "invalid", kind, source, raw, error: messageOf(error) };
  }
}

function alertOf(run: string[]): AlertData | undefined {
  const marker = ALERT_LINE.exec((run[0] as string).replace(QUOTE, ""));
  if (!marker) return undefined;
  const alert = ALERTS[(marker[1] as string).toUpperCase()] as { tone: AlertTone; label: string };
  const body = run
    .slice(1)
    .map((line) => line.replace(QUOTE, ""))
    .join("\n")
    .trim();
  return { tone: alert.tone, title: (marker[2] as string).trim() || alert.label, body };
}

const closes = (line: string, marker: string): boolean => {
  const fence = marker[0] === "`" ? /^ {0,3}(`{3,})[ \t]*$/.exec(line) : /^ {0,3}(~{3,})[ \t]*$/.exec(line);
  return fence !== null && marker[0] === (fence[1] as string)[0] && (fence[1] as string).length >= marker.length;
};

function trimBlankEdges(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] as string).trim() === "") start++;
  while (end > start && (lines[end - 1] as string).trim() === "") end--;
  return lines.slice(start, end).join("\n");
}

/**
 * Splits a document into its prose and its blocks, in order. A block is a fenced code block whose first
 * word names a block kind (`form`, `table`, ...), or a GitHub alert; other code, and prose, stay Markdown.
 * A block whose body does not fit its schema becomes an `invalid` segment that keeps its source and the reason.
 */
export function parse(markdown: string): Segment[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const segments: Segment[] = [];
  let prose: string[] = [];
  let index = 0;
  const flush = () => {
    const text = trimBlankEdges(prose);
    if (text !== "") segments.push({ type: "markdown", text });
    prose = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const fence = BACKTICK_FENCE.exec(line) ?? TILDE_FENCE.exec(line);
    if (fence) {
      const [, indent, marker, info] = fence as unknown as [string, string, string, string];
      const body: string[] = [];
      let end = i + 1;
      while (end < lines.length && !closes(lines[end] as string, marker)) {
        body.push((lines[end] as string).replace(new RegExp(`^ {0,${indent.length}}`), ""));
        end++;
      }
      const stop = Math.min(end + 1, lines.length);
      const kind = (info.trim().split(/\s+/)[0] as string).toLowerCase();
      if (fenceKinds.has(kind)) {
        flush();
        const segment = convert(
          kind as Exclude<BlockKind, "alert">,
          body.join("\n"),
          index,
          lines.slice(i, stop).join("\n"),
        );
        if (segment.type === "block") index++;
        segments.push(segment);
      } else {
        prose.push(...lines.slice(i, stop));
      }
      i = stop;
      continue;
    }

    if (QUOTE.test(line)) {
      let end = i;
      while (end < lines.length && QUOTE.test(lines[end] as string)) end++;
      const run = lines.slice(i, end);
      const data = alertOf(run);
      if (data) {
        flush();
        segments.push({ type: "block", kind: "alert", data, raw: run.join("\n"), index: index++ });
      } else {
        prose.push(...run);
      }
      i = end;
      continue;
    }

    prose.push(line);
    i++;
  }
  flush();
  return segments;
}
