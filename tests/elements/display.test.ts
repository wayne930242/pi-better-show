import { afterEach, describe, expect, test } from "bun:test";
import type { AlertData, CardsData, DiffData, MermaidData, StatsData, StepsData } from "../../src/core/types.ts";
import { configure, resetConfiguration } from "../../src/elements/index.ts";
import { all, cleanup, expectCspSafe, expectInert, mount, one, PROBE_TEXT, text } from "./helpers.ts";

afterEach(() => {
  cleanup();
  resetConfiguration();
});

describe("pbs-callout", () => {
  test("renders title, paragraphs, a list, and an http link that opens safely", () => {
    const el = mount<AlertData>("pbs-callout", {
      tone: "warn",
      title: "Heads up",
      body: "This **overwrites** the [cache](https://example.com/c).\n\n- one\n- two",
    });
    expect(one(el, '[part="callout"]').getAttribute("data-tone")).toBe("warn");
    expect(one(el, '[part="title"]').textContent).toBe("Heads up");
    expect(one(el, "strong").textContent).toBe("overwrites");
    const link = one<HTMLAnchorElement>(el, "a");
    expect(link.getAttribute("href")).toBe("https://example.com/c");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(all(el, "li").map((li) => li.textContent)).toEqual(["one", "two"]);
    expectCspSafe(el);
  });

  test("a non-http link is text, and an empty title falls back to the tone's word", () => {
    const el = mount<AlertData>("pbs-callout", { tone: "risk", title: "", body: "[x](javascript:alert(1))" });
    expect(root0(el).querySelector("a")).toBeNull();
    expect(one(el, '[part="title"]').textContent).toBe("Caution");
  });

  test("the probe renders as text", () => {
    const el = mount<AlertData>("pbs-callout", { tone: "note", title: PROBE_TEXT, body: PROBE_TEXT });
    expectInert(el);
  });
});

const root0 = (el: Element) => el.shadowRoot as ShadowRoot;

describe("pbs-cards", () => {
  test("renders a card per entry, tinted only for a known tone", () => {
    const el = mount<CardsData>("pbs-cards", {
      cards: [
        { title: "Speed", tone: "ok", body: "**2x** faster" },
        { title: "Plain" },
        { title: "Odd", tone: "pink" },
      ],
    });
    const cards = all(el, '[part="card"]');
    expect(cards.map((card) => card.getAttribute("data-tone"))).toEqual(["ok", null, null]);
    expect(cards[0]?.querySelector("strong")?.textContent).toBe("2x");
    expectCspSafe(el);
  });

  test("the probe renders as text", () => {
    expectInert(mount<CardsData>("pbs-cards", { cards: [{ title: PROBE_TEXT, tone: "warn", body: PROBE_TEXT }] }));
  });
});

describe("pbs-steps", () => {
  const data: StepsData = {
    items: [
      { title: "Design", status: "done", when: "Mon" },
      { title: "Build", status: "doing", body: "In progress" },
      { title: "Ship", status: "todo" },
      { title: "Legal", status: "blocked" },
    ],
  };

  test("an ordered list whose status shows as a badge word, a mark, and a tone", () => {
    const el = mount("pbs-steps", data);
    const items = all(el, '[part="step"]');
    expect(items.map((item) => item.getAttribute("data-status"))).toEqual(["done", "doing", "todo", "blocked"]);
    expect(all(el, '[part="badge"]').map((badge) => badge.textContent)).toEqual([
      "Done",
      "In progress",
      "To do",
      "Blocked",
    ]);
    expect(all(el, '[part="marker"]').map((mark) => mark.textContent)).toEqual(["✓", "●", "○", "✕"]);
    expect(items[0]?.getAttribute("data-tone")).toBe("ok");
    expect(items[2]?.getAttribute("data-tone")).toBeNull();
    expect(one(el, '[part="when"]').textContent).toBe("Mon");
    expect(root0(el).querySelector("ol")).not.toBeNull();
    expectCspSafe(el);
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<StepsData>("pbs-steps", {
        items: [{ title: PROBE_TEXT, status: "todo", when: PROBE_TEXT, body: PROBE_TEXT }],
      }),
    );
  });
});

describe("pbs-stats", () => {
  test("tiles with a value, a delta whose direction shows as a glyph, and a note", () => {
    const el = mount<StatsData>("pbs-stats", {
      items: [
        { label: "Users", value: "1204", delta: "+4%", tone: "ok" },
        { label: "Errors", value: "3", delta: "-2", note: "last hour" },
      ],
    });
    expect(all(el, '[part="value"]').map((v) => v.textContent)).toEqual(["1204", "3"]);
    expect(all(el, '[part="delta"]').map((d) => d.textContent)).toEqual(["▲ +4%", "▼ -2"]);
    expect(one(el, '[part="note"]').textContent).toBe("last hour");
    expectCspSafe(el);
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<StatsData>("pbs-stats", {
        items: [{ label: PROBE_TEXT, value: PROBE_TEXT, delta: PROBE_TEXT, note: PROBE_TEXT }],
      }),
    );
  });
});

describe("pbs-diff", () => {
  const source = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n keep\n--- a comment removed\n-old\n+new";

  test("classifies lines: file headers by their pairing, a removed `--` line as removed", () => {
    const el = mount<DiffData>("pbs-diff", { source });
    expect(all(el, '[part="line"]').map((line) => line.getAttribute("data-kind"))).toEqual([
      "meta",
      "meta",
      "meta",
      "hunk",
      "context",
      "del",
      "del",
      "add",
    ]);
    expect(one(el, '[role="region"]').getAttribute("tabindex")).toBe("0");
    expectCspSafe(el);
  });

  test("the probe renders as text", () => {
    expectInert(mount<DiffData>("pbs-diff", { source: `+${PROBE_TEXT}\n-${PROBE_TEXT}` }));
  });
});

describe("pbs-diagram", () => {
  const data: MermaidData = { source: "graph TD\n  A-->B" };

  test("without a diagramUrl hook it shows the source and says why", () => {
    const el = mount("pbs-diagram", data);
    expect(root0(el).querySelector("img")).toBeNull();
    expect(one(el, "code").textContent).toBe(data.source);
    expect(one(el, '[part="note"]').textContent).toContain("source");
    expectCspSafe(el);
  });

  test("with the hook it shows the image, asks for the scheme in force, and keeps the source in a disclosure", () => {
    const seen: [string, string][] = [];
    configure({
      diagramUrl: (source, scheme) => {
        seen.push([source, scheme]);
        return `/d/${scheme}.svg`;
      },
    });
    const el = mount("pbs-diagram", data, { scheme: "dark" });
    expect(one<HTMLImageElement>(el, "img").getAttribute("src")).toBe("/d/dark.svg");
    expect(seen.at(-1)).toEqual([data.source, "dark"]);
    expect(one(el, "details code").textContent).toBe(data.source);
    el.setAttribute("scheme", "light");
    expect(one<HTMLImageElement>(el, "img").getAttribute("src")).toBe("/d/light.svg");
  });

  test("an image that fails to load falls back to the source", () => {
    configure({ diagramUrl: () => "/missing.svg" });
    const el = mount("pbs-diagram", data);
    one(el, "img").dispatchEvent(new Event("error"));
    expect(root0(el).querySelector("img")).toBeNull();
    expect(text(el)).toContain("A-->B");
  });

  test("the probe renders as text", () => {
    expectInert(mount<MermaidData>("pbs-diagram", { source: PROBE_TEXT }));
  });
});
