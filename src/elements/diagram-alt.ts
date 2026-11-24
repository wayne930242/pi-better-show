import { format, type Strings } from "./strings.ts";

/** What a Mermaid diagram is and shows, in words: the image's alt text and the SVG's title and description. */

export interface DiagramDescription {
  /** The type, with the diagram's own title when it has one: `Flowchart “Cache path”`. */
  title: string;
  /** The node count and the first edges, or empty when the type has no such reading. */
  desc: string;
  /** `title` and `desc` as one sentence. */
  alt: string;
}

const KINDS: [RegExp, keyof Strings][] = [
  [/^(?:graph|flowchart)\b/i, "diagramKindFlow"],
  [/^stateDiagram/i, "diagramKindState"],
  [/^sequenceDiagram\b/i, "diagramKindSequence"],
  [/^classDiagram\b/i, "diagramKindClass"],
  [/^erDiagram\b/i, "diagramKindEr"],
  [/^xychart/i, "diagramKindChart"],
];

const MAX_PATH = 4;
const ARROW = /\s*(?:<?-{2,}>|<?={2,}>|-\.+->|-{3,})\s*(?:\|[^|]*\|\s*)?/;
const NODE = /^([^\s[\](){}"<>|:;&]+)(?::::\w+)?\s*(?:[[({]+\s*"?([^"\]})]*?)"?\s*[\])}]+)?/;

const unquote = (value: string): string => value.trim().replace(/^["']|["']$/g, "");

function titleOf(lines: string[]): string | undefined {
  const front = /^title:\s*(.+)$/.exec(lines.find((line) => /^title:/i.test(line)) ?? "");
  if (front) return unquote(front[1] as string);
  const chart = /^title\s+(.+)$/i.exec(lines.find((line) => /^title\s/i.test(line)) ?? "");
  return chart ? unquote(chart[1] as string) : undefined;
}

/** The nodes and edges a flowchart or state diagram names, in source order; the first label seen for an id wins. */
function readEdges(lines: string[]): { count: number; path: string[]; more: boolean } {
  const labels = new Map<string, string>();
  const edges: [string, string][] = [];
  for (const line of lines) {
    if (!ARROW.test(line)) continue;
    const ids: string[] = [];
    for (const part of line.replace(/:[^>]*$/, "").split(ARROW)) {
      const node = NODE.exec(part.trim());
      if (!node || node[1] === "[*]") continue;
      const id = node[1] as string;
      const label = node[2]?.trim();
      if (!labels.has(id) || (label && labels.get(id) === id)) labels.set(id, label || id);
      ids.push(id);
    }
    for (let i = 1; i < ids.length; i++) edges.push([ids[i - 1] as string, ids[i] as string]);
  }
  const path: string[] = [];
  let used = 0;
  for (const [from, to] of edges) {
    if (path.length >= MAX_PATH) break;
    if (path.at(-1) !== from) path.push(from);
    path.push(to);
    used++;
  }
  const named = path.slice(0, MAX_PATH).map((id) => labels.get(id) ?? id);
  return { count: labels.size, path: named, more: used < edges.length || path.length > MAX_PATH };
}

export function describeDiagram(source: string, strings: Strings): DiagramDescription {
  const lines = source
    .replace(/^\s*---\n([\s\S]*?)\n---\s*\n/, (_, front: string) => `${front}\n`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("%%"));
  const first = lines.find((line) => !/^\w+:/.test(line) || /^(?:graph|flowchart|stateDiagram)/i.test(line)) ?? "";
  const kind = KINDS.find(([pattern]) => pattern.test(first))?.[1];
  const base = kind ? strings[kind] : strings.diagram;
  const name = titleOf(lines);
  const title = name ? `${base} “${name}”` : base;
  let desc = "";
  if (kind === "diagramKindFlow" || kind === "diagramKindState") {
    const { count, path, more } = readEdges(lines);
    if (count > 0) {
      const nodes = format(strings.diagramNodes, { n: count });
      desc =
        path.length > 0 ? format(strings.diagramDesc, { nodes, path: path.join(" → ") + (more ? " …" : "") }) : nodes;
    }
  }
  return { title, desc, alt: desc ? format(strings.diagramAlt, { title, desc }) : title };
}
