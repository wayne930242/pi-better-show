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

const words = (value: string | null): string => (value ?? "").replace(/\s+/g, " ").trim();

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

/** The label a node is known by; a state diagram's `[*]` has none, and is `start` or `end`. */
function labelOf(node: Element): string {
  const label = words(node.getAttribute("data-label"));
  if (label) return label;
  const id = node.getAttribute("data-id") ?? "";
  if (id.endsWith("_start")) return "start";
  if (id.endsWith("_end")) return "end";
  return id;
}

export function diagramMap(svg: Element): DiagramMap | undefined {
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return undefined;
  const labels = new Map<string, string>();
  for (const node of svg.querySelectorAll("g.node, g.subgraph"))
    labels.set(node.getAttribute("data-id") ?? "", labelOf(node));
  const name = (id: string | null): string => labels.get(id ?? "") ?? words(id);

  const groups: DiagramTarget[] = [...svg.querySelectorAll("g.subgraph")].map((group) => {
    const [box, header] = shapesIn(group);
    // The header strip only: the whole box would cover the nodes inside it.
    return { kind: "group", text: labelOf(group), shapes: [header ?? box].filter((shape) => shape !== undefined) };
  });

  const boxes = [...svg.querySelectorAll("g.edge-label")];
  const edges: DiagramTarget[] = [];
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
    edges.push({ kind: "edge", text: `${name(from)} → ${name(to)}${label ? ` "${label}"` : ""}`, shapes });
  }

  const nodes: DiagramTarget[] = [...svg.querySelectorAll("g.node")].map((node) => ({
    kind: "node",
    text: labelOf(node),
    shapes: shapesIn(node),
  }));

  // Later targets sit above earlier ones: groups below edges below nodes.
  const targets = [...groups, ...edges, ...nodes].filter((target) => target.text && target.shapes.length > 0);
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
