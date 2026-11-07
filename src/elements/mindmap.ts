import type { MindmapData, MindmapNode } from "../core/types.ts";
import { define, PbsElement } from "./base.ts";
import { h, inlineNodes, uid } from "./dom.ts";

const mindmapCss = `
.mindmap { padding: var(--_pad-s) var(--_pad); }
.mindmap ul { list-style: none; margin: 0; padding: 0; }
.mindmap ul ul { padding-left: 1.4rem; }
.mindmap li { margin: 0; }
.mindmap li:focus { outline: none; }
.mindmap .node { display: flex; align-items: baseline; gap: 0.3rem; padding: 0.12rem 0.4rem; border-radius: 6px; cursor: default; }
.mindmap li[aria-expanded] > .node { cursor: pointer; }
.mindmap li:focus-visible > .node { outline: 2px solid var(--_accent); outline-offset: 1px; }
.mindmap .node:hover { background: var(--_surface); }
.mindmap .toggle { flex: none; width: 1em; color: var(--_muted); text-align: center; font-size: 0.85em; }
.mindmap [data-level="0"] > .node .label { font-weight: 700; font-size: 1.08em; }
.mindmap [data-level="1"] > .node .label { font-weight: 600; }
`;

/** Beyond this many nodes the tree opens only to its second level. */
const OPEN_ALL_UP_TO = 30;

interface Item {
  node: MindmapNode;
  element: HTMLElement;
  group: HTMLElement | undefined;
  toggle: HTMLElement;
  parent: Item | undefined;
  children: Item[];
  expanded: boolean;
}

const count = (node: MindmapNode): number => 1 + node.children.reduce((sum, child) => sum + count(child), 0);

/** A collapsible tree (WAI-ARIA tree pattern): arrows move and open or close, Enter and Space toggle, Home and End jump. */
export class PbsMindmap extends PbsElement<MindmapData> {
  static override css = mindmapCss;

  protected view(data: MindmapData): Node {
    const openAll = count(data.root) <= OPEN_ALL_UP_TO;
    const items: Item[] = [];
    let current: Item | undefined;

    const build = (
      node: MindmapNode,
      level: number,
      parent: Item | undefined,
      position: number,
      size: number,
    ): Item => {
      const labelId = uid("pbs-node");
      const toggle = h("span", { part: "toggle", class: "toggle", "aria-hidden": "true" });
      const label = h("span", { part: "label", class: "label", id: labelId }, inlineNodes(node.text));
      const element = h(
        "li",
        {
          role: "treeitem",
          part: "item",
          tabindex: "-1",
          "aria-labelledby": labelId,
          "aria-level": level + 1,
          "aria-setsize": size,
          "aria-posinset": position + 1,
          "data-level": level,
        },
        h("div", { part: "node", class: "node" }, toggle, label),
      );
      const item: Item = {
        node,
        element,
        group: undefined,
        toggle,
        parent,
        children: [],
        expanded: openAll || level < 1,
      };
      items.push(item);
      if (node.children.length > 0) {
        item.children = node.children.map((child, index) => build(child, level + 1, item, index, node.children.length));
        item.group = h(
          "ul",
          { role: "group", part: "group" },
          item.children.map((child) => child.element),
        );
        element.append(item.group);
      }
      sync(item);
      return item;
    };

    /** Brings an item's markers in line with its open state. */
    const sync = (item: Item) => {
      const branch = item.children.length > 0;
      if (branch) item.element.setAttribute("aria-expanded", String(item.expanded));
      if (item.group) item.group.hidden = !item.expanded;
      item.toggle.textContent = branch ? (item.expanded ? "▾" : "▸") : "•";
    };

    const visible = (): Item[] => {
      const out: Item[] = [];
      const walk = (item: Item) => {
        out.push(item);
        if (item.expanded) item.children.forEach(walk);
      };
      walk(root);
      return out;
    };
    const focus = (item: Item) => {
      for (const each of items) each.element.tabIndex = each === item ? 0 : -1;
      current = item;
      item.element.focus();
    };
    const toggle = (item: Item, open = !item.expanded) => {
      if (item.children.length === 0) return;
      item.expanded = open;
      sync(item);
    };

    const root = build(data.root, 0, undefined, 0, 1);
    root.element.tabIndex = 0;
    current = root;

    const tree = h("ul", { role: "tree", part: "tree", "aria-label": this.t("mindmap") }, root.element);
    tree.addEventListener("focusin", (event) => {
      const found = items.find((item) => item.element === event.target);
      if (found) {
        for (const each of items) each.element.tabIndex = each === found ? 0 : -1;
        current = found;
      }
    });
    tree.addEventListener("click", (event) => {
      const node = (event.target as Element).closest(".node");
      const found = items.find((item) => item.element.firstElementChild === node);
      if (!found) return;
      toggle(found);
      focus(found);
    });
    tree.addEventListener("keydown", (event) => {
      const item = current;
      if (!item || event.altKey || event.ctrlKey || event.metaKey || event.target !== item.element) return;
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
          if (item.children.length > 0 && !item.expanded) toggle(item, true);
          else if (item.children.length > 0) focus(item.children[0] as Item);
          break;
        case "ArrowLeft":
          if (item.children.length > 0 && item.expanded) toggle(item, false);
          else if (item.parent) focus(item.parent);
          break;
        case "Enter":
        case " ":
          toggle(item);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    });
    return h("div", { part: "mindmap", class: "panel mindmap" }, tree);
  }
}

export function defineMindmap(): void {
  define("pbs-mindmap", PbsMindmap);
}
