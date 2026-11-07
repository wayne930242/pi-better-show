import { DEFAULTS, type DiagramColors, renderMermaidASCII, renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { displayWidth } from "../core/index.ts";

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

const SCHEMES: Record<"light" | "dark", DiagramColors> = {
  light: THEMES["zinc-light"] ?? DEFAULTS,
  dark: THEMES["zinc-dark"] ?? DEFAULTS,
};

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
  });
  // The library imports a web font; hosts serve diagrams from their own origin, and a CSP may forbid more.
  return svg.replace(/@import\s+url\([^)]*\)\s*;?/g, "");
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
