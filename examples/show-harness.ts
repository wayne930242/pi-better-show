import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBetterShow, createPageServer, defaultDeps } from "../src/extension/index.ts";

/**
 * Runs the `show_doc` machinery without pi, for looking at it in a browser: the page server on the files you name
 * (default: the demo pages), a fake pi that prints every message the agent would receive, and no browser opened
 * for you (the URLs are printed). Loopback only; stop it with Ctrl+C.
 *
 *   bun examples/show-harness.ts [files...]
 *   CAPTURE=/tmp/messages.jsonl   also append each message to a file
 *   URLS=/tmp/urls.txt            also write the page URLs (one per line) to a file
 */

const here = import.meta.dir;
const files = process.argv.slice(2);
const targets = files.length > 0 ? files : ["demo.md", "demo.html", "demo.tsx"].map((name) => join(here, name));
const capture = process.env.CAPTURE;
if (process.env.URLS) writeFileSync(process.env.URLS, "");

const pi = {
  sendMessage: (message: { content: unknown }, options: unknown) => {
    const line = JSON.stringify({ options, content: message.content });
    console.log(`MESSAGE ${line}`);
    if (capture) appendFileSync(capture, `${line}\n`);
  },
  events: {
    emit: (channel: string, data: unknown) => console.log(`EVENT ${channel} ${JSON.stringify(data)}`),
    on: () => () => {},
  },
} as unknown as ExtensionAPI;

const ctx = { cwd: here, hasUI: false, isIdle: () => true, ui: { notify: () => {} } } as unknown as ExtensionContext;

const show = createBetterShow(pi, {
  ...defaultDeps(),
  // Time to look around before the idle shutdown a real session has (30 s without an open tab).
  servePages: (options) => createPageServer({ ...options, idleMs: 10 * 60_000 }),
  openUrl: (url) => {
    console.log(`OPEN ${url}`);
    if (process.env.URLS) appendFileSync(process.env.URLS, `${url}\n`);
  },
});
show.setContext(ctx);
const result = await show.show(here, targets, "Harness", "page");
console.log(result.text);
console.log(`show harness pid ${process.pid}, port ${new URL(show.server?.base ?? "http://none:0").port}`);
// The page server is unref'd (it never keeps pi alive); a harness has nothing else to wait on.
setInterval(() => {}, 1 << 30);
