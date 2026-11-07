import { afterEach } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BetterShow, type Deps, defaultDeps } from "../../src/extension/controller.ts";
import { install } from "../../src/extension/index.ts";
import { fakeContext, fakePi, tree } from "./helpers.ts";

export const shows: BetterShow[] = [];
afterEach(() => {
  for (const show of shows.splice(0)) show.shutdown();
});

export interface Options {
  files?: Record<string, string>;
  editor?: string;
  installed?: string[];
  platform?: string;
  idleMs?: number;
}

export function setup(options: Options = {}) {
  const root = tree(
    options.files ?? { "a.md": "# A\n\n```options\n- {title: One}\n- {title: Two}\n```\n", "p.html": "<p>hi</p>" },
  );
  const state = { idle: true, now: 0 };
  const opened: string[] = [];
  const launched: [string, string[]][] = [];
  const ran: [string, string[]][] = [];
  const watchers = new Map<string, () => void>();
  const installed = options.installed ?? [];
  let ids = 0;
  const base = defaultDeps();
  const deps: Deps = {
    ...base,
    editor: options.editor,
    platform: options.platform ?? "darwin",
    onPath: (command) => installed.includes(command),
    launch: async (command, args) => void launched.push([command, args]),
    run: (command, args) => {
      if (command === "diff") return base.run(command, args);
      ran.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    },
    watch: (path, onChange) => {
      watchers.set(path, onChange);
      return () => watchers.delete(path);
    },
    openUrl: (url) => void opened.push(url),
    servePages: (serverOptions) => base.servePages({ ...serverOptions, idleMs: options.idleMs ?? 60_000 }),
    newId: () => `doc-${++ids}`,
    now: () => state.now,
  };
  const { pi, sent, emitted, on, bus, tools, fire } = fakePi();
  const show = install(pi, deps);
  shows.push(show);
  const { ctx, notices } = fakeContext(root, state);
  show.setContext(ctx);
  const save = (name: string, content: string) => {
    writeFileSync(join(root, name), content);
    watchers.get(join(root, name))?.();
  };
  return {
    root,
    show,
    tools,
    fire,
    state,
    opened,
    launched,
    ran,
    watchers,
    sent,
    emitted,
    on,
    bus,
    notices,
    save,
    path: (name: string) => join(root, name),
  };
}
