import { dirname, extname, isAbsolute, relative, sep } from "node:path";

export const MARKDOWN_FILE = /\.(md|markdown)$/i;
export const HTML_FILE = /\.html?$/i;
export const REACT_FILE = /\.(tsx|jsx)$/i;
/** Images open in a tab of their own; an editor would show their bytes. */
export const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".markdown": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export const contentType = (path: string): string =>
  CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

/**
 * The files the page server may serve: those below the directory of a document that was shown, and nothing
 * whose name below it starts with a dot (`.env`, `.git`, `.ssh`). The check runs on real paths.
 */
export function createAllowList() {
  const pages = new Set<string>();
  return {
    add: (page: string): void => void pages.add(page),
    clear: (): void => pages.clear(),
    canServe: (path: string): boolean =>
      [...pages].some((page) => {
        const inside = relative(dirname(page), path);
        return inside !== "" && !isAbsolute(inside) && inside.split(sep).every((part) => !part.startsWith("."));
      }),
  };
}

export type AllowList = ReturnType<typeof createAllowList>;
