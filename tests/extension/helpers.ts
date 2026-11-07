import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** A plain HTTP request. happy-dom (preloaded for the element tests) replaces `fetch`, so the server tests do not use it. */
export function http(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; chunks?: string[] } = {},
): Promise<Reply> {
  return new Promise((done, fail) => {
    const req = request(url, { method: options.method ?? "GET", headers: options.headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.on("end", () => done({ status: response.statusCode ?? 0, headers: response.headers, body }));
    });
    req.on("error", fail);
    // Chunks go without a declared length, so only the server's own count can stop them.
    for (const chunk of options.chunks ?? []) req.write(chunk);
    req.end(options.body);
  });
}

export const postJson = (url: string, value: unknown): Promise<Reply> =>
  http(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

/** A scratch tree of files (relative path to content), at its real path. */
export function tree(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pbs-ext-")));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

export const link = (root: string, target: string, name: string): void =>
  symlinkSync(join(root, target), join(root, name));

/** Reads an event stream until `text` shows up in it, or the wait ends. */
export function waitForStream(url: string, text: string, trigger: () => void, ms = 3000): Promise<boolean> {
  return new Promise((done) => {
    const req = request(url, (response) => {
      let seen = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        seen += chunk;
        if (seen.includes(text)) {
          req.destroy();
          done(true);
        }
      });
      // The stream is open once its first comment arrives.
      response.once("data", () => trigger());
    });
    req.on("error", () => done(false));
    setTimeout(() => {
      req.destroy();
      done(false);
    }, ms);
    req.end();
  });
}

export interface Sent {
  message: { customType: string; content: string; display: boolean };
  options: { triggerTurn?: boolean; deliverAs?: string } | undefined;
}

/** A pi with only what the extension uses: sent messages and an event bus, both recorded. */
export function fakePi() {
  const sent: Sent[] = [];
  const emitted: { channel: string; data: unknown }[] = [];
  const listeners = new Map<string, ((data: unknown) => void)[]>();
  const tools: { name: string; execute: (...args: unknown[]) => Promise<unknown> }[] = [];
  const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>();
  const pi = {
    registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
    on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return () => {};
    },
    sendMessage: (message: Sent["message"], options: Sent["options"]) => sent.push({ message, options }),
    events: {
      emit: (channel: string, data: unknown) => {
        emitted.push({ channel, data: structuredClone(data) });
        for (const handler of listeners.get(channel) ?? []) handler(data);
      },
      on: (channel: string, handler: (data: unknown) => void) => {
        listeners.set(channel, [...(listeners.get(channel) ?? []), handler]);
        return () =>
          listeners.set(
            channel,
            (listeners.get(channel) ?? []).filter((other) => other !== handler),
          );
      },
    },
  };
  const on = (channel: string) => emitted.filter((event) => event.channel === channel).map((event) => event.data);
  /** Runs the extension's handlers for a pi event, as pi would. */
  const fire = async (name: string, event: unknown, ctx: unknown) => {
    for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
  };
  return { pi: pi as unknown as ExtensionAPI, sent, emitted, on, bus: pi.events, tools, fire };
}

export function fakeContext(cwd: string, state: { idle: boolean }) {
  const notices: [string, string][] = [];
  const ctx = {
    cwd,
    hasUI: true,
    isIdle: () => state.idle,
    ui: { notify: (text: string, level: string) => notices.push([text, level]) },
  };
  return { ctx: ctx as unknown as ExtensionContext, notices };
}
