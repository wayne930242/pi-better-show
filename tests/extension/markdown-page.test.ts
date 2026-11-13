import { afterEach, describe, expect, test } from "bun:test";
import type { Answer } from "../../src/core/types.ts";
import { configure, resetConfiguration } from "../../src/elements/index.ts";
import { diagramMap } from "../../src/extension/client/diagram-map.ts";
import { wordsFor } from "../../src/extension/client/feedback.ts";
import { mountPage } from "../../src/extension/client/markdown-page.ts";
import { mermaidSvg } from "../../src/server/index.ts";
import { cleanup, key, mount, root } from "../elements/helpers.ts";

const FLOW = "flowchart TD\n A[Check] --> B[Done]";
const STATE = "stateDiagram-v2\n [*] --> Open";

/** The tab's session storage, which outlives the reload an agent's edit causes. */
function session() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

let page: ReturnType<typeof mountPage> | undefined;
afterEach(() => {
  page?.destroy();
  page = undefined;
  cleanup();
  resetConfiguration();
});

/** Loads the page with these diagrams, in order, as the server renders it. */
function load(storage: ReturnType<typeof session>, sources: string[], posted: Answer[] = []): Element[] {
  page?.destroy();
  cleanup();
  const diagrams = sources.map((source) => mount("pbs-diagram", { source }));
  page = mountPage({
    page: "Plan",
    words: wordsFor("en"),
    storage,
    storageKey: "k",
    post: async (answer) => {
      posted.push(answer);
      return { accepted: true };
    },
  });
  return diagrams;
}

const pick = (diagram: Element, kind: string, text: string) =>
  diagram.dispatchEvent(
    new CustomEvent("pbs-diagram-target", { bubbles: true, composed: true, detail: { kind, text } }),
  );
const quotes = () => [...document.querySelectorAll(".pbs-fb-item blockquote")].map((quote) => quote.textContent);

describe("a draft's diagram quote across the reload an agent's edit causes", () => {
  test("follows its diagram when the agent adds or removes one before it", async () => {
    const storage = session();
    const [flow] = load(storage, [FLOW]);
    if (!flow) throw new Error("no diagram");
    pick(flow, "node", "Check");
    expect(quotes()).toEqual(["[Diagram 1, flowchart] node: Check"]);

    load(storage, [STATE, FLOW]);
    expect(quotes()).toEqual(["[Diagram 2, flowchart] node: Check"]);

    const posted: Answer[] = [];
    load(storage, [FLOW], posted);
    expect(quotes()).toEqual(["[Diagram 1, flowchart] node: Check"]);
    document.querySelector<HTMLButtonElement>(".pbs-fb-send")?.click();
    await Bun.sleep(10);
    expect(posted[0]?.fields).toContainEqual(["quote", "[Diagram 1, flowchart] node: Check"]);
  });

  test("of two diagrams drawn from the same source, follows the one it was made on", () => {
    const storage = session();
    const [, second] = load(storage, [FLOW, FLOW]);
    if (!second) throw new Error("no diagram");
    pick(second, "node", "Check");
    load(storage, [STATE, FLOW, FLOW]);
    expect(quotes()).toEqual(["[Diagram 3, flowchart] node: Check"]);
  });

  test("a diagram whose source changed keeps the position the quote has", () => {
    const storage = session();
    const [, flow] = load(storage, [STATE, FLOW]);
    if (!flow) throw new Error("no diagram");
    pick(flow, "node", "Check");
    load(storage, [STATE, `${FLOW}\n B --> C[Ship]`]);
    expect(quotes()).toEqual(["[Diagram 2, flowchart] node: Check"]);
  });
});

describe("a diagram comment from the keyboard", () => {
  test("Enter opens the panel on the element's comment box, and Escape there returns to the element", async () => {
    configure({
      diagramUrl: () => "/d.svg",
      diagramMap: async (url) =>
        url === "/d.svg"
          ? diagramMap(
              new DOMParser().parseFromString(mermaidSvg(FLOW, { scheme: "light" }), "image/svg+xml").documentElement,
            )
          : undefined,
    });
    const [flow] = load(session(), [FLOW]);
    if (!flow) throw new Error("no diagram");
    await Bun.sleep(5);
    const done = [...root(flow).querySelectorAll<SVGElement>('[role="button"]')].find(
      (hit) => hit.getAttribute("aria-label") === "Comment on node: Done",
    );
    if (!done) throw new Error("no hit area for Done");
    done.focus();
    key(done, "Enter");
    const box = document.querySelector<HTMLTextAreaElement>(".pbs-fb-item textarea");
    expect(quotes()).toEqual(["[Diagram 1, flowchart] node: Done"]);
    expect(document.activeElement).toBe(box);
    if (!box) throw new Error("no comment box");
    key(box, "Escape");
    expect(document.activeElement).toBe(flow);
    expect(root(flow).activeElement).toBe(done);
    expect(root(flow).querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });
});
