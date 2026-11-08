import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse, type TreeNode } from "../../src/core/index.ts";

export const SCRIPT = new URL("../../bin/pbs-tree.js", import.meta.url).pathname;

const temps: string[] = [];
/** A new empty directory under the system temp dir; removed by `cleanup`. */
export function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "pbs-tree-"));
  temps.push(dir);
  return dir;
}
export function cleanup(): void {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Creates files (a name ending in `/` is an empty folder) below `root`. */
export function populate(root: string, names: string[]): void {
  for (const name of names) {
    const path = join(root, name);
    if (name.endsWith("/")) mkdirSync(path, { recursive: true });
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "");
    }
  }
}

/** The fixture most flag tests share, below `<temp>/proj`. */
export const FIXTURE = [
  "src/core/a.ts",
  "src/core/B.ts",
  "src/main.ts",
  "src/zed/z.md",
  "src/zed/f1.txt",
  "src/zed/f2.txt",
  "src/zed/f3.txt",
  "src/zed/f4.txt",
  "docs/readme.md",
  "docs/.hidden/h.txt",
  "empty/",
  "node_modules/x/i.js",
  ".env",
  ".gitignore",
  "a.log",
];
export function fixture(): string {
  const base = temp();
  const root = join(base, "proj");
  populate(root, FIXTURE);
  return root;
}

export interface Run {
  code: number | null;
  out: string;
  err: string;
}
/** Runs the script under `node` (default) or `bun`. */
export function run(args: string[], cwd: string, runtime: "node" | "bun" = "node"): Run {
  const command = runtime === "bun" ? process.execPath : "node";
  const done = spawnSync(command, [SCRIPT, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { code: done.status, out: done.stdout, err: done.stderr };
}

/** The root of the tree block a run printed; throws when the output is not exactly one valid tree. */
export function treeOf(output: string): TreeNode {
  const segments = parse(output);
  const [segment] = segments;
  if (segments.length !== 1 || segment?.type !== "block" || segment.kind !== "tree") {
    throw new Error(`not one valid tree block:\n${output}`);
  }
  return segment.data.root;
}

export interface Shape {
  name: string;
  dir: boolean;
  children: Shape[];
}
/** A tree reduced to names, kinds and order, so two tools' output compare. `… N more` lines are dropped. */
export function shapeOf(node: TreeNode): Shape {
  return {
    name: node.name,
    dir: node.dir,
    children: node.children.filter((child) => child.more === undefined).map(shapeOf),
  };
}

/** The printed lines of a tree block's body, without the fence. */
export function body(output: string): string {
  const lines = output.trimEnd().split("\n");
  return lines.slice(1, -1).join("\n");
}

export const hasTree = (() => {
  try {
    execFileSync("tree", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

interface GnuEntry {
  type: string;
  name: string;
  contents?: GnuEntry[];
}
/** GNU `tree -J` (byte-order sort) reduced to the same shape; its root takes the name of the printed tree. */
export function gnu(args: string[], cwd: string, rootName: string): Shape {
  const json = execFileSync("tree", ["-J", "--noreport", ...args, "."], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  const reduce = (entry: GnuEntry): Shape => ({
    name: entry.name,
    dir: entry.type === "directory",
    children: (entry.contents ?? []).map(reduce),
  });
  return { ...reduce((JSON.parse(json) as GnuEntry[])[0] as GnuEntry), name: rootName };
}

export function link(target: string, path: string): void {
  symlinkSync(target, path);
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } },
  );
}
