import { afterEach, describe, expect, test } from "bun:test";
import type { MindmapData, TableData } from "../../src/core/types.ts";
import {
  all,
  cleanup,
  click,
  expectCspSafe,
  expectInert,
  key,
  mount,
  one,
  PROBE_TEXT,
  root,
  text,
  type,
} from "./helpers.ts";

afterEach(cleanup);

const table: TableData = {
  columns: [
    { name: "name", label: "Name", align: "left", type: "text" },
    { name: "size", label: "Size", align: "right", type: "number" },
    { name: "day", label: "Day", align: "left", type: "date" },
  ],
  rows: [
    ["alpha", 10, "2026-03-01"],
    ["beta", 2, "2026-01-15"],
    ["gamma", "1,204", null],
    ["delta", null, "2026-02-01"],
    ["item 10", 7, "2026-04-01"],
    ["item 9", 8, "2026-05-01"],
  ],
  filter: true,
};

const names = (el: Element) => all(el, '[part="body"] tr').map((row) => row.querySelector("td")?.textContent);
const heads = (el: Element) => all(el, '[part="sort"]');

describe("pbs-table", () => {
  test("renders headers with sort buttons, aligned cells, the row count, and the filter box", () => {
    const el = mount("pbs-table", table);
    expect(all(el, '[part="head"]').map((head) => head.getAttribute("aria-sort"))).toEqual(["none", "none", "none"]);
    expect(heads(el)[1]?.getAttribute("aria-label")).toBe("Sort by Size");
    expect(all(el, '[part="cell"]')[1]?.getAttribute("data-align")).toBe("right");
    expect(one(el, '[part="count"]').textContent).toBe("6 of 6 rows");
    expect(one(el, '[part="filter"]').getAttribute("aria-label")).toBe("Filter rows");
    expect(one(el, '[role="region"]').getAttribute("tabindex")).toBe("0");
    expectCspSafe(el);
  });

  test("a header click cycles ascending, descending, then the author's order", () => {
    const el = mount("pbs-table", table);
    click(heads(el)[1] as HTMLElement);
    // Numbers sort as numbers ("1,204" is 1204, 10 after 8), empty cells last.
    expect(names(el)).toEqual(["beta", "item 10", "item 9", "alpha", "gamma", "delta"]);
    expect(all(el, '[part="head"]')[1]?.getAttribute("aria-sort")).toBe("ascending");
    click(heads(el)[1] as HTMLElement);
    expect(names(el)).toEqual(["gamma", "alpha", "item 9", "item 10", "beta", "delta"]);
    expect(all(el, '[part="head"]')[1]?.getAttribute("aria-sort")).toBe("descending");
    click(heads(el)[1] as HTMLElement);
    expect(names(el)).toEqual(["alpha", "beta", "gamma", "delta", "item 10", "item 9"]);
    expect(all(el, '[part="head"]')[1]?.getAttribute("aria-sort")).toBe("none");
  });

  test("text sorts naturally (item 9 before item 10) and dates by time; focus stays on the header button", () => {
    const el = mount("pbs-table", table);
    const [name, , day] = heads(el) as HTMLElement[];
    name?.focus();
    click(name as HTMLElement);
    expect(names(el)).toEqual(["alpha", "beta", "delta", "gamma", "item 9", "item 10"]);
    expect(root(el).activeElement).toBe(name as HTMLElement);
    click(day as HTMLElement);
    expect(names(el)).toEqual(["beta", "delta", "alpha", "item 10", "item 9", "gamma"]);
  });

  test("starts sorted by the block's sort", () => {
    const el = mount("pbs-table", { ...table, sort: { column: 1, direction: "desc" } });
    expect(names(el)).toEqual(["gamma", "alpha", "item 9", "item 10", "beta", "delta"]);
    expect(all(el, '[part="head"]')[1]?.getAttribute("aria-sort")).toBe("descending");
  });

  test("the filter keeps matching rows over every cell, case-insensitively, updates the count, and says when nothing matches", () => {
    const el = mount("pbs-table", table);
    const box = one<HTMLInputElement>(el, '[part="filter"]');
    type(box, "ITEM");
    expect(names(el)).toEqual(["item 10", "item 9"]);
    expect(one(el, '[part="count"]').textContent).toBe("2 of 6 rows");
    type(box, "2026-01");
    expect(names(el)).toEqual(["beta"]);
    type(box, "nothing like this");
    expect(one(el, '[part="empty"]').textContent).toBe("No matching rows");
    type(box, "");
    expect(names(el).length).toBe(6);
  });

  test("sort and filter survive a density redraw; no filter box unless the block asks for one", () => {
    const el = mount("pbs-table", table);
    click(heads(el)[0] as HTMLElement);
    type(one<HTMLInputElement>(el, '[part="filter"]'), "a");
    el.setAttribute("density", "compact");
    expect(one<HTMLInputElement>(el, '[part="filter"]').value).toBe("a");
    expect(all(el, '[part="head"]')[0]?.getAttribute("aria-sort")).toBe("ascending");
    const plain = mount("pbs-table", { ...table, filter: false });
    expect(root(plain).querySelector('[part="filter"]')).toBeNull();
  });

  test("booleans read as words", () => {
    const el = mount<TableData>("pbs-table", {
      columns: [{ name: "ok", label: "OK", align: "left", type: "text" }],
      rows: [[true], [false]],
      filter: false,
    });
    expect(all(el, '[part="cell"]').map((cell) => cell.textContent)).toEqual(["Yes", "No"]);
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<TableData>("pbs-table", {
        columns: [{ name: PROBE_TEXT, label: PROBE_TEXT, align: "left", type: "text" }],
        rows: [[PROBE_TEXT]],
        filter: true,
      }),
    );
  });
});

const map: MindmapData = {
  root: {
    text: "Release",
    children: [
      {
        text: "Build",
        children: [
          { text: "bundle", children: [] },
          { text: "sign", children: [] },
        ],
      },
      { text: "Ship", children: [{ text: "tag", children: [] }] },
    ],
  },
};
const items = (el: Element) => all(el, '[role="treeitem"]');
const label = (item: Element | undefined) => item?.querySelector(".label")?.textContent;

describe("pbs-mindmap", () => {
  test("a small map opens fully as a labelled tree with levels and set sizes", () => {
    const el = mount("pbs-mindmap", map);
    expect(one(el, '[role="tree"]').getAttribute("aria-label")).toBe("Mind map");
    expect(items(el).map(label)).toEqual(["Release", "Build", "bundle", "sign", "Ship", "tag"]);
    expect(items(el).map((item) => item.getAttribute("aria-expanded"))).toEqual([
      "true",
      "true",
      null,
      null,
      "true",
      null,
    ]);
    expect(items(el)[2]?.getAttribute("aria-level")).toBe("3");
    expect(items(el)[4]?.getAttribute("aria-posinset")).toBe("2");
    expect(items(el)[4]?.getAttribute("aria-setsize")).toBe("2");
    expect(items(el).map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    expectCspSafe(el);
  });

  test("arrows, Home and End move; Right opens or enters, Left closes or leaves; Enter and Space toggle", () => {
    const el = mount("pbs-mindmap", map);
    const [release, build, bundle, , ship] = items(el) as HTMLElement[];
    release?.focus();
    expect(key(release as HTMLElement, "ArrowDown").defaultPrevented).toBe(true);
    expect(root(el).activeElement).toBe(build as HTMLElement);
    key(build as HTMLElement, "ArrowDown");
    expect(root(el).activeElement).toBe(bundle as HTMLElement);
    key(bundle as HTMLElement, "ArrowLeft");
    expect(root(el).activeElement).toBe(build as HTMLElement);
    key(build as HTMLElement, "ArrowLeft");
    expect(build?.getAttribute("aria-expanded")).toBe("false");
    // The collapsed branch's children are skipped by the arrows.
    key(build as HTMLElement, "ArrowDown");
    expect(root(el).activeElement).toBe(ship as HTMLElement);
    key(ship as HTMLElement, "ArrowUp");
    key(build as HTMLElement, "ArrowRight");
    expect(build?.getAttribute("aria-expanded")).toBe("true");
    key(build as HTMLElement, "ArrowRight");
    expect(root(el).activeElement).toBe(bundle as HTMLElement);
    key(bundle as HTMLElement, "End");
    expect(label(root(el).activeElement as Element)).toBe("tag");
    key(root(el).activeElement as Element, "Home");
    expect(root(el).activeElement).toBe(release as HTMLElement);
    key(release as HTMLElement, "Enter");
    expect(release?.getAttribute("aria-expanded")).toBe("false");
    key(release as HTMLElement, " ");
    expect(release?.getAttribute("aria-expanded")).toBe("true");
    expect(items(el).filter((item) => item.getAttribute("tabindex") === "0").length).toBe(1);
  });

  test("a click on a branch toggles it and focuses it", () => {
    const el = mount("pbs-mindmap", map);
    const build = items(el)[1] as HTMLElement;
    click(build.querySelector(".node") as Element);
    expect(build.getAttribute("aria-expanded")).toBe("false");
    expect(root(el).activeElement).toBe(build);
    expect(build.querySelector("ul")?.hidden).toBe(true);
  });

  test("a big map opens only to its second level", () => {
    const leaves = Array.from({ length: 31 }, (_, index) => ({ text: `leaf ${index}`, children: [] }));
    const el = mount<MindmapData>("pbs-mindmap", {
      root: {
        text: "root",
        children: [{ text: "branch", children: [{ text: "deep", children: leaves.slice(0, 3) }, ...leaves] }],
      },
    });
    const [, branch, deep] = items(el);
    expect(branch?.getAttribute("aria-expanded")).toBe("false");
    expect(deep?.getAttribute("aria-expanded")).toBe("false");
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<MindmapData>("pbs-mindmap", { root: { text: PROBE_TEXT, children: [{ text: PROBE_TEXT, children: [] }] } }),
    );
    expect(text(mount("pbs-mindmap", map))).toContain("Release");
  });
});
