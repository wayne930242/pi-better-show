import type { Answer } from "../../core/types.ts";
import { configure } from "../../elements/index.ts";

/** The page server's path prefix (`/<token>`): the first segment of every page it serves. */
export const serverPrefix = (): string => `/${location.pathname.split("/")[1] ?? ""}`;

/** Longest Mermaid source that fits in an image URL. */
const MAX_DIAGRAM_URL_SOURCE = 6000;
const RASTER_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;

/**
 * Tells the elements where this server's diagrams, images, and prototypes are. A reference resolves against the
 * page's own URL and is used only when it lands on a file the server serves: anything else (another site, a path
 * above the document) shows the element's placeholder.
 */
export function configureElements(prefix = serverPrefix()): void {
  const files = `${prefix}/files/`;
  const frames = `${prefix}/frame/`;
  const resolve = (ref: string): URL | undefined => {
    try {
      const url = new URL(ref, location.href);
      const served = url.pathname.startsWith(files) || url.pathname.startsWith(frames);
      return url.origin === location.origin && served ? url : undefined;
    } catch {
      return undefined;
    }
  };
  configure({
    diagramUrl: (source, scheme) =>
      source.length > MAX_DIAGRAM_URL_SOURCE
        ? undefined
        : `${prefix}/diagram.svg?scheme=${scheme}&source=${encodeURIComponent(source)}`,
    imageUrl: (ref) => (RASTER_DATA_URL.test(ref) ? ref : resolve(ref)?.href),
    pageUrl: (ref) => {
      const url = resolve(ref);
      return url
        ? `${frames}${url.pathname.slice(url.pathname.startsWith(files) ? files.length : frames.length)}`
        : undefined;
    },
  });
}

export interface AnswerReply {
  accepted: boolean;
  reason?: string;
}

export interface AnswerBody {
  answerId: string;
  answer: Answer;
  /** The path of the page the answer comes from. */
  page: string;
}

/** Delivers one answer to the page server, and tells whether it was taken. */
export type PostAnswer = (url: string, body: AnswerBody) => Promise<AnswerReply>;

export const postAnswerToServer: PostAnswer = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ accepted: false, reason: `HTTP ${response.status}` }))) as AnswerReply;
};

/** A random id for one answer, so a repeated send is delivered once. */
export const newAnswerId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
