import { afterEach, describe, expect, test } from "bun:test";
import { configure, resetConfiguration } from "../../src/elements/index.ts";
import { diagramMap, diagramQuote } from "../../src/extension/client/diagram-map.ts";
import { mermaidSvg } from "../../src/server/index.ts";
import { cleanup, click, key, mount, root } from "../elements/helpers.ts";

const STATE =
  "stateDiagram-v2\n  [*] --> Open\n  Open --> Paid : pay\n  Paid --> Refunded : money back\n  Refunded --> [*]";
const FLOW =
  "flowchart TD\n  A[Start] -->|yes| B(Check)\n  B --> C{Ok?}\n  subgraph S[Group]\n    C -->|no| D[Fix]\n  end";

const rendered = (source: string): Element =>
  new DOMParser().parseFromString(mermaidSvg(source, { scheme: "light" }), "image/svg+xml").documentElement;
const texts = (source: string): string[] =>
  diagramMap(rendered(source))?.targets.map((t) => `${t.kind}: ${t.text}`) ?? [];

afterEach(() => {
  cleanup();
  resetConfiguration();
});

describe("diagramMap: what a click on the rendered SVG means, in the diagram's own words", () => {
  test("state diagram: states, start and end, and each transition as from → to with its label", () => {
    const targets = texts(STATE);
    expect(targets).toContain("node: Paid");
    expect(targets).toContain("node: start");
    expect(targets).toContain("node: end");
    expect(targets).toContain('edge: Paid → Refunded "money back"');
    expect(targets).toContain('edge: Open → Paid "pay"');
    expect(targets).toContain("edge: start → Open");
    expect(targets).toContain("edge: Refunded → end");
  });

  test("flowchart: node labels (not ids), a labelled edge, and a subgraph", () => {
    const targets = texts(FLOW);
    expect(targets).toContain("node: Ok?");
    expect(targets).toContain('edge: Start → Check "yes"');
    expect(targets).toContain("edge: Check → Ok?");
    expect(targets).toContain('edge: Ok? → Fix "no"');
    expect(targets).toContain("group: Group");
  });

  test("an edge's hit area is its line and, when it has one, its label box", () => {
    const map = diagramMap(rendered(STATE));
    const edge = map?.targets.find((t) => t.text.startsWith("Paid → Refunded"));
    expect(edge?.shapes.map((s) => s.tag)).toEqual(["polyline", "rect"]);
    expect(edge?.shapes[0]?.attrs.points).toBeTruthy();
    expect(map?.viewBox).toMatch(/^0 0 [\d.]+ [\d.]+$/);
  });

  test("only geometry is carried over", () => {
    const map = diagramMap(rendered(FLOW));
    for (const shape of map?.targets.flatMap((t) => t.shapes) ?? []) {
      for (const name of Object.keys(shape.attrs)) expect(name).not.toMatch(/^(fill|stroke|style|class|on)/);
    }
  });
});

describe("pbs-diagram with diagramMap: clicking an element reports its words", () => {
  const mountDiagram = async (source: string, targetEvents: unknown[]) => {
    configure({
      diagramUrl: () => "/d.svg",
      diagramMap: async () => diagramMap(rendered(source)),
    });
    document.addEventListener("pbs-diagram-target", (event) => targetEvents.push((event as CustomEvent).detail));
    const el = mount("pbs-diagram", { source });
    await Bun.sleep(5);
    return el;
  };
  const hit = (el: Element, label: string): Element => {
    const found = [...root(el).querySelectorAll('[role="button"]')].find((hit) =>
      hit.getAttribute("aria-label")?.endsWith(label),
    );
    if (!found) throw new Error(`no hit area for ${label}`);
    return found;
  };

  test("a node, an edge, and an edge's label box each report the element", async () => {
    const seen: unknown[] = [];
    const el = await mountDiagram(STATE, seen);
    click(hit(el, "Paid"));
    click(hit(el, 'Paid → Refunded "money back"'));
    expect(seen).toEqual([
      { kind: "node", text: "Paid" },
      { kind: "edge", text: 'Paid → Refunded "money back"' },
    ]);
  });

  test("every hit area is focusable and answers Enter and Space", async () => {
    const seen: unknown[] = [];
    const el = await mountDiagram(FLOW, seen);
    const node = hit(el, "Check");
    expect(node.getAttribute("tabindex")).toBe("0");
    key(node, "Enter");
    key(node, " ");
    key(node, "a");
    expect(seen).toEqual([
      { kind: "node", text: "Check" },
      { kind: "node", text: "Check" },
    ]);
  });

  test("the overlay shares the image's coordinates, adds no style attribute, and leaves the image in place", async () => {
    const el = await mountDiagram(STATE, []);
    const overlay = root(el).querySelector("svg");
    expect(overlay?.getAttribute("viewBox")).toBe(diagramMap(rendered(STATE))?.viewBox ?? "");
    expect(root(el).querySelector("img")?.getAttribute("src")).toBe("/d.svg");
    expect(root(el).querySelectorAll("[style], style").length).toBe(0);
  });

  test("without the hook the diagram is only an image", () => {
    configure({ diagramUrl: () => "/d.svg" });
    const el = mount("pbs-diagram", { source: STATE });
    expect(root(el).querySelector("svg")).toBeNull();
  });
});

describe("diagramQuote: which diagram on the page", () => {
  test("names the diagram by its position and type, then the element", () => {
    const first = mount("pbs-diagram", { source: "flowchart TD\n A-->B" });
    const second = mount("pbs-diagram", { source: "---\ntitle: T\n---\n%% note\nstateDiagram-v2\n A --> B" });
    expect(diagramQuote(first, { kind: "node", text: "Check" })).toBe("[Diagram 1, flowchart] node: Check");
    expect(diagramQuote(second, { kind: "edge", text: 'Paid → Refunded "money back"' })).toBe(
      '[Diagram 2, stateDiagram-v2] edge: Paid → Refunded "money back"',
    );
  });
});
