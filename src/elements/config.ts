import type { Locale, Strings } from "./strings.ts";

/** Which colour scheme a diagram is drawn for. */
export type Scheme = "light" | "dark";

export interface Configuration {
  /** Overrides for single words, per locale. */
  strings: Partial<Record<Locale, Partial<Strings>>>;
  /** The image URL of a diagram, which the host serves (`mermaidSvg` from `pi-better-show/server`); `undefined` shows the source. */
  diagramUrl: ((source: string, scheme: Scheme) => string | undefined) | undefined;
  /** Turns a review item's `image` into a URL the page may load; `undefined` shows a placeholder. */
  imageUrl: (ref: string) => string | undefined;
  /** Turns a review item's `page` into a URL for a sandboxed frame; `undefined` shows the reference as text. */
  pageUrl: ((ref: string) => string | undefined) | undefined;
}

/** An image reference is shown only when it is an http(s) URL or a raster data URL, unless the host resolves it. */
const SAFE_IMAGE = /^(?:https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;
const defaultImageUrl = (ref: string): string | undefined => (SAFE_IMAGE.test(ref) ? ref : undefined);

let current: Configuration = initial();
const listeners = new Set<() => void>();

function initial(): Configuration {
  return { strings: {}, diagramUrl: undefined, imageUrl: defaultImageUrl, pageUrl: undefined };
}

export const configuration = (): Configuration => current;

/** Elements ask to be redrawn when the configuration changes. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sets the host hooks and words. Each key given replaces the earlier value (`strings` merges per locale and key);
 * a key left out is unchanged. Elements already on the page redraw.
 */
export function configure(options: Partial<Configuration>): void {
  const strings = { ...current.strings };
  for (const locale of Object.keys(options.strings ?? {}) as Locale[]) {
    strings[locale] = { ...strings[locale], ...options.strings?.[locale] };
  }
  current = {
    strings,
    diagramUrl: "diagramUrl" in options ? options.diagramUrl : current.diagramUrl,
    imageUrl: "imageUrl" in options ? (options.imageUrl ?? defaultImageUrl) : current.imageUrl,
    pageUrl: "pageUrl" in options ? options.pageUrl : current.pageUrl,
  };
  for (const listener of listeners) listener();
}

/** Restores the defaults (no overrides, no hooks, the default image rule) and redraws; for tests and for hosts that swap configurations. */
export function resetConfiguration(): void {
  current = initial();
  for (const listener of listeners) listener();
}
