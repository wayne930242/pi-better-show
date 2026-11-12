import { inline } from "../core/inline.ts";
import type { InlineToken } from "../core/types.ts";

/**
 * DOM building without markup: every string an element shows reaches the page as a text node or an attribute
 * value, never as HTML. Nothing here (or anywhere in `src/elements`) parses markup.
 */

export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, string | number | boolean | null | undefined>;

/** Properties that must be set as properties, not attributes, to take effect on a live control. */
const AS_PROPERTY = new Set(["value", "checked", "selected", "indeterminate"]);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (AS_PROPERTY.has(name)) (node as unknown as Record<string, unknown>)[name] = value;
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** An SVG element built from attribute values only (geometry, classes, labels), never from markup. */
export function svg(tag: string, props?: Props | null, ...children: (SVGElement | null)[]): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export function append(parent: ParentNode, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

const SAFE_HREF = /^https?:\/\/[^\s<>]+$/i;

function tokenNode(token: InlineToken): Node {
  switch (token.type) {
    case "text":
      return document.createTextNode(token.text);
    case "code":
      return h("code", null, token.text);
    case "br":
      return document.createElement("br");
    case "strong":
      return h("strong", null, token.children.map(tokenNode));
    case "em":
      return h("em", null, token.children.map(tokenNode));
    case "link": {
      const children = token.children.map(tokenNode);
      // Core already admits http(s) only; a link that is not one is shown as its text.
      if (!SAFE_HREF.test(token.href)) return h("span", null, children);
      return h("a", { href: token.href, target: "_blank", rel: "noopener noreferrer" }, children);
    }
  }
}

/** Restricted inline Markdown as nodes (text, `code`, `strong`, `em`, `br`, and http(s) links). */
export const inlineNodes = (text: string): Node[] => inline(text).map(tokenNode);

const LIST = /^\s*(?:[-*+]|\d+[.)])\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;

/** Text with paragraphs (blank lines) and simple lists, each line through inline Markdown; for callout and card bodies. */
export function prose(text: string, part = "body"): HTMLElement[] {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim() !== "")
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      if (lines.every((line) => LIST.test(line))) {
        const items = lines.map((line) => h("li", null, inlineNodes(line.replace(LIST, ""))));
        return h(ORDERED.test(lines[0] as string) ? "ol" : "ul", { part }, items);
      }
      return h("p", { part }, inlineNodes(paragraph));
    });
}

let counter = 0;
/** A document-unique id for label and description wiring. */
export const uid = (prefix = "pbs"): string => `${prefix}-${++counter}`;

/** Plain text of a cell, option, or label as shown. */
export const plain = (value: string | number | boolean | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);
