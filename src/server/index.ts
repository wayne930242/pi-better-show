import { type DiagramColors, renderMermaidASCII, renderMermaidSVG } from "beautiful-mermaid";
import { displayWidth } from "../core/index.ts";
import { describeDiagram, langOf } from "../elements/diagram-alt.ts";
import { STRINGS } from "../elements/strings.ts";

/** Node side of pi-better-show: Mermaid diagrams drawn as SVG for the web and as Unicode text for chat. */

export type { DiagramColors };

export type DiagramScheme = "light" | "dark" | DiagramColors;

export interface SvgOptions {
  /** `light`, `dark`, or colours (`bg`, `fg`, and optionally `line`, `accent`, `muted`, `surface`, `border`). Default `light`. */
  scheme?: DiagramScheme;
  /** A font family name; default `system-ui`. The diagram never loads a web font. */
  font?: string;
  /** Leave the background out so the page shows through; default false. */
  transparent?: boolean;
}

/** The default element tokens (`--pbs-*` in elements/styles.ts), so a diagram matches the panel around it. */
const SCHEMES: Record<"light" | "dark", DiagramColors> = {
  light: {
    bg: "#ffffff",
    fg: "#1f2328",
    accent: "#0969da",
    muted: "#59636e",
    surface: "#f6f8fa",
    border: "#d1d9e0",
  },
  dark: {
    bg: "#151b23",
    fg: "#e6edf3",
    accent: "#4493f8",
    muted: "#9ba3ad",
    surface: "#1d252f",
    border: "#3d444d",
  },
};

const PADDING = 20;
const CJK_FONTS = "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei'";
const escapeXml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Columns a text diagram may take unless the caller says otherwise; matches core's `toText` default. */
export const DEFAULT_DIAGRAM_WIDTH = 60;

/**
 * A Mermaid diagram as a self-contained SVG string, in the colours of `scheme`. An image URL cannot read
 * the host page's CSS, so give real colours (hex), not `var(--...)`. The result has no `@import` and no
 * `<script>`; it throws when the source is not a diagram beautiful-mermaid can draw.
 */
export function mermaidSvg(source: string, options: SvgOptions = {}): string {
  const scheme = options.scheme ?? "light";
  const colors = typeof scheme === "string" ? SCHEMES[scheme] : scheme;
  const svg = renderMermaidSVG(source, {
    ...colors,
    font: options.font ?? "system-ui",
    transparent: options.transparent ?? false,
    padding: PADDING,
  });
  // The library imports a web font; hosts serve diagrams from their own origin, and a CSP may forbid more.
  let out = svg
    .replace(/@import\s+url\([^)]*\)\s*;?/g, "")
    // The `font` option takes one quoted family, so the Traditional Chinese faces are added after the fact.
    .replace(
      /font-family:\s*[^;}]*;/,
      (rule) => `${rule.slice(0, -1).replace(/,\s*sans-serif$/, "")}, ${CJK_FONTS}, sans-serif;`,
    );
  const han = langOf(source) !== undefined;
  const { title, desc } = describeDiagram(source, STRINGS[han ? "zh-Hant" : "en"]);
  const notes = `\n<title>${escapeXml(title)}</title>${desc ? `\n<desc>${escapeXml(desc)}</desc>` : ""}`;
  out = out.replace(
    /^<svg ([^>]*)>/,
    (_, attributes: string) => `<svg ${han ? 'xml:lang="zh-Hant" ' : ""}${attributes} role="img">${notes}`,
  );
  return out;
}

/** The widest a drawing may be before a 52rem page shrinks its text too small to read. */
const WIDE = 900;

/**
 * Advice on a diagram that will be hard to read: too many nodes, edges, lifelines or entities for its type, or a
 * drawing so wide that the page shrinks it. Each note is one sentence for the author. Advice only: the diagram still
 * draws, and a source that does not draw has no notes.
 */
export function diagramNotes(source: string): string[] {
  try {
    return svgNotes(mermaidSvg(source));
  } catch {
    return [];
  }
}

/** `diagramNotes` for a drawing already made by `mermaidSvg`, so a host that has the SVG need not draw again. */
export function svgNotes(svg: string): string[] {
  const count = (pattern: RegExp): number => svg.match(pattern)?.length ?? 0;
  const notes: string[] = [];
  const over = (n: number, limit: number, thing: string) => {
    if (n > limit)
      notes.push(
        `the diagram has ${n} ${thing} (more than ${limit} is hard to read); split it into an overview and detail diagrams`,
      );
  };
  over(count(/<g class="node"/g), 9, "nodes");
  over(count(/class="edge"/g), 12, "edges");
  over(count(/class="actor"/g), 5, "lifelines");
  over(count(/class="entity"/g), 8, "entities");
  over(count(/class="class-node"/g), 8, "classes");
  const width = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
  if (width > WIDE) {
    notes.push(
      `the diagram is ${Math.round(width)}px wide, too wide for the page; shorten the labels, use TD, or split it`,
    );
  }
  return notes;
}

/**
 * A Mermaid diagram as Unicode box drawing, or undefined when it cannot be shown right: the source is not a
 * diagram, a line is wider than `width` columns, or it holds wide (CJK, emoji) characters, which the drawing
 * sizes by character and so misaligns. Callers then fall back to the source. This is core's `toText` `mermaid` hook.
 */
export function mermaidText(source: string, width: number = DEFAULT_DIAGRAM_WIDTH): string | undefined {
  let drawn: string;
  try {
    drawn = renderMermaidASCII(source, { colorMode: "none" });
  } catch {
    return undefined;
  }
  const lines = drawn.split("\n").map((line) => line.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  if (lines.length === 0) return undefined;
  // Wide characters take two cells but one code point, so any line where the two differ is drawn misaligned.
  if (lines.some((line) => displayWidth(line) !== [...line].length)) return undefined;
  if (lines.some((line) => displayWidth(line) > width)) return undefined;
  return lines.join("\n");
}
