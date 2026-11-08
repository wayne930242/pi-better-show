import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./fixture.ts";

const SRC = join(import.meta.dir, "../../src");

/**
 * What the page server, the renderers, and the bundler pull in. Loading the extension must not touch any of it.
 * Bun's resolve hook sees relative imports and not bare package names, so the packages (markdown-it, beautiful-mermaid,
 * esbuild, yaml, react-dom) are caught through the files that import them: render.ts, server/index.ts, assets.ts, react-page.ts, parse.ts.
 */
const HEAVY =
  /(^|\/)(server|react-page|render|assets|parse)\.ts$|(^|\/)server\/index\.ts$|(^|\/)elements\/index\.ts$|^(beautiful-mermaid|markdown-it|esbuild|yaml|pbs-page-react|pbs-page-react-dom)(\/|$)/;

interface Report {
  stage: string;
  seen: string[];
}

async function probe(): Promise<Record<string, string[]>> {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "lazy-probe.ts"), SRC], {
    cwd: tmpdir(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`probe exited ${code}: ${err}`);
  const stages: Record<string, string[]> = {};
  for (const line of out.trim().split("\n")) {
    const report = JSON.parse(line) as Report;
    stages[report.stage] = report.seen.filter((specifier) => HEAVY.test(specifier));
  }
  return stages;
}

describe("the extension loads on demand", () => {
  test("importing and installing it loads no page server, renderer, bundler, or Mermaid; the first show_doc does", async () => {
    const stages = await probe();
    expect(stages.loaded).toEqual([]);
    expect(stages.installed).toEqual([]);
    expect(stages.shown).toEqual(
      expect.arrayContaining(["./server.ts", "./render.ts", "./react-page.ts", "../server/index.ts"]),
    );
  }, 30_000);
});

describe("show_doc and the agent's own writes", () => {
  test("show_doc runs one at a time with the other calls of its turn, so a write issued with it has finished first", () => {
    // pi runs the calls of one assistant message in parallel unless a tool is sequential; show_doc raced a write
    // issued beside it and read the file before it existed ("cannot read").
    const t = setup();
    const tool = t.tools[0] as unknown as { executionMode?: string };
    expect(tool.executionMode).toBe("sequential");
  });
});
