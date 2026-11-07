import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Answer } from "../core/types.ts";
import { mermaidSvg } from "../server/index.ts";
import { asset } from "./assets.ts";
import { parseAnswer } from "./contract.ts";
import { contentType, HTML_FILE, MARKDOWN_FILE, REACT_FILE } from "./files.ts";
import { bundleReactPage, reactShell } from "./react-page.ts";
import { escapeHtml, langOf, pageShell, renderBody } from "./render.ts";

/** How long the page server waits with no page open before it reports idle: a reload reconnects well within it, a browser's cold start too. */
export const PAGE_IDLE_MS = 30_000;
/** The largest answer the page server reads. */
export const MAX_ANSWER_BYTES = 1_000_000;
/** The longest Mermaid source the diagram route draws: it travels in the image URL, which node limits to 16 KB. */
const MAX_DIAGRAM_SOURCE = 6000;

/** Rendered pages and the host page: scripts and styles only from the server itself, no inline script or style. */
export const PAGE_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'";
/**
 * An agent's own page, in a sandbox without `allow-same-origin` (the CSP `sandbox` makes that hold even if the page
 * is opened outside the host's frame). It may run its own inline and same-server scripts, but loads nothing from
 * elsewhere, and its forms cannot navigate: they answer through the host page.
 */
export const FRAME_POLICY =
  "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; form-action 'none'";
/** Everything else the server hands out (images, other files, Markdown text): never a document that runs. */
export const RAW_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

export interface AnswerPost {
  answerId: string;
  answer: Answer;
  /** The real path of the page that sent it, when it names one. */
  page: string | undefined;
}

export interface AnswerReply {
  accepted: boolean;
  reason?: string;
}

export interface PageServerOptions {
  /** Whether a real path may be served (see `createAllowList`). */
  canServe: (path: string) => boolean;
  /** The real path of the document a capability id names. */
  pathOfDoc: (id: string) => string | undefined;
  /** The name a page's blocks carry in their answers' `ref.doc`. */
  displayOf?: (path: string) => string;
  onAnswer: (post: AnswerPost) => AnswerReply;
  /** Runs once no page has held an event stream for `idleMs`; the caller is expected to close the server. */
  onIdle?: () => void;
  idleMs?: number;
}

export interface PageServer {
  /** `http://127.0.0.1:<port>/<token>`. */
  base: string;
  /** The URL a browser opens to show the document at real path `path`. */
  urlOf: (path: string) => string;
  /** The URL another viewer fetches the document by, named by its id. */
  capabilityOf: (id: string, path: string) => string;
  /** The directory URL a document's relative references resolve against. */
  assetsOf: (id: string) => string;
  /** Tells every open copy of the page at real path `path` to reload. */
  reload: (path: string) => void;
  /** Reloads the pages whose framed prototype changed since it was served. */
  refreshFrames: () => void;
  /** Whether a page at real path `path` holds the event stream now. */
  isOpen: (path: string) => boolean;
  /** Restarts the idle wait while no page is open, so a page about to open gets all of it. */
  touch: () => void;
  close: () => void;
}

const FRAME_HOOK = (prefix: string): string => `<script src="${prefix}/assets/frame.js"></script>`;

/** Puts the frame hook first in the page, where the page's own scripts can already use it. */
export function injectFrameHook(html: string, prefix: string): string {
  const hook = FRAME_HOOK(prefix);
  for (const pattern of [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /^\s*<!doctype[^>]*>/i]) {
    const found = pattern.exec(html);
    if (found)
      return `${html.slice(0, found.index + found[0].length)}${hook}${html.slice(found.index + found[0].length)}`;
  }
  return `${hook}${html}`;
}

/** Even a status with no body, or JSON, carries a policy, so a browser that renders it can run nothing from it. */
const finish = (response: ServerResponse, status: number) => {
  response.statusCode = status;
  response.setHeader("content-security-policy", RAW_POLICY);
  response.end();
};

const titleOf = (markdown: string, fallback: string): string =>
  /^#\s+(.+?)\s*#*\s*$/m.exec(markdown)?.[1]?.replace(/[*_`]/g, "") ?? fallback;

export function createPageServer(options: PageServerOptions): Promise<PageServer> {
  const idleMs = options.idleMs ?? PAGE_IDLE_MS;
  const prefix = `/${randomUUID()}`;
  const filesPrefix = `${prefix}/files`;
  const framePrefix = `${prefix}/frame`;
  const docPrefix = `${prefix}/doc/`;
  /** Open event streams by the real path of the page that opened them. */
  const streams = new Map<string, Set<ServerResponse>>();
  /** Prototypes served to a page's frame: the file's modification time then, and the pages that framed it. */
  const frames = new Map<string, { served: number; parents: Set<string> }>();
  /** What was sent for a pick or chip, by page and block, so a reload shows it. */
  const answered = new Map<string, Map<number, [string, string][]>>();
  let openStreams = 0;
  let idleTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  let base = "";
  let port = 0;

  const stopIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  const startIdle = () => {
    if (!options.onIdle || stopped || openStreams > 0) return;
    stopIdle();
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      if (!stopped && openStreams === 0) options.onIdle?.();
    }, idleMs);
    idleTimer.unref();
  };
  const modified = (path: string): number => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return 0;
    }
  };

  /** The absolute path in the part of a URL path after `route`, or undefined. */
  const pathAfter = (urlPath: string, route: string): string | undefined => {
    if (!urlPath.startsWith(`${route}/`)) return undefined;
    try {
      return fileURLToPath(`file://${urlPath.slice(route.length)}`);
    } catch {
      return undefined;
    }
  };
  /** The real path of a file that may be served, with its content. */
  const read = (requested: string): { path: string; content: Buffer } | undefined => {
    try {
      // The real path is what is checked and read, so a symlink cannot lead outside what is allowed.
      const path = realpathSync(requested);
      return options.canServe(path) ? { path, content: readFileSync(path) } : undefined;
    } catch {
      return undefined;
    }
  };
  const realOrSame = (path: string): string => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  };

  const body = (request: IncomingMessage, response: ServerResponse, then: (text: string) => void) => {
    if (Number(request.headers["content-length"] ?? 0) > MAX_ANSWER_BYTES) {
      response.writeHead(413, { connection: "close", "content-security-policy": RAW_POLICY });
      response.end();
      return;
    }
    let text = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      text += chunk;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_ANSWER_BYTES) {
        response.writeHead(413, { connection: "close", "content-security-policy": RAW_POLICY });
        response.end();
        request.destroy();
      }
    });
    request.on("end", () => {
      if (bytes > MAX_ANSWER_BYTES) return;
      // This runs outside `handle`'s catch: a throw here would be an uncaught exception in pi.
      try {
        then(text);
      } catch {
        if (!response.headersSent) json(response, 500, { accepted: false, reason: "error" });
        else response.end();
      }
    });
  };

  const json = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, {
      "content-type": "application/json",
      "content-security-policy": RAW_POLICY,
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(value));
  };

  /**
   * Whether the request came from the host page itself. A sandboxed frame has an opaque origin and can still send a
   * no-cors POST (text/plain) or open a stream, so these routes check where the request came from, not just who knows the token.
   */
  const fromHostPage = (request: IncomingMessage): boolean => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && origin !== "")
      return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
    return request.headers["sec-fetch-site"] === "same-origin";
  };

  const postAnswer = (request: IncomingMessage, response: ServerResponse): void => {
    const type = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (!fromHostPage(request) || type !== "application/json") return finish(response, 403);
    body(request, response, (text) => {
      let parsed: { answerId?: unknown; answer?: unknown; page?: unknown };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        return json(response, 400, { accepted: false, reason: "invalid" });
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return json(response, 400, { accepted: false, reason: "invalid" });
      }
      const answer = parseAnswer(parsed.answer);
      if (typeof parsed.answerId !== "string" || !parsed.answerId || !answer) {
        return json(response, 400, { accepted: false, reason: "invalid" });
      }
      const pagePath = typeof parsed.page === "string" ? pathAfter(parsed.page, filesPrefix) : undefined;
      const page = pagePath ? realOrSame(pagePath) : undefined;
      // The page names its own blocks; the server names the document, so a page cannot answer as another.
      const shown = page && options.displayOf ? options.displayOf(page) : undefined;
      if (shown !== undefined && answer.ref) answer.ref = { ...answer.ref, doc: shown };
      const reply = options.onAnswer({ answerId: parsed.answerId, answer, page });
      const block = answer.ref?.block;
      if (reply.accepted && page && block !== undefined && (answer.kind === "pick" || answer.kind === "suggest")) {
        answered.set(page, (answered.get(page) ?? new Map()).set(block, answer.fields));
      }
      json(response, 200, reply);
    });
  };

  const sendEvents = (url: URL, request: IncomingMessage, response: ServerResponse) => {
    if (request.headers["sec-fetch-site"] !== "same-origin") return finish(response, 403);
    const asked = pathAfter(url.searchParams.get("page") ?? "", filesPrefix);
    if (!asked) return finish(response, 400);
    // Keyed by real path, as the files are served and reloaded, so a symlinked path still reloads.
    const page = realOrSame(asked);
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "content-security-policy": RAW_POLICY,
      "cache-control": "no-store",
    });
    response.write(": open\n\n");
    const open = streams.get(page) ?? new Set();
    streams.set(page, open.add(response));
    openStreams++;
    stopIdle();
    response.on("close", () => {
      open.delete(response);
      openStreams--;
      startIdle();
    });
  };

  const sendDiagram = (url: URL, response: ServerResponse) => {
    const source = url.searchParams.get("source") ?? "";
    const scheme = url.searchParams.get("scheme") === "dark" ? "dark" : "light";
    if (!source || source.length > MAX_DIAGRAM_SOURCE) return finish(response, 400);
    try {
      const svg = mermaidSvg(source, { scheme, transparent: true });
      response.writeHead(200, {
        "content-type": "image/svg+xml",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "cache-control": "no-store",
      });
      response.end(svg);
    } catch (error) {
      response.writeHead(422, { "content-type": "text/plain; charset=utf-8", "content-security-policy": RAW_POLICY });
      response.end(error instanceof Error ? error.message : String(error));
    }
  };

  const send = (response: ServerResponse, type: string, policy: string, content: string | Buffer) => {
    response.writeHead(200, {
      "content-type": type,
      "content-security-policy": policy,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(content);
  };

  /** A file as a frame loads it: an HTML page with the hook, a TSX page as its shell or bundle, anything else as it is. */
  const sendFrameFile = (
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
    file: { path: string; content: Buffer },
  ) => {
    const { path, content } = file;
    if (REACT_FILE.test(path)) {
      if (!url.searchParams.has("bundle")) {
        return send(
          response,
          "text/html; charset=utf-8",
          FRAME_POLICY,
          reactShell(path, prefix, content.toString("utf8")),
        );
      }
      void bundleReactPage(path, options.canServe).then((script) =>
        send(response, "text/javascript; charset=utf-8", FRAME_POLICY, script),
      );
      return;
    }
    if (HTML_FILE.test(path)) {
      const referer = (() => {
        try {
          return new URL(request.headers.referer ?? "").pathname;
        } catch {
          return "";
        }
      })();
      const parent = pathAfter(referer, filesPrefix);
      if (parent) {
        const known = frames.get(path) ?? { served: 0, parents: new Set<string>() };
        known.served = modified(path);
        known.parents.add(realOrSame(parent));
        frames.set(path, known);
      }
      return send(
        response,
        "text/html; charset=utf-8",
        FRAME_POLICY,
        injectFrameHook(content.toString("utf8"), prefix),
      );
    }
    send(response, contentType(path), RAW_POLICY, content);
  };

  /** A document as the user opens it: Markdown rendered, an HTML or TSX page inside its sandboxed frame, anything else raw. */
  const sendPage = (url: URL, response: ServerResponse, file: { path: string; content: Buffer }) => {
    const { path, content } = file;
    if (MARKDOWN_FILE.test(path)) {
      const source = content.toString("utf8");
      const display = options.displayOf?.(path) ?? basename(path);
      const html = pageShell({
        title: titleOf(source, basename(path)),
        lang: langOf(source),
        prefix,
        body: `<main>\n${renderBody(source, { display, answered: answered.get(path) ?? new Map() })}</main>`,
        scripts: ["page.js"],
      });
      return send(response, "text/html; charset=utf-8", PAGE_POLICY, html);
    }
    if (HTML_FILE.test(path) || REACT_FILE.test(path)) {
      const frame = `${framePrefix}${url.pathname.slice(filesPrefix.length)}`;
      const html = pageShell({
        title: basename(path),
        lang: langOf(content.toString("utf8")),
        prefix,
        body: `<iframe class="pbs-frame" title="${escapeHtml(basename(path))}" src="${escapeHtml(frame)}" sandbox="allow-scripts allow-forms"></iframe>`,
        scripts: ["host.js"],
        bodyClass: "pbs-host",
      });
      return send(response, "text/html; charset=utf-8", PAGE_POLICY, html);
    }
    send(response, contentType(path), RAW_POLICY, content);
  };

  const sendCapability = (url: URL, request: IncomingMessage, response: ServerResponse) => {
    const rest = url.pathname.slice(docPrefix.length);
    const slash = rest.indexOf("/");
    const root = options.pathOfDoc(slash < 0 ? rest : rest.slice(0, slash));
    if (!root || slash < 0) return finish(response, 404);
    let relative: string;
    try {
      relative = decodeURIComponent(rest.slice(slash + 1));
    } catch {
      return finish(response, 404);
    }
    if (!relative || relative.includes("\0")) return finish(response, 404);
    const file = read(resolve(dirname(root), relative));
    if (!file) return finish(response, 404);
    // Markdown goes out as text for the viewer to render; an HTML page loads as it does in the local frame.
    if (MARKDOWN_FILE.test(file.path)) return send(response, "text/plain; charset=utf-8", RAW_POLICY, file.content);
    sendFrameFile(url, request, response, file);
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    // A page that names another host (DNS rebinding) reaches nothing.
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return finish(response, 403);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === `${prefix}/answer`)
      return request.method === "POST" ? postAnswer(request, response) : finish(response, 405);
    if (request.method !== "GET") return finish(response, 405);
    if (url.pathname === `${prefix}/events`) return sendEvents(url, request, response);
    if (url.pathname === `${prefix}/diagram.svg`) return sendDiagram(url, response);
    if (url.pathname.startsWith(`${prefix}/assets/`)) {
      const found = await asset(url.pathname.slice(`${prefix}/assets/`.length));
      if (!found) return finish(response, 404);
      return send(response, found.type, "default-src 'none'", found.body);
    }
    if (url.pathname.startsWith(docPrefix)) return sendCapability(url, request, response);
    const route = url.pathname.startsWith(`${filesPrefix}/`)
      ? filesPrefix
      : url.pathname.startsWith(`${framePrefix}/`)
        ? framePrefix
        : undefined;
    const requested = route ? pathAfter(url.pathname, route) : undefined;
    const file = requested ? read(requested) : undefined;
    if (!route || !file) return finish(response, 404);
    return route === filesPrefix ? sendPage(url, response, file) : sendFrameFile(url, request, response, file);
  };

  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) finish(response, 500);
      else response.end();
    });
  });
  server.unref();
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      base = `http://127.0.0.1:${port}${prefix}`;
      // A server no page ever reaches goes idle as well.
      startIdle();
      const reload = (path: string) => {
        for (const stream of streams.get(path) ?? []) stream.write("event: reload\ndata:\n\n");
      };
      done({
        base,
        urlOf: (path) => `${base}/files${pathToFileURL(path).pathname}`,
        capabilityOf: (id, path) => `${base}/doc/${id}/${encodeURIComponent(basename(path))}`,
        assetsOf: (id) => `${base}/doc/${id}/`,
        reload,
        refreshFrames: () => {
          for (const [path, known] of frames) {
            const now = modified(path);
            if (now === known.served) continue;
            known.served = now;
            for (const parent of known.parents) reload(parent);
          }
        },
        isOpen: (path) => (streams.get(path)?.size ?? 0) > 0,
        touch: startIdle,
        close: () => {
          stopped = true;
          stopIdle();
          for (const open of streams.values()) for (const stream of open) stream.end();
          streams.clear();
          frames.clear();
          answered.clear();
          server.close();
          server.closeAllConnections();
        },
      });
    });
  });
}
