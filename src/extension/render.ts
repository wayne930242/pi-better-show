import MarkdownIt from "markdown-it";
import { parse } from "../core/index.ts";
import type { Segment } from "../core/types.ts";
import { TAGS } from "../elements/index.ts";

/** Prose is Markdown with raw HTML left as text; blocks become `pbs-*` elements that read their data from an attribute. */
const md = new MarkdownIt({ html: false, linkify: true });

const defaultLink = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  if (token) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return defaultLink ? defaultLink(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
};

export const escapeHtml = (text: string): string => md.utils.escapeHtml(text);

const attr = (name: string, value: string): string => ` ${name}="${escapeHtml(value)}"`;

export interface RenderOptions {
  /** The name the agent and the user know the document by; it rides in each answer's `ref.doc`. */
  display: string;
  /** Fields already sent for a block, by block index, so a reloaded page shows what was sent. */
  answered?: ReadonlyMap<number, readonly (readonly [string, string])[]>;
}

function renderSegment(segment: Segment, options: RenderOptions): string {
  switch (segment.type) {
    case "markdown":
      return md.render(segment.text);
    case "invalid":
      return [
        `<pbs-callout${attr("data-json", JSON.stringify({ tone: "risk", title: `This ${segment.kind} block could not be drawn`, body: segment.error }))}></pbs-callout>`,
        `<pre class="pbs-invalid"><code>${escapeHtml(segment.source)}</code></pre>`,
        "",
      ].join("\n");
    case "block": {
      const tag = TAGS[segment.kind];
      const answered = options.answered?.get(segment.index);
      return `<${tag}${attr("data-json", JSON.stringify(segment.data))}${attr("doc", options.display)}${attr("block", String(segment.index))}${answered ? attr("data-answered", JSON.stringify(answered)) : ""}></${tag}>\n`;
    }
  }
}

/** A document's body HTML: every Markdown segment rendered, every block as its element. */
export function renderBody(markdown: string, options: RenderOptions): string {
  return parse(markdown)
    .map((segment) => renderSegment(segment, options))
    .join("");
}

/** Chinese text sets the page's language, which the elements' words follow. */
export const langOf = (source: string): string | undefined => (/[\u3400-\u9fff]/.test(source) ? "zh-Hant" : undefined);

export interface PageOptions {
  title: string;
  lang?: string | undefined;
  /** `<token>` path prefix of the page server. */
  prefix: string;
  /** Extra markup placed before the scripts. */
  body: string;
  bodyClass?: string;
  scripts: string[];
}

/** The shell of every page the server renders: stylesheet and scripts are same-origin files, so the CSP needs no inline script. */
export function pageShell(options: PageOptions): string {
  const lang = options.lang ? ` lang="${escapeHtml(options.lang)}"` : "";
  return [
    "<!doctype html>",
    `<html${lang}>`,
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${escapeHtml(options.title)}</title>`,
    `<link rel="stylesheet" href="${options.prefix}/assets/page.css">`,
    options.bodyClass ? `<body class="${escapeHtml(options.bodyClass)}">` : "<body>",
    options.body,
    ...options.scripts.map((name) => `<script src="${options.prefix}/assets/${name}"></script>`),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
