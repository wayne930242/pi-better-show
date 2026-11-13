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

/** A state diagram's `[*]`: the renderer draws it unlabelled, as a `state-start` or `state-end` shape. */
function markOf(node: Element): "start" | "end" | undefined {
  const shape = node.getAttribute("data-shape");
  return shape === "state-start" ? "start" : shape === "state-end" ? "end" : undefined;
}

/** The label a node or group is known by: its own, `start` or `end` for a `[*]`, or else its id. */
const labelOf = (node: Element): string =>
  words(node.getAttribute("data-label")) || markOf(node) || words(node.getAttribute("data-id"));

const idOf = (element: Element): string => element.getAttribute("data-id") ?? "";

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
 * The innermost group that draws around `node`, if any. The drawing is flat (a state diagram's inner `[*]` is not
 * nested in its composite state), so containment is read from the geometry.
 */
function enclosing(groups: Element[], node: Element): Element | undefined {
  const at = centreOf(node);
  if (!at) return undefined;
  let best: { group: Element; area: number } | undefined;
  for (const group of groups) {
    const box = boxOf(group);
    if (!box || at.x < box.x || at.x > box.x + box.width || at.y < box.y || at.y > box.y + box.height) continue;
    const area = box.width * box.height;
    if (!best || area < best.area) best = { group, area };
  }
  return best?.group;
}

/**
 * A target before it is told apart: `tag` is what it adds when another target reads alike (`Check (B)`), `id` the
 * drawing's id of the node or group it is.
 */
type Draft = DiagramTarget & { tag: string; id?: string };

/**
 * Makes every target's text unique among `targets` (one kind), so one quote names one element. Only a text that more
 * than one target has changes: each adds its tag where the tags differ (`Check (B)`), and what is still alike is
 * numbered in drawing order (`#1`, `#2`), skipping a number whose text another target already has (a label written as
 * `B #1`).
 */
function disambiguated(targets: Draft[]): DiagramTarget[] {
  const count = (list: DiagramTarget[]): Map<string, number> => {
    const seen = new Map<string, number>();
    for (const target of list) seen.set(target.text, (seen.get(target.text) ?? 0) + 1);
    return seen;
  };
  const first = count(targets);
  // A tag only helps where it differs between the targets that share a text.
  const tags = new Map<string, Set<string>>();
  for (const target of targets) tags.set(target.text, (tags.get(target.text) ?? new Set()).add(target.tag));
  const named = targets.map(({ tag, id: _id, ...target }) =>
    tag && (first.get(target.text) ?? 0) > 1 && (tags.get(target.text)?.size ?? 0) > 1
      ? { ...target, text: `${target.text} (${tag})` }
      : target,
  );
  const second = count(named);
  const taken = new Set(named.filter((target) => (second.get(target.text) ?? 0) < 2).map((target) => target.text));
  const next = new Map<string, number>();
  return named.map((target) => {
    if ((second.get(target.text) ?? 0) < 2) return target;
    let ordinal = next.get(target.text) ?? 0;
    do ordinal += 1;
    while (taken.has(`${target.text} #${ordinal}`));
    next.set(target.text, ordinal);
    taken.add(`${target.text} #${ordinal}`);
    return { ...target, text: `${target.text} #${ordinal}` };
  });
}

/**
 * Tells apart the nodes or the groups, and records each one's final name and tag by id: later targets (a `[*]`'s
 * composite state, an edge's ends) are named by them. A target with no text or shape is left out.
 */
function settle(drafts: Draft[], names: Map<string, string>, tags: Map<string, string>): DiagramTarget[] {
  for (const draft of drafts) {
    names.set(draft.id ?? "", draft.text);
    tags.set(draft.id ?? "", draft.tag);
  }
  const kept = drafts.filter((draft) => draft.text && draft.shapes.length > 0);
  const targets = disambiguated(kept);
  for (const [index, draft] of kept.entries()) names.set(draft.id ?? "", targets[index]?.text ?? draft.text);
  return targets;
}

/**
 * What a reader can point at in the drawing, each named in the diagram's own words and unique within its kind. Groups
 * are named first, then nodes (a `[*]` among several is scoped by the composite state around it: `start (in Active)`),
 * then edges by the names of their ends, so an edge says which `Check` it starts from. Renderer ids never show: a `[*]`
 * that reads like another node adds `([*])`.
 */
export function diagramMap(svg: Element): DiagramMap | undefined {
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return undefined;
  /** Each node's and group's name, and the tag that tells it apart, by id: what an edge is named by. */
  const names = new Map<string, string>();
  const tags = new Map<string, string>();

  const groupElements = [...svg.querySelectorAll("g.subgraph")];
  const groups = settle(
    groupElements.map((group) => {
      const [box, header] = shapesIn(group);
      // The header strip only: the whole box would cover the nodes inside it.
      const shapes = [header ?? box].filter((shape) => shape !== undefined);
      return { kind: "group", text: labelOf(group), tag: idOf(group), id: idOf(group), shapes };
    }),
    names,
    tags,
  );

  const nodeElements = [...svg.querySelectorAll("g.node")];
  const several = (mark: string): boolean => nodeElements.filter((node) => markOf(node) === mark).length > 1;
  const scoped = nodeElements.map((node) => {
    const mark = markOf(node);
    if (!mark) return labelOf(node);
    const around = several(mark) ? enclosing(groupElements, node) : undefined;
    return around ? `${mark} (in ${names.get(idOf(around))})` : mark;
  });
  const labels = new Set(nodeElements.filter((node) => !markOf(node)).map(labelOf));
  const nodes = settle(
    nodeElements.map((node, index) => {
      const text = scoped[index] ?? "";
      const mark = markOf(node) !== undefined;
      return {
        kind: "node",
        text: mark && labels.has(text) ? `${text} ([*])` : text,
        tag: mark ? "[*]" : idOf(node),
        id: idOf(node),
        shapes: shapesIn(node),
      };
    }),
    names,
    tags,
  );

  const name = (id: string | null): string => names.get(id ?? "") || words(id);
  const tag = (id: string | null): string => tags.get(id ?? "") || words(id);
  const boxes = [...svg.querySelectorAll("g.edge-label")];
  const edges: Draft[] = [];
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
      tag: `${tag(from)} → ${tag(to)}`,
      shapes,
    });
  }

  // Later targets sit above earlier ones: groups below edges below nodes.
  const targets = [...groups, ...disambiguated(edges), ...nodes];
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
  return `[Diagram ${position}, ${diagramType(sourceOf(diagram))}] ${target.kind}: ${target.text}`;
}

const sourceOf = (diagram: Element): string => (diagram as Element & { data?: { source?: string } }).data?.source ?? "";

/**
 * What finds a diagram again when the page reloads after an agent's edit, which may add or remove diagrams before it:
 * its source, and which of the page's diagrams drawn from that source it is.
 */
export function diagramRef(diagram: Element): string {
  const source = sourceOf(diagram);
  const alike = [...document.querySelectorAll("pbs-diagram")].filter((other) => sourceOf(other) === source);
  return JSON.stringify([source, alike.indexOf(diagram)]);
}

/**
 * A `diagramQuote` made on an earlier load, with the position its diagram (found by `diagramRef`) has on the page now.
 * A diagram whose source changed is not found, and the quote keeps the position it has.
 */
export function requoteDiagram(quote: string, ref: string): string {
  let found: Element | undefined;
  try {
    const [source, nth] = JSON.parse(ref) as [unknown, unknown];
    const alike = [...document.querySelectorAll("pbs-diagram")].filter((other) => sourceOf(other) === source);
    found = typeof nth === "number" ? alike[nth] : undefined;
  } catch {
    // A ref that cannot be read leaves the quote as it is.
  }
  if (!found) return quote;
  const position = [...document.querySelectorAll("pbs-diagram")].indexOf(found) + 1;
  return quote.replace(/^\[Diagram \d+,/, `[Diagram ${position},`);
}
