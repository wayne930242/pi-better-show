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

  test("exports `.`, `./elements`, `./react`, `./server`, and `./extension`, all TypeScript source", () => {
    expect(pkg.exports).toEqual({
      ".": "./src/core/index.ts",
      "./elements": "./src/elements/index.ts",
      "./react": "./src/react/index.ts",
      "./server": "./src/server/index.ts",
      "./extension": "./src/extension/index.ts",
    });
    for (const target of Object.values(pkg.exports) as string[]) expect(read(target)).toContain("export");
  });

  test("core depends on yaml only; the server adds beautiful-mermaid, the extension esbuild, markdown-it, and its own React", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "beautiful-mermaid",
      "esbuild",
      "markdown-it",
      "pbs-page-react",
      "pbs-page-react-dom",
      "yaml",
    ]);
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

  test("React is an optional peer, and only the wrappers import it", () => {
    expect(pkg.peerDependencies.react).toBe(">=19");
    expect(pkg.peerDependenciesMeta.react.optional).toBe(true);
    for (const dir of ["src/core", "src/server", "src/elements"]) {
      for (const { file, text } of sources(dir)) {
        for (const specifier of specifiers(text))
          if (/^react/.test(specifier)) throw new Error(`${file} imports ${specifier}`);
      }
    }
    for (const { file, text } of sources("src/react")) {
      for (const specifier of specifiers(text)) {
        const allowed =
          specifier === "react" || specifier.startsWith("../core/") || specifier.startsWith("../elements/");
        if (!allowed) throw new Error(`${file} imports ${specifier}`);
      }
    }
  });

  test("the pi extension is declared, and pi's own packages are optional peers, never dependencies", () => {
    expect(pkg.pi).toEqual({
      extensions: ["./src/extension/index.ts"],
      image: "https://raw.githubusercontent.com/wayne930242/pi-better-show/main/docs/images/decide.png",
    });
    expect(pkg.keywords).toContain("pi-package");
    for (const host of ["@earendil-works/pi-coding-agent", "typebox"]) {
      expect(pkg.peerDependencies[host]).toBe("*");
      expect(pkg.peerDependenciesMeta[host].optional).toBe(true);
      expect(pkg.dependencies[host]).toBeUndefined();
    }
  });

  test("the extension is the only module that uses node, esbuild, or the page server's packages", () => {
    for (const dir of ["src/core", "src/elements", "src/react"]) {
      for (const { file, text } of sources(dir)) {
        for (const specifier of specifiers(text)) {
          if (/^(esbuild|markdown-it|node:|@earendil-works|typebox)/.test(specifier) && dir !== "src/server")
            throw new Error(`${file} imports ${specifier}`);
        }
      }
    }
  });

  test("source loads under node's type stripping, so a bundler-free host can import it", () => {
    // `./elements` and `./react` load without a DOM too (SSR): they define nothing there.
    for (const entry of [
      "src/core/index.ts",
      "src/server/index.ts",
      "src/elements/index.ts",
      "src/extension/index.ts",
    ]) {
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
