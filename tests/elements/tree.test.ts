import { afterEach, describe, expect, test } from "bun:test";
import { parse, type TreeData } from "../../src/core/index.ts";
import { configure, resetConfiguration } from "../../src/elements/index.ts";
import { all, cleanup, click, expectCspSafe, expectInert, key, mount, one, PROBE_TEXT, root } from "./helpers.ts";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("lang");
  resetConfiguration();
});

const treeOf = (body: string): TreeData => {
  const segment = parse(`\`\`\`tree\n${body}\n\`\`\`\n`)[0];
  if (segment?.type !== "block" || segment.kind !== "tree") throw new Error("not a tree");
  return segment.data;
};

const SMALL = ["app/", "  src/", "    core/", "      parse.ts", "    elements/", "  README.md {changed}"].join("\n");
/** a/ b/ c/ d/ e.ts: `c` and `d` sit at depth 3 and 4, past the point where folders start closed. */
const DEEP = [
  "a/",
  "  b/",
  "    c/",
  "      d/",
  "        e.ts",
  "      f.ts",
  "  g/",
  "    h/",
  "      i/",
  "        j.ts",
].join("\n");

const items = (el: Element) => all(el, '[role="treeitem"]');
const itemOf = (el: Element, name: string): HTMLElement => {
  const found = items(el).find((item) => item.querySelector('[part="name"]')?.textContent?.replace(/\/$/, "") === name);
  if (!found) throw new Error(`no treeitem ${name}`);
  return found;
};
const open = (el: Element, name: string): boolean | undefined => {
  const value = itemOf(el, name).getAttribute("aria-expanded");
  return value === null ? undefined : value === "true";
};
const shown = (el: Element): string[] =>
  items(el)
    .filter((item) => !item.closest("[hidden]"))
    .map((item) => item.querySelector('[part="name"]')?.textContent ?? "");
/** The item's own row, without the rows of the items below it. */
const row = (item: Element): Element => item.firstElementChild as Element;
const button = (el: Element, part: string) => one<HTMLButtonElement>(el, `button[part="${part}"]`);

describe("pbs-tree: drawing", () => {
  test("a tree of treeitems; folders show a trailing slash, an entry count, and a toggle", () => {
    const el = mount("pbs-tree", treeOf(SMALL));
    expect(one(el, '[role="tree"]').getAttribute("aria-label")).toBe("Directory tree");
    expect(shown(el)).toEqual(["app/", "src/", "core/", "parse.ts", "elements/", "README.md"]);
    expect(itemOf(el, "app").getAttribute("aria-level")).toBe("1");
    expect(itemOf(el, "parse.ts").getAttribute("aria-level")).toBe("4");
    expect(itemOf(el, "src").querySelector('[part="count"]')?.textContent).toBe("entries: 2");
    expect(itemOf(el, "elements").querySelector('[part="count"]')).toBeNull();
    expect(itemOf(el, "parse.ts").getAttribute("aria-expanded")).toBeNull();
    expect(itemOf(el, "src").querySelector('[part="toggle"]')?.textContent).toBe("▾");
    expectCspSafe(el);
  });

  test("tags are badges with a tag attribute for their tone; the item carries them too", () => {
    const el = mount("pbs-tree", treeOf("r/\n  a {new}\n  b {changed, focus}\n  c {removed}\n  d {risk}"));
    const tags = (name: string) =>
      [...row(itemOf(el, name)).querySelectorAll('[part="tag"]')].map((tag) => tag.textContent);
    expect(tags("a")).toEqual(["new"]);
    expect(tags("b")).toEqual(["changed", "focus"]);
    expect(itemOf(el, "b").querySelector('[part="tag"]')?.getAttribute("data-tag")).toBe("changed");
    expect(itemOf(el, "c").getAttribute("data-tags")).toBe("removed");
    expect(itemOf(el, "b").getAttribute("data-tags")).toBe("changed focus");
    expect(tags("r")).toEqual([]);
  });

  test("a note shows beside the name as inline Markdown, and the name is plain text", () => {
    const el = mount("pbs-tree", treeOf("r/\n  a <b>.ts # the **main** [page](https://example.com/p)"));
    const note = itemOf(el, "a <b>.ts").querySelector('[part="note"]') as HTMLElement;
    expect(note.querySelector("strong")?.textContent).toBe("main");
    expect(note.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(itemOf(el, "a <b>.ts").querySelector('[part="name"]')?.textContent).toBe("a <b>.ts");
  });

  test("the item is named by its name, tags, and note", () => {
    const el = mount("pbs-tree", treeOf("r/\n  a.ts {new} # why"));
    const item = itemOf(el, "a.ts");
    const ids = (item.getAttribute("aria-labelledby") ?? "").split(" ");
    const names = ids.map((id) => root(el).getElementById(id)?.textContent);
    expect(names).toEqual(["a.ts", "new", "why"]);
  });

  test("`… N more` is a muted leaf, and a folder's count includes the entries it stands for", () => {
    const el = mount("pbs-tree", treeOf("r/\n  big/\n    a.ts\n    … 40 more"));
    const more = items(el).find((item) => row(item).querySelector('[part="more"]')) as HTMLElement;
    expect(more.textContent).toContain("… 40 more");
    expect(more.getAttribute("aria-expanded")).toBeNull();
    expect(itemOf(el, "big").querySelector('[part="count"]')?.textContent).toBe("entries: 41");
  });

  test("a lone root has no toolbar, and an empty folder has no toggle", () => {
    const alone = mount("pbs-tree", treeOf("r/"));
    expect(all(alone, "button").length).toBe(0);
    const el = mount("pbs-tree", treeOf("r/\n  empty/\n  x"));
    expect(itemOf(el, "empty").getAttribute("aria-expanded")).toBeNull();
    expect(all(el, "button").length).toBe(2);
  });

  test("the probe renders as text", () => {
    expectInert(mount("pbs-tree", { root: { name: PROBE_TEXT, dir: true, tags: [], note: PROBE_TEXT, children: [] } }));
  });

  test("words follow the language", () => {
    document.documentElement.lang = "zh-TW";
    const el = mount("pbs-tree", treeOf(SMALL));
    expect(one(el, '[role="tree"]').getAttribute("aria-label")).toBe("目錄樹");
    expect(button(el, "expand-all").textContent).toBe("全部展開");
    expect(button(el, "collapse-all").textContent).toBe("全部收合");
    expect(itemOf(el, "src").querySelector('[part="count"]')?.textContent).toBe("2 項");
    configure({ strings: { "zh-Hant": { treeExpandAll: "展開全部" } } });
    expect(button(el, "expand-all").textContent).toBe("展開全部");
  });
});

describe("pbs-tree: open and closed", () => {
  test("folders open to depth 2; deeper ones start closed", () => {
    const el = mount("pbs-tree", treeOf(DEEP));
    // a (0), b (1), c (2) are open; d (3) is closed; g (1) open, h (2) open, i (3) closed.
    expect([open(el, "a"), open(el, "b"), open(el, "c"), open(el, "d")]).toEqual([true, true, true, false]);
    expect([open(el, "g"), open(el, "h"), open(el, "i")]).toEqual([true, true, false]);
    expect(shown(el)).toEqual(["a/", "b/", "c/", "d/", "f.ts", "g/", "h/", "i/"]);
  });

  test("a folder that holds a tagged node opens, and so does the path to it", () => {
    const el = mount("pbs-tree", treeOf(DEEP.replace("j.ts", "j.ts {risk}")));
    expect([open(el, "i"), open(el, "h"), open(el, "g"), open(el, "d")]).toEqual([true, true, true, false]);
    expect(shown(el)).toContain("j.ts");
    expect(shown(el)).not.toContain("e.ts");
  });

  test("a tagged folder is itself shown, but opens only when something under it is tagged", () => {
    const el = mount("pbs-tree", treeOf(DEEP.replace("d/", "d/ {focus}")));
    expect(open(el, "d")).toBe(false);
    expect(itemOf(el, "d").querySelector('[part="tag"]')?.textContent).toBe("focus");
  });

  test("a click on a folder toggles it, and the group hides and shows", () => {
    const el = mount("pbs-tree", treeOf(SMALL));
    const src = itemOf(el, "src");
    click(src.querySelector('[part="node"]') as Element);
    expect(open(el, "src")).toBe(false);
    expect((src.querySelector('[role="group"]') as HTMLElement).hidden).toBe(true);
    expect(shown(el)).toEqual(["app/", "src/", "README.md"]);
    expect(src.querySelector('[part="toggle"]')?.textContent).toBe("▸");
    click(src.querySelector('[part="node"]') as Element);
    expect(open(el, "src")).toBe(true);
    expect(shown(el)).toContain("parse.ts");
  });

  test("expand all opens every folder, collapse all closes all but the root", () => {
    const el = mount("pbs-tree", treeOf(DEEP));
    click(button(el, "expand-all"));
    expect([open(el, "a"), open(el, "c"), open(el, "d"), open(el, "i")]).toEqual([true, true, true, true]);
    expect(shown(el)).toContain("e.ts");
    click(button(el, "collapse-all"));
    expect([open(el, "a"), open(el, "b"), open(el, "c"), open(el, "g")]).toEqual([true, false, false, false]);
    expect(shown(el)).toEqual(["a/", "b/", "g/"]);
  });

  test("collapse all moves the single tab stop off an item it hid", () => {
    const el = mount("pbs-tree", treeOf(DEEP));
    click(itemOf(el, "f.ts").querySelector('[part="node"]') as Element);
    click(button(el, "collapse-all"));
    const stops = items(el).filter((item) => item.tabIndex === 0);
    expect(stops.length).toBe(1);
    expect(stops[0]?.closest("[hidden]")).toBeNull();
  });

  test("what the user opened survives a redraw, and new data starts over", () => {
    const el = mount("pbs-tree", treeOf(SMALL));
    click(itemOf(el, "src").querySelector('[part="node"]') as Element);
    document.documentElement.lang = "zh-TW";
    (el as unknown as { refresh: () => void }).refresh();
    expect(open(el, "src")).toBe(false);
    (el as unknown as { data: TreeData }).data = treeOf(SMALL);
    expect(open(el, "src")).toBe(true);
  });
});

describe("pbs-tree: keyboard", () => {
  const press = (el: Element, name: string, keyName: string) => {
    const target = itemOf(el, name);
    target.focus();
    return key(target, keyName);
  };
  const focused = (el: Element): string =>
    (root(el).activeElement?.querySelector('[part="name"]')?.textContent ?? "").replace(/\/$/, "");

  test("one tab stop; the arrows walk the visible items; Home and End jump", () => {
    const el = mount("pbs-tree", treeOf(SMALL));
    expect(items(el).filter((item) => item.tabIndex === 0).length).toBe(1);
    expect(itemOf(el, "app").tabIndex).toBe(0);
    press(el, "app", "ArrowDown");
    expect(focused(el)).toBe("src");
    expect(itemOf(el, "src").tabIndex).toBe(0);
    expect(itemOf(el, "app").tabIndex).toBe(-1);
    press(el, "src", "ArrowDown");
    expect(focused(el)).toBe("core");
    press(el, "core", "ArrowUp");
    expect(focused(el)).toBe("src");
    press(el, "src", "End");
    expect(focused(el)).toBe("README.md");
    press(el, "README.md", "ArrowDown");
    expect(focused(el)).toBe("README.md");
    press(el, "README.md", "Home");
    expect(focused(el)).toBe("app");
  });

  test("Right opens a closed folder, then enters it; Left closes an open folder, then climbs", () => {
    const el = mount("pbs-tree", treeOf(DEEP));
    press(el, "d", "ArrowRight");
    expect(open(el, "d")).toBe(true);
    press(el, "d", "ArrowRight");
    expect(focused(el)).toBe("e.ts");
    press(el, "e.ts", "ArrowRight");
    expect(focused(el)).toBe("e.ts");
    press(el, "e.ts", "ArrowLeft");
    expect(focused(el)).toBe("d");
    press(el, "d", "ArrowLeft");
    expect(open(el, "d")).toBe(false);
    press(el, "d", "ArrowLeft");
    expect(focused(el)).toBe("c");
  });

  test("Enter and Space toggle a folder and do nothing on a file", () => {
    const el = mount("pbs-tree", treeOf(SMALL));
    const enter = press(el, "src", "Enter");
    expect(open(el, "src")).toBe(false);
    expect(enter.defaultPrevented).toBe(true);
    press(el, "src", " ");
    expect(open(el, "src")).toBe(true);
    press(el, "README.md", "Enter");
    expect(shown(el)).toContain("README.md");
  });

  test("keys with a modifier, and other keys, are left alone", () => {
    const el = mount("pbs-tree", treeOf(SMALL));
    const target = itemOf(el, "src");
    target.focus();
    expect(key(target, "ArrowLeft", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(target, "a").defaultPrevented).toBe(false);
    expect(open(el, "src")).toBe(true);
  });
});
