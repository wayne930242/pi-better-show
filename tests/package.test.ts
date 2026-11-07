import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sources = (dir: string) =>
  readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file: join(dir, file), text: read(join(dir, file)) }));

/** Every module specifier a source imports or re-exports. */
const specifiers = (text: string): string[] =>
  [
    ...text.matchAll(
      /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map((match) => (match[1] ?? match[2] ?? match[3]) as string);

describe("core is isomorphic", () => {
  const core = sources("src/core");

  test("imports only its own files and yaml: no node: modules, no other packages", () => {
    expect(core.length).toBeGreaterThan(5);
    for (const { file, text } of core) {
      for (const specifier of specifiers(text)) {
        const allowed = specifier === "yaml" || (specifier.startsWith("./") && specifier.endsWith(".ts"));
        if (!allowed) throw new Error(`${file} imports ${specifier}`);
      }
    }
  });

  test("touches no node or DOM global", () => {
    const banned =
      /\b(process|Buffer|require|__dirname|__filename|document|window|navigator|localStorage|innerHTML|fetch|setTimeout)\b/;
    for (const { file, text } of core) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const found = banned.exec(code);
      if (found) throw new Error(`${file} uses ${found[0]}`);
    }
  });

  test("the import scan sees what it should", () => {
    expect(
      specifiers('import { a } from "node:fs";\nexport * from "./x.ts";\nimport "side";\nconst m = import("dyn");'),
    ).toEqual(["node:fs", "./x.ts", "side", "dyn"]);
  });
});

describe("package", () => {
  const pkg = JSON.parse(read("package.json"));

  test("exports `.` and `./server`, both TypeScript source", () => {
    expect(pkg.exports).toEqual({ ".": "./src/core/index.ts", "./server": "./src/server/index.ts" });
    for (const target of Object.values(pkg.exports) as string[]) expect(read(target)).toContain("export");
  });

  test("core depends on yaml only; the server adds beautiful-mermaid", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["beautiful-mermaid", "yaml"]);
    for (const { file, text } of sources("src/server")) {
      for (const specifier of specifiers(text)) {
        const allowed =
          ["beautiful-mermaid", "yaml"].includes(specifier) ||
          specifier.startsWith("../core/") ||
          specifier.startsWith("./");
        if (!allowed) throw new Error(`${file} imports ${specifier}`);
      }
    }
  });

  test("source loads under node's type stripping, so a bundler-free host can import it", () => {
    for (const entry of ["src/core/index.ts", "src/server/index.ts"]) {
      const run = Bun.spawnSync(
        [
          "node",
          "--input-type=module",
          "-e",
          `const m = await import(${JSON.stringify(join(root, entry))}); console.log(Object.keys(m).length)`,
        ],
        {
          cwd: root,
        },
      );
      expect(run.stderr.toString()).not.toContain("Error");
      expect(run.exitCode).toBe(0);
      expect(Number(run.stdout.toString())).toBeGreaterThan(0);
    }
  });
});
