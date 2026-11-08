/**
 * Run by lazy.test.ts in a fresh bun process: records every module specifier that src/ imports, and reports the
 * list after the entry loads, after the extension installs, and after the first show_doc call.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plugin } from "bun";

const SRC = process.argv[2] as string;
const seen: string[] = [];
plugin({
  name: "record-imports",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.importer.startsWith(SRC)) seen.push(args.path);
      return undefined;
    });
  },
});

const report = (stage: string): void => void console.log(JSON.stringify({ stage, seen: [...seen] }));

const { install } = await import(join(SRC, "extension/index.ts"));
const { defaultDeps } = await import(join(SRC, "extension/controller.ts"));
report("loaded");

const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>();
const tools: { execute: (...args: unknown[]) => Promise<unknown> }[] = [];
const pi = {
  registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
  on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    return () => {};
  },
  sendMessage: () => {},
  events: { emit: () => {}, on: () => () => {} },
};
const show = install(pi, { ...defaultDeps(), openUrl: () => {} });
report("installed");

const root = mkdtempSync(join(tmpdir(), "pbs-lazy-"));
writeFileSync(join(root, "a.md"), "# A\n\n```mermaid\nflowchart LR\n A --> B\n```\n");
const ctx = { cwd: root, hasUI: false, isIdle: () => true, ui: { notify: () => {} } };
await tools[0]?.execute("call", { paths: ["a.md"], reason: "r", view: "page" }, undefined, undefined, ctx);
report("shown");
show.shutdown();
process.exit(0);
