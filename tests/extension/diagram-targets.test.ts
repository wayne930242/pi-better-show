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

describe("diagramMap: every quote is unique within its diagram", () => {
  const unique = (list: string[]) => expect(new Set(list).size).toBe(list.length);

  test("unique elements keep the plain format", () => {
    expect(texts(STATE).some((t) => /[(#]/.test(t.replace(/"[^"]*"/g, "")))).toBe(false);
  });

  test("two nodes with the same label are told apart by their ids, and their edges name them so", () => {
    const targets = texts("flowchart TD\n A[Check] --> B[Check]\n B --> C[Done]\n A --> C");
    unique(targets);
    expect(targets).toContain("node: Check (A)");
    expect(targets).toContain("node: Check (B)");
    expect(targets).toContain("node: Done");
    expect(targets).toContain("edge: Check (B) → Done");
    expect(targets).toContain("edge: Check (A) → Done");
    expect(targets).toContain("edge: Check (A) → Check (B)");
  });

  test("an edge whose ends read alike only across kinds adds their ids", () => {
    const targets = texts("flowchart TD\n subgraph S[One]\n  X\n end\n A[One] --> B\n S --> B");
    unique(targets);
    expect(targets).toContain("group: One");
    expect(targets).toContain("node: One");
    expect(targets).toContain("edge: One → B (A → B)");
    expect(targets).toContain("edge: One → B (S → B)");
  });

  test("the same edge drawn twice is numbered in drawing order", () => {
    const targets = texts("flowchart TD\n A -->|retry| B\n A -->|retry| B");
    unique(targets);
    expect(targets).toContain('edge: A → B "retry" #1');
    expect(targets).toContain('edge: A → B "retry" #2');
    expect(targets).toContain("node: A");
  });

  test("two subgraphs with the same title", () => {
    const targets = texts(
      "flowchart TD\n subgraph S1[One]\n  A\n end\n subgraph S2[One]\n  B\n end\n S1 --> S2\n A --> B",
    );
    unique(targets);
    expect(targets).toContain("group: One (S1)");
    expect(targets).toContain("group: One (S2)");
    expect(targets).toContain("edge: One (S1) → One (S2)");
    expect(targets).toContain("edge: A → B");
  });

  test("a number never repeats a label that already ends in one", () => {
    unique(texts('flowchart TD\n A --> B\n A --> B\n A --> C["B #1"]'));
    unique(texts('flowchart TD\n A --> B\n A --> B\n A --> C["B #2"]'));
  });

  test("an id suffix and a number never repeat a label that already reads that way", () => {
    unique(texts('flowchart TD\n A[Check] --> B[Check]\n C["Check (A)"]\n D["Check (A) #1"]'));
  });

  test("a number never reads as part of a label: with a # in a label, it takes a run of # no label has", () => {
    const targets = texts('flowchart TD\n A --> B\n A --> B\n A --> C["B #1"]');
    unique(targets);
    expect(targets).toContain("edge: A → B #1");
    expect(targets).toContain("edge: A → B ##1");
    expect(targets).toContain("edge: A → B ##2");
    expect(texts('flowchart TD\n A --> B\n A --> B\n C["x ## y"]')).toContain("edge: A → B ###2");
  });
});

describe("diagramMap: a state diagram's [*] is start or end, scoped when there are several", () => {
  const COMPOSITE =
    "stateDiagram-v2\n [*] --> Active\n state Active {\n  [*] --> Idle\n  Idle --> Busy\n  Busy --> [*]\n }\n Active --> [*]";

  test("inside a composite state: no renderer ids, scoped by the enclosing state", () => {
    const targets = texts(COMPOSITE);
    expect(targets.join("\n")).not.toMatch(/_start|_end/);
    expect(targets).toContain("node: start");
    expect(targets).toContain("node: end");
    expect(targets).toContain("node: start (in Active)");
    expect(targets).toContain("node: end (in Active)");
    expect(targets).toContain("edge: start → Active");
    expect(targets).toContain("edge: Active → end");
    expect(targets).toContain("edge: start (in Active) → Idle");
    expect(targets).toContain("edge: Busy → end (in Active)");
    expect(new Set(targets).size).toBe(targets.length);
  });

  test("two composite states with the same title: each inner [*] names its state as the state's own quote does", () => {
    const targets = texts(
      'stateDiagram-v2\n [*] --> W1\n state "Work" as W1 {\n  [*] --> A\n  A --> [*]\n }\n state "Work" as W2 {\n  [*] --> B\n }\n W1 --> W2',
    );
    expect(targets.join("\n")).not.toMatch(/_start|_end/);
    expect(targets).toContain("group: Work (W1)");
    expect(targets).toContain("group: Work (W2)");
    expect(targets).toContain("node: start");
    expect(targets).toContain("node: start (in Work (W1))");
    expect(targets).toContain("node: start (in Work (W2))");
    expect(new Set(targets).size).toBe(targets.length);
  });

  test("a state named start or end beside [*]: the state keeps its name, the mark adds ([*])", () => {
    const targets = texts("stateDiagram-v2\n [*] --> start\n start --> end\n end --> [*]");
    expect(targets.join("\n")).not.toMatch(/_start|_end|\((start|end)\)/);
    expect(targets).toContain("node: start");
    expect(targets).toContain("node: end");
    expect(targets).toContain("node: start ([*])");
    expect(targets).toContain("node: end ([*])");
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("diagramMap: targets come in reading order", () => {
  test("top to bottom, an edge between the elements it joins, and left to right across a row", () => {
    expect(texts(FLOW)).toEqual([
      "node: Start",
      'edge: Start → Check "yes"',
      "node: Check",
      "edge: Check → Ok?",
      "node: Ok?",
      'edge: Ok? → Fix "no"',
      "group: Group",
      "node: Fix",
    ]);
    expect(texts("flowchart TD\n A --> B\n A --> C\n B --> D\n C --> D")).toEqual([
      "node: A",
      "edge: A → B",
      "edge: A → C",
      "node: B",
      "node: C",
      "edge: B → D",
      "edge: C → D",
      "node: D",
    ]);
  });

  test("a chart that flows across reads left to right", () => {
    expect(texts("flowchart LR\n A --> B --> C")).toEqual([
      "node: A",
      "edge: A → B",
      "node: B",
      "edge: B → C",
      "node: C",
    ]);
  });
});

describe("diagramMap: labels are read as people wrote them", () => {
  test("Mermaid entity codes are decoded", () => {
    const targets = texts('flowchart TD\n A["say #quot;hi#quot; #35;1"] -->|"a #amp; b"| B');
    expect(targets).toContain('node: say "hi" #1');
    expect(targets).toContain('edge: say "hi" #1 → B "a & b"');
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

  test("every hit area answers Enter and Space", async () => {
    const seen: unknown[] = [];
    const el = await mountDiagram(FLOW, seen);
    const node = hit(el, "Check");
    key(node, "Enter");
    key(node, " ");
    key(node, "a");
    expect(seen).toEqual([
      { kind: "node", text: "Check" },
      { kind: "node", text: "Check" },
    ]);
  });

  test("the diagram is one tab stop, its first element in reading order", async () => {
    const el = await mountDiagram(FLOW, []);
    const stops = [...root(el).querySelectorAll('[tabindex="0"]')];
    expect(stops.map((stop) => stop.getAttribute("aria-label"))).toEqual(["Comment on node: Start"]);
    expect(root(el).querySelectorAll('[role="button"][tabindex="-1"]')).toHaveLength(7);
  });

  test("arrow keys move through the elements in reading order; Home and End jump; the tab stop follows", async () => {
    const el = await mountDiagram(FLOW, []);
    const focused = () => root(el).activeElement?.getAttribute("aria-label")?.replace("Comment on ", "");
    (hit(el, "Start") as SVGElement).focus();
    const visited = [focused()];
    for (const name of ["ArrowDown", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]) {
      const at = root(el).activeElement;
      if (at) key(at, name);
      visited.push(focused());
    }
    expect(visited).toEqual(texts(FLOW));
    const at = () => root(el).activeElement as Element;
    key(at(), "ArrowDown");
    expect(focused()).toBe("node: Fix");
    key(at(), "ArrowUp");
    key(at(), "ArrowLeft");
    expect(focused()).toBe('edge: Ok? → Fix "no"');
    key(at(), "Home");
    expect(focused()).toBe("node: Start");
    key(at(), "End");
    expect(focused()).toBe("node: Fix");
    expect([...root(el).querySelectorAll('[tabindex="0"]')]).toEqual([at()]);
    // A click moves the tab stop too.
    (hit(el, "Check") as SVGElement).focus();
    expect([...root(el).querySelectorAll('[tabindex="0"]')]).toEqual([hit(el, "Check")]);
  });

  test("screen readers are told how to move: the diagram's group describes the arrow keys", async () => {
    const el = await mountDiagram(FLOW, []);
    const group = root(el).querySelector('svg[role="group"]');
    const id = group?.getAttribute("aria-describedby") ?? "";
    expect(id).not.toBe("");
    expect(root(el).querySelector(`[id="${id}"]`)?.textContent).toBe(
      "Arrow keys move between its elements; Enter or Space comments on one.",
    );
  });

  test("the overlay draws groups below edges below nodes, whatever the reading order", async () => {
    const el = await mountDiagram(FLOW, []);
    const kinds = [...root(el).querySelectorAll('[role="button"]')].map((hit) => hit.getAttribute("data-kind"));
    expect(kinds).toEqual(["group", "edge", "edge", "edge", "node", "node", "node", "node"]);
  });

  test("the overlay shares the image's coordinates, adds no style attribute, and leaves the image in place", async () => {
    const el = await mountDiagram(STATE, []);
    const overlay = root(el).querySelector("svg");
    expect(overlay?.getAttribute("viewBox")).toBe(diagramMap(rendered(STATE))?.viewBox ?? "");
    expect(root(el).querySelector("img")?.getAttribute("src")).toBe("/d.svg");
    expect(root(el).querySelectorAll("[style], style").length).toBe(0);
  });

  test("a hook that throws or returns a non-promise leaves the image drawn", async () => {
    for (const diagramMapHook of [
      () => {
        throw new Error("boom");
      },
      () => undefined,
    ]) {
      configure({ diagramUrl: () => "/d.svg", diagramMap: diagramMapHook as never });
      const el = mount("pbs-diagram", { source: STATE });
      await Bun.sleep(5);
      expect(root(el).querySelector("img")?.getAttribute("src")).toBe("/d.svg");
      expect(root(el).querySelector("svg")).toBeNull();
      cleanup();
    }
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
