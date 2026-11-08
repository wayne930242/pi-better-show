import type { TreeData, TreeNode } from "../core/types.ts";
import { define, PbsElement } from "./base.ts";
import { h, inlineNodes, uid } from "./dom.ts";

const treeCss = `
.treeview { padding: 0; overflow: hidden; }
.treeview .bar { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; padding: var(--_pad-s) var(--_pad); border-bottom: 1px solid var(--_line); background: var(--_surface); }
.treeview .bar .btn { padding: 0.15em 0.7em; font-size: 0.9em; }
.treeview .body { padding: var(--_pad-s) var(--_pad); overflow: auto; max-width: 100%; }
.treeview ul { list-style: none; margin: 0; padding: 0; }
.treeview ul ul { padding-left: 1.2rem; }
.treeview li { margin: 0; }
.treeview li:focus { outline: none; }
.treeview .node { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.45rem; padding: 0.1rem 0.4rem; border-radius: 6px; cursor: default; }
.treeview li[aria-expanded] > .node { cursor: pointer; }
.treeview li:focus-visible > .node { outline: 2px solid var(--_accent); outline-offset: 1px; }
.treeview .node:hover { background: var(--_surface); }
.treeview .toggle { flex: none; width: 1em; color: var(--_muted); text-align: center; font-size: 0.85em; }
.treeview .name { font-family: var(--_mono); font-size: 0.92em; overflow-wrap: anywhere; }
.treeview .count { color: var(--_muted); font-size: 0.8em; }
.treeview .tags { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; }
.treeview .note { min-width: 0; flex: 1 1 12rem; color: var(--_muted); font-size: 0.9em; }
.treeview .more { color: var(--_muted); font-size: 0.9em; font-style: italic; }
.treeview [data-tag="new"] { --_t: var(--_ok); }
.treeview [data-tag="changed"] { --_t: var(--_note); }
.treeview [data-tag="removed"] { --_t: var(--_muted); }
.treeview [data-tag="focus"] { --_t: var(--_accent); }
.treeview [data-tag="risk"] { --_t: var(--_risk); }
.treeview li[data-tags~="removed"] > .node .name { color: var(--_muted); text-decoration: line-through; }
.treeview li[data-tags~="focus"] > .node { background: color-mix(in srgb, var(--_accent) 10%, transparent); }
.treeview li[data-tags~="risk"] > .node .name { color: var(--_risk); }
`;

/** Folders deeper than this start closed, unless something under them is tagged. */
const OPEN_TO_LEVEL = 2;

interface Item {
  node: TreeNode;
  /** The item's address in the tree (`0.2.1`), which keeps its open state across a redraw. */
  path: string;
  element: HTMLElement;
  group: HTMLElement | undefined;
  toggle: HTMLElement;
  parent: Item | undefined;
  children: Item[];
  expanded: boolean;
  /** The node or something below it carries a tag. */
  tagged: boolean;
}

/** Entries a folder holds, counting the ones a `… N more` line stands for. */
const entries = (node: TreeNode): number => node.children.reduce((sum, child) => sum + (child.more ?? 1), 0);

/**
 * A directory tree (WAI-ARIA tree pattern): folders open and close by click, arrows, Enter and Space; Home and End jump.
 * Tags show as badges, notes beside the name, and the folders that hold a tagged node start open.
 */
export class PbsTree extends PbsElement<TreeData> {
  static override css = treeCss;
  /** Open state the user chose, by item path. */
  #open = new Map<string, boolean>();

  protected override reset(): void {
    this.#open = new Map();
  }

  protected view(data: TreeData): Node {
    const items: Item[] = [];
    let current: Item | undefined;

    const build = (node: TreeNode, path: string, level: number, parent: Item | undefined, at: number, of: number) => {
      const ids = { name: uid("pbs-tree"), note: uid("pbs-tree") };
      const toggle = h("span", { part: "toggle", class: "toggle", "aria-hidden": "true" });
      const tagIds: string[] = [];
      const row: (Node | null)[] = [toggle];
      if (node.more === undefined) {
        row.push(h("span", { part: "name", class: "name", id: ids.name }, node.name + (node.dir ? "/" : "")));
        if (node.children.length > 0) {
          row.push(h("span", { part: "count", class: "count" }, this.t("treeEntries", { n: entries(node) })));
        }
        if (node.tags.length > 0) {
          row.push(
            h(
              "span",
              { part: "tags", class: "tags" },
              node.tags.map((tag) => {
                const id = uid("pbs-tree");
                tagIds.push(id);
                return h("span", { part: "tag", class: "badge tag", id, "data-tag": tag }, tag);
              }),
            ),
          );
        }
        if (node.note !== undefined) {
          row.push(h("span", { part: "note", class: "note", id: ids.note }, inlineNodes(node.note)));
        }
      } else {
        row.push(h("span", { part: "more", class: "more", id: ids.name }, node.name));
      }
      const labelled = [ids.name, ...tagIds, ...(node.note !== undefined && node.more === undefined ? [ids.note] : [])];
      const element = h(
        "li",
        {
          role: "treeitem",
          part: "item",
          tabindex: "-1",
          "aria-labelledby": labelled.join(" "),
          "aria-level": level + 1,
          "aria-setsize": of,
          "aria-posinset": at + 1,
          "data-tags": node.tags.length > 0 ? node.tags.join(" ") : null,
        },
        h("div", { part: "node", class: "node" }, row),
      );
      const item: Item = {
        node,
        path,
        element,
        group: undefined,
        toggle,
        parent,
        children: [],
        expanded: false,
        tagged: node.tags.length > 0,
      };
      items.push(item);
      if (node.children.length > 0) {
        item.children = node.children.map((child, index) =>
          build(child, `${path}.${index}`, level + 1, item, index, node.children.length),
        );
        item.group = h(
          "ul",
          { role: "group", part: "group" },
          item.children.map((child) => child.element),
        );
        element.append(item.group);
        const holdsTag = item.children.some((child) => child.tagged);
        item.tagged ||= holdsTag;
        item.expanded = this.#open.get(path) ?? (level <= OPEN_TO_LEVEL || holdsTag);
      }
      sync(item);
      (element.firstElementChild as Element).addEventListener("click", () => {
        toggleItem(item);
        focus(item);
      });
      return item;
    };

    /** Brings an item's markers in line with its open state. */
    const sync = (item: Item) => {
      const branch = item.children.length > 0;
      if (branch) item.element.setAttribute("aria-expanded", String(item.expanded));
      if (item.group) item.group.hidden = !item.expanded;
      item.toggle.textContent = branch ? (item.expanded ? "▾" : "▸") : "";
    };
    const setOpen = (item: Item, open: boolean) => {
      if (item.children.length === 0 || item.expanded === open) return;
      item.expanded = open;
      this.#open.set(item.path, open);
      sync(item);
    };
    const toggleItem = (item: Item) => setOpen(item, !item.expanded);

    const visible = (): Item[] => {
      const out: Item[] = [];
      const walk = (item: Item) => {
        out.push(item);
        if (item.expanded) item.children.forEach(walk);
      };
      walk(root);
      return out;
    };
    const stop = (item: Item) => {
      for (const each of items) each.element.tabIndex = each === item ? 0 : -1;
      current = item;
    };
    const focus = (item: Item) => {
      stop(item);
      item.element.focus();
    };
    /** After folders closed: the single tab stop goes to the nearest item still shown. */
    const keepStop = () => {
      const shown = new Set(visible());
      let at = current;
      while (at && !shown.has(at)) at = at.parent;
      stop(at ?? root);
    };
    const all = (open: boolean) => {
      for (const item of items) {
        // Closing everything leaves the root open: a closed root would hide the whole tree.
        setOpen(item, item === root ? true : open);
      }
      keepStop();
    };

    const root = build(data.root, "0", 0, undefined, 0, 1);
    stop(root);

    const tree = h("ul", { role: "tree", part: "tree", "aria-label": this.t("tree") }, root.element);
    tree.addEventListener("focusin", (event) => {
      const found = items.find((item) => item.element === event.target);
      if (found) stop(found);
    });
    tree.addEventListener("keydown", (event) => {
      const item = items.find((each) => each.element === event.target);
      if (!item || event.altKey || event.ctrlKey || event.metaKey) return;
      const list = visible();
      const at = list.indexOf(item);
      let handled = true;
      switch (event.key) {
        case "ArrowDown":
          focus(list[Math.min(list.length - 1, at + 1)] as Item);
          break;
        case "ArrowUp":
          focus(list[Math.max(0, at - 1)] as Item);
          break;
        case "Home":
          focus(list[0] as Item);
          break;
        case "End":
          focus(list[list.length - 1] as Item);
          break;
        case "ArrowRight":
          if (item.children.length > 0 && !item.expanded) setOpen(item, true);
          else if (item.children.length > 0) focus(item.children[0] as Item);
          break;
        case "ArrowLeft":
          if (item.children.length > 0 && item.expanded) setOpen(item, false);
          else if (item.parent) focus(item.parent);
          break;
        case "Enter":
        case " ":
          toggleItem(item);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    });

    const button = (part: string, label: string, onClick: () => void) => {
      const control = h("button", { type: "button", part, class: "btn quiet" }, label);
      control.addEventListener("click", onClick);
      return control;
    };
    const bar =
      data.root.children.length > 0
        ? h(
            "div",
            { part: "bar", class: "bar" },
            button("expand-all", this.t("treeExpandAll"), () => all(true)),
            button("collapse-all", this.t("treeCollapseAll"), () => all(false)),
          )
        : null;
    return h("div", { part: "treeview", class: "panel treeview" }, bar, h("div", { class: "body" }, tree));
  }
}

export function defineTree(): void {
  define("pbs-tree", PbsTree);
}
