import type { DiagramMap, DiagramShape, DiagramTarget } from "../../elements/index.ts";

/**
 * Reads what a reader can point at in a diagram drawn by `mermaidSvg` (beautiful-mermaid): flowchart and state
 * diagram nodes, edges, and subgraphs, each named in the diagram's own words. The drawing carries them as
 * `data-id`, `data-label`, `data-from`, and `data-to` on `g.node`, `.edge`, `g.edge-label`, and `g.subgraph`; a diagram
 * type without them yields no targets and stays a plain image.
 */

const SHAPES = new Set<DiagramShape["tag"]>(["rect", "circle", "ellipse", "polygon", "polyline", "path"]);
/** Only geometry is carried over; paint, classes, and anything else from the drawing stay behind. */
const GEOMETRY = new Set(["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "points", "d"]);

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " " };

/** Mermaid writes a character as `#quot;` or `#35;` in a label; the drawing keeps the code, a reader means the character. */
function decoded(text: string): string {
  return text.replace(/#(\w+);/g, (code, name: string) => {
    const point = /^\d+$/.test(name) ? Number(name) : undefined;
    if (point === undefined) return ENTITIES[name] ?? code;
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : code;
  });
}

const words = (value: string | null): string => decoded((value ?? "").replace(/\s+/g, " ").trim());

function shapeOf(element: Element): DiagramShape | undefined {
  const tag = element.localName as DiagramShape["tag"];
  if (!SHAPES.has(tag)) return undefined;
  const attrs: Record<string, string> = {};
  for (const name of GEOMETRY) {
    const value = element.getAttribute(name);
    if (value !== null) attrs[name] = value;
  }
  return { tag, attrs };
}

/** The shapes drawn directly inside a `g`. */
const shapesIn = (group: Element): DiagramShape[] =>
  [...group.children].map(shapeOf).filter((shape) => shape !== undefined);

/** The label a node is known by; a state diagram's `[*]` has none, and is `start` or `end` (`_start`, `_end2`, …). */
function labelOf(node: Element): string {
  const label = words(node.getAttribute("data-label"));
  if (label) return label;
  const id = node.getAttribute("data-id") ?? "";
  const mark = /_(start|end)\d*$/.exec(id);
  return mark?.[1] ?? id;
}

/** The box a group draws, in the image's own coordinates. */
function boxOf(group: Element): { x: number; y: number; width: number; height: number } | undefined {
  const box = [...group.children].find((child) => child.localName === "rect");
  if (!box) return undefined;
  const [x, y, width, height] = ["x", "y", "width", "height"].map((name) => Number(box.getAttribute(name)));
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : undefined;
}

/** Where a node is drawn: the centre of its first shape. */
function centreOf(node: Element): { x: number; y: number } | undefined {
  const shape = node.children[0];
  if (!shape) return undefined;
  const at = (name: string): number | undefined => {
    const value = shape.getAttribute(name);
    return value === null || value === "" ? undefined : Number(value);
  };
  const [cx, cy, x, y, width, height] = ["cx", "cy", "x", "y", "width", "height"].map(at);
  if (cx !== undefined && cy !== undefined) return { x: cx, y: cy };
  if (x !== undefined && y !== undefined) return { x: x + (width ?? 0) / 2, y: y + (height ?? 0) / 2 };
  return undefined;
}

/**
 * The title of the innermost group that draws around `node`, if any. The drawing is flat (a state diagram's inner `[*]`
 * is not nested in its composite state), so containment is read from the geometry.
 */
function enclosingTitle(svg: Element, node: Element): string | undefined {
  const at = centreOf(node);
  if (!at) return undefined;
  let best: { title: string; area: number } | undefined;
  for (const group of svg.querySelectorAll("g.subgraph")) {
    const box = boxOf(group);
    if (!box || at.x < box.x || at.x > box.x + box.width || at.y < box.y || at.y > box.y + box.height) continue;
    const area = box.width * box.height;
    if (!best || area < best.area) best = { title: labelOf(group), area };
  }
  return best?.title;
}

/**
 * The name of every node and group by id. Start and end marks are plain `start` and `end`; when a diagram has several of
 * one, each inside a composite state is `start (in Active)`, scoped by the state around it.
 */
function namesOf(svg: Element): Map<string, string> {
  const names = new Map<string, string>();
  const marks = new Map<string, Element[]>();
  for (const node of svg.querySelectorAll("g.node, g.subgraph")) {
    const id = node.getAttribute("data-id") ?? "";
    const label = labelOf(node);
    names.set(id, label);
    if (node.localName === "g" && node.classList.contains("node") && (label === "start" || label === "end"))
      if (!words(node.getAttribute("data-label"))) marks.set(label, [...(marks.get(label) ?? []), node]);
  }
  for (const [label, nodes] of marks) {
    if (nodes.length < 2) continue;
    for (const node of nodes) {
      const title = enclosingTitle(svg, node);
      if (title) names.set(node.getAttribute("data-id") ?? "", `${label} (in ${title})`);
    }
  }
  return names;
}

/**
 * Makes every target's text unique within the diagram, so one quote names one element. Only a text that more than one
 * target has changes: nodes and groups add their id (`Check (B)`), edges their endpoint ids (`Check → Done (A → C)`),
 * and what is still alike is numbered in drawing order (`#1`, `#2`).
 */
function disambiguated(targets: (DiagramTarget & { id?: string })[]): DiagramTarget[] {
  const count = (list: DiagramTarget[]): Map<string, number> => {
    const seen = new Map<string, number>();
    for (const target of list)
      seen.set(`${target.kind}:${target.text}`, (seen.get(`${target.kind}:${target.text}`) ?? 0) + 1);
    return seen;
  };
  const first = count(targets);
  // An id only helps where it differs between the targets that share a text.
  const ids = new Map<string, Set<string | undefined>>();
  for (const target of targets) {
    const key = `${target.kind}:${target.text}`;
    ids.set(key, (ids.get(key) ?? new Set()).add(target.id));
  }
  const named = targets.map(({ id, ...target }) => {
    const key = `${target.kind}:${target.text}`;
    return id && (first.get(key) ?? 0) > 1 && (ids.get(key)?.size ?? 0) > 1
      ? { ...target, text: `${target.text} (${id})` }
      : target;
  });
  const second = count(named);
  const next = new Map<string, number>();
  return named.map((target) => {
    const key = `${target.kind}:${target.text}`;
    if ((second.get(key) ?? 0) < 2) return target;
    const ordinal = (next.get(key) ?? 0) + 1;
    next.set(key, ordinal);
    return { ...target, text: `${target.text} #${ordinal}` };
  });
}

export function diagramMap(svg: Element): DiagramMap | undefined {
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return undefined;
  const labels = namesOf(svg);
  const name = (id: string | null): string => labels.get(id ?? "") ?? words(id);

  const groups: (DiagramTarget & { id?: string })[] = [...svg.querySelectorAll("g.subgraph")].map((group) => {
    const [box, header] = shapesIn(group);
    // The header strip only: the whole box would cover the nodes inside it.
    return {
      kind: "group",
      text: labels.get(group.getAttribute("data-id") ?? "") ?? labelOf(group),
      id: group.getAttribute("data-id") ?? undefined,
      shapes: [header ?? box].filter((shape) => shape !== undefined),
    };
  });

  const boxes = [...svg.querySelectorAll("g.edge-label")];
  const edges: (DiagramTarget & { id?: string })[] = [];
  for (const edge of svg.querySelectorAll(".edge")) {
    const from = edge.getAttribute("data-from");
    const to = edge.getAttribute("data-to");
    const label = words(edge.getAttribute("data-label"));
    const shapes = [shapeOf(edge)].filter((shape) => shape !== undefined);
    if (label) {
      // The box that carries the label belongs to the edge too; parallel edges each take their own.
      const at = boxes.findIndex(
        (box) =>
          box.getAttribute("data-from") === from &&
          box.getAttribute("data-to") === to &&
          words(box.getAttribute("data-label")) === label,
      );
      const [box] = at === -1 ? [] : boxes.splice(at, 1);
      if (box) shapes.push(...shapesIn(box).filter((shape) => shape.tag === "rect"));
    }
    if (shapes.length === 0) continue;
    edges.push({
      kind: "edge",
      text: `${name(from)} → ${name(to)}${label ? ` "${label}"` : ""}`,
      id: `${words(from)} → ${words(to)}`,
      shapes,
    });
  }

  const nodes: (DiagramTarget & { id?: string })[] = [...svg.querySelectorAll("g.node")].map((node) => ({
    kind: "node",
    text: labels.get(node.getAttribute("data-id") ?? "") ?? labelOf(node),
    id: node.getAttribute("data-id") ?? undefined,
    shapes: shapesIn(node),
  }));

  // Later targets sit above earlier ones: groups below edges below nodes.
  const targets = disambiguated(
    [...groups, ...edges, ...nodes].filter((target) => target.text && target.shapes.length > 0),
  );
  return targets.length > 0 ? { viewBox, targets } : undefined;
}

/** The map of the diagram image at `url`: fetched from the page's own server and read as SVG. */
export async function fetchDiagramMap(url: string): Promise<DiagramMap | undefined> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  return doc.querySelector("parsererror") ? undefined : diagramMap(doc.documentElement);
}

/** The first word of a diagram's source after front matter and comments: `flowchart`, `stateDiagram-v2`, … */
function diagramType(source: string): string {
  const body = source.replace(/^\s*---[\s\S]*?\n---\s*\n/, "");
  const line = body.split("\n").find((text) => text.trim() !== "" && !text.trim().startsWith("%%"));
  return line?.trim().split(/\s+/)[0] ?? "diagram";
}

/**
 * The quote a diagram element goes into the feedback panel under: which diagram on the page (its position among the
 * page's diagrams, and its type), then the element: `[Diagram 2, stateDiagram-v2] edge: Paid → Refunded "money back"`.
 * Part of the message the agent reads; keep it stable.
 */
export function diagramQuote(diagram: Element, target: { kind: string; text: string }): string {
  const position = [...document.querySelectorAll("pbs-diagram")].indexOf(diagram) + 1;
  const source = (diagram as Element & { data?: { source?: string } }).data?.source ?? "";
  return `[Diagram ${position}, ${diagramType(source)}] ${target.kind}: ${target.text}`;
}
