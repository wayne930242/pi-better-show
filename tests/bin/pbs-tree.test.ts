import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TREE_LIMITS, TREE_TAGS } from "../../src/core/index.ts";
import { body, cleanup, fixture, git, gnu, hasTree, link, populate, run, shapeOf, temp, treeOf } from "./helpers.ts";

afterEach(cleanup);

const fence = (...lines: string[]): string => ["```tree", ...lines, "```", ""].join("\n");
const lines = (text: string): string[] => text.trimEnd().split("\n");

/** Runs with the fixture's folder as the working directory, listing `.`. */
const list = (args: string[], root = fixture()) => run(args, root);

const DEFAULT = [
  "proj/",
  "  a.log",
  "  docs/",
  "    readme.md",
  "  empty/",
  "  node_modules/",
  "    x/",
  "      i.js",
  "  src/",
  "    core/",
  "      B.ts",
  "      a.ts",
  "    main.ts",
  "    zed/",
  "      f1.txt",
  "      f2.txt",
  "      f3.txt",
  "      f4.txt",
  "      z.md",
];

describe("pbs-tree: the script", () => {
  test("prints the tree fence of a folder: sorted by byte order, dot files and .git skipped", () => {
    const result = list([]);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(result.out).toBe(fence(...DEFAULT));
  });

  test("the root is the folder asked for, by its own name", () => {
    const root = fixture();
    expect(lines(run(["src/zed", "-L", "1"], root).out).slice(0, 2)).toEqual(["```tree", "zed/"]);
    expect(run([root, "-L", "1"], temp()).out.split("\n")[1]).toBe("proj/");
  });

  for (const runtime of ["node", "bun"] as const) {
    test(`runs under ${runtime}`, () => {
      const result = run([], fixture(), runtime);
      expect(result.err).toBe("");
      expect(result.out).toBe(fence(...DEFAULT));
    });
  }

  test("is a bin of the package: executable, with a node shebang, shipped in files", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.bin).toEqual({ "pbs-tree": "./bin/pbs-tree.js" });
    expect(pkg.files).toContain("bin");
    const path = new URL("../../bin/pbs-tree.js", import.meta.url).pathname;
    expect(readFileSync(path, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0);
    // It runs from node_modules, where node does not strip types: plain JavaScript, node built-ins only.
    const imports = [...readFileSync(path, "utf8").matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(3);
    for (const specifier of imports) expect(specifier).toStartWith("node:");
  });
});

describe("pbs-tree: flags", () => {
  test("-a lists dot files (never .git)", () => {
    const root = fixture();
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "");
    expect(body(list(["-a", "-L", "2"], root).out)).toBe(
      [
        "proj/",
        "  .env",
        "  .gitignore",
        "  a.log",
        "  docs/",
        "    .hidden/",
        "    readme.md",
        "  empty/",
        "  node_modules/",
        "    x/",
        "  src/",
        "    core/",
        "    main.ts",
        "    zed/",
      ].join("\n"),
    );
  });

  test("-L n lists n levels below the root", () => {
    expect(body(list(["-L", "1"]).out)).toBe(
      ["proj/", "  a.log", "  docs/", "  empty/", "  node_modules/", "  src/"].join("\n"),
    );
    expect(lines(list(["-L", "2"]).out)).toContain("    x/");
    expect(lines(list(["-L", "2"]).out)).not.toContain("      i.js");
  });

  test("-d lists folders only", () => {
    expect(body(list(["-d"]).out)).toBe(
      ["proj/", "  docs/", "  empty/", "  node_modules/", "    x/", "  src/", "    core/", "    zed/"].join("\n"),
    );
  });

  test("-I leaves out names matching the glob: * ? [..], | for several, repeatable, files and folders alike", () => {
    expect(body(list(["-I", "node_modules|*.log"]).out)).toBe(
      DEFAULT.filter((line) => !/a\.log|node_modules|^ {4}x\/|i\.js/.test(line)).join("\n"),
    );
    expect(list(["-I", "node_modules", "-I", "*.log"]).out).toBe(list(["-I", "node_modules|*.log"]).out);
    const small = body(list(["-I", "[aB].ts|f?.txt|z.m[a-d]", "-L", "3"]).out);
    expect(small).not.toMatch(/a\.ts|B\.ts|f\d\.txt|z\.md/);
    expect(small).toMatch(/main\.ts/);
  });

  test("-P lists only matching files, and the folders that hold one", () => {
    expect(body(list(["-P", "*.ts"]).out)).toBe(
      ["proj/", "  src/", "    core/", "      B.ts", "      a.ts", "    main.ts"].join("\n"),
    );
    expect(body(list(["-P", "*.md|*.js"]).out)).toBe(
      [
        "proj/",
        "  docs/",
        "    readme.md",
        "  node_modules/",
        "    x/",
        "      i.js",
        "  src/",
        "    zed/",
        "      z.md",
      ].join("\n"),
    );
    expect(body(list(["-P", "*.nothing"]).out)).toBe("proj/");
  });

  test("-P also looks below the -L cut, so a folder with a match is kept", () => {
    expect(body(list(["-P", "*.ts", "-L", "1"]).out)).toBe(["proj/", "  src/"].join("\n"));
  });

  test("-P is ignored with -d, which lists no files", () => {
    expect(list(["-d", "-P", "*.ts"]).out).toBe(list(["-d"]).out);
  });

  test("--dirsfirst puts folders before files, each by name", () => {
    expect(body(list(["--dirsfirst"]).out)).toBe(
      [
        "proj/",
        "  docs/",
        "    readme.md",
        "  empty/",
        "  node_modules/",
        "    x/",
        "      i.js",
        "  src/",
        "    core/",
        "      B.ts",
        "      a.ts",
        "    zed/",
        "      f1.txt",
        "      f2.txt",
        "      f3.txt",
        "      f4.txt",
        "      z.md",
        "    main.ts",
        "  a.log",
      ].join("\n"),
    );
  });

  test("--filelimit n does not open a folder holding more than n entries and writes `… N more`", () => {
    expect(body(list(["--filelimit", "4", "-I", "*.log|empty"]).out)).toBe(
      [
        "proj/",
        "  docs/",
        "    readme.md",
        "  node_modules/",
        "    x/",
        "      i.js",
        "  src/",
        "    core/",
        "      B.ts",
        "      a.ts",
        "    main.ts",
        "    zed/",
        "      … 5 more",
      ].join("\n"),
    );
    expect(body(list(["--filelimit", "3"]).out)).toBe(["proj/", "  … 5 more"].join("\n"));
    const zed = treeOf(list(["--filelimit", "4", "src/zed"]).out);
    expect(zed.children).toHaveLength(1);
    expect(zed.children[0]).toMatchObject({ name: "… 5 more", more: 5, dir: false });
  });

  test("--filelimit counts the entries that would be listed: dot files only with -a, files not with -d", () => {
    expect(body(list(["--filelimit", "4", "-d"]).out)).toContain("  src/\n    core/\n    zed/");
    expect(body(list(["--filelimit", "5", "-a"]).out)).toBe(["proj/", "  … 7 more"].join("\n"));
  });

  test("--prune drops folders that hold nothing (what -L hides still counts), and -d ignores it", () => {
    expect(body(list(["--prune"]).out)).toBe(DEFAULT.filter((line) => line !== "  empty/").join("\n"));
    expect(body(list(["--prune", "-L", "1"]).out)).toBe(
      ["proj/", "  a.log", "  docs/", "  node_modules/", "  src/"].join("\n"),
    );
    expect(list(["--prune", "-d"]).out).toBe(list(["-d"]).out);
  });

  test("symlinks are never followed: a link to a folder is a file", () => {
    const root = fixture();
    link(".", join(root, "loop"));
    link("src", join(root, "docs", "to-src"));
    const tree = treeOf(run([], root).out);
    const loop = tree.children.find((child) => child.name === "loop");
    expect(loop).toMatchObject({ dir: false, children: [] });
    const docs = tree.children.find((child) => child.name === "docs");
    expect(docs?.children.map((child) => [child.name, child.dir])).toEqual([
      ["readme.md", false],
      ["to-src", false],
    ]);
  });

  test("a folder it cannot enter is a warning on stderr, not silence", () => {
    const root = fixture();
    try {
      chmodSync(join(root, "docs"), 0o000);
      const result = run([], root);
      if (process.getuid?.() === 0) return;
      expect(result.code).toBe(0);
      expect(result.err).toContain("docs");
      expect(treeOf(result.out).children.find((child) => child.name === "docs")).toMatchObject({ dir: true });
    } finally {
      chmodSync(join(root, "docs"), 0o755);
    }
  });
});

describe("pbs-tree: the shape of GNU tree", () => {
  const cases: [string, string[], string[]][] = [
    ["default", [], []],
    ["-a", ["-a"], ["-a"]],
    ["-L 1", ["-L", "1"], ["-L", "1"]],
    ["-L 2", ["-L", "2"], ["-L", "2"]],
    ["-d", ["-d"], ["-d"]],
    ["-d -L 2", ["-d", "-L", "2"], ["-d", "-L", "2"]],
    ["-I a glob list", ["-I", "node_modules|*.log"], ["-I", "node_modules|*.log"]],
    ["-I twice", ["-I", "node_modules", "-I", "*.log"], ["-I", "node_modules", "-I", "*.log"]],
    ["-I with ? and [..]", ["-I", "[aB].ts|f?.txt"], ["-I", "[aB].ts|f?.txt"]],
    ["-a -I a folder", ["-a", "-I", "docs"], ["-a", "-I", "docs"]],
    ["--dirsfirst", ["--dirsfirst"], ["--dirsfirst"]],
    ["--prune", ["--prune"], ["--prune"]],
    ["-P with GNU's --prune", ["-P", "*.ts"], ["--prune", "-P", "*.ts"]],
    ["-P a list", ["-P", "*.md|*.js"], ["--prune", "-P", "*.md|*.js"]],
  ];
  for (const [name, ours, theirs] of cases) {
    test.skipIf(!hasTree)(`${name} lists what tree ${theirs.join(" ")} lists`, () => {
      const root = fixture();
      expect(shapeOf(treeOf(run(ours, root).out))).toEqual(gnu(theirs, root, "proj"));
    });
  }
});

describe("pbs-tree: --gitignore", () => {
  const FILES = [
    ".git/HEAD",
    ".gitignore",
    "a.log",
    "keep.log",
    "b.txt",
    "build/x.js",
    "src/build/y.js",
    "src/.gitignore",
    "src/secret.txt",
    "src/deep/secret.txt",
    "src/deep/ok.txt",
    "src/main.gen",
    "src/x.log",
    "docs/a.tmp",
    "docs/sub/b.tmp",
    "docs/a.bak",
    "docs/x/y/c.bak",
    "docs/keep.md",
    "node_modules/z.js",
    "sub/node_modules/w.js",
    "sub/ok.js",
    "secret.txt",
  ];
  const repo = (): string => {
    const root = join(temp(), "proj");
    populate(root, FILES);
    writeFileSync(
      join(root, ".gitignore"),
      "# build output\n*.log\n!keep.log\n/build/\ndocs/*.tmp\ndocs/**/*.bak\nnode_modules\n",
    );
    writeFileSync(join(root, "src", ".gitignore"), "secret.txt\n*.gen\n");
    return root;
  };

  test("without the flag every file is listed", () => {
    const names = lines(run(["-L", "1"], repo()).out);
    expect(names).toContain("  a.log");
    expect(names).toContain("  build/");
  });

  test("honours .gitignore files: globs, negation, anchored, folder-only, ** and nested files", () => {
    expect(body(run(["--gitignore"], repo()).out)).toBe(
      [
        "proj/",
        "  b.txt",
        "  docs/",
        "    keep.md",
        "    sub/",
        "      b.tmp",
        "    x/",
        "      y/",
        "  keep.log",
        "  secret.txt",
        "  src/",
        "    build/",
        "      y.js",
        "    deep/",
        "      ok.txt",
        "  sub/",
        "    ok.js",
      ].join("\n"),
    );
  });

  test("a folder inside a repository also obeys the .gitignore files above it", () => {
    const root = repo();
    expect(body(run(["--gitignore", "src"], root).out)).toBe(
      ["src/", "  build/", "    y.js", "  deep/", "    ok.txt"].join("\n"),
    );
  });

  test("-a shows the .gitignore files themselves, still not .git", () => {
    const names = lines(run(["--gitignore", "-a", "-L", "1"], repo()).out);
    expect(names).toContain("  .gitignore");
    expect(names).not.toContain("  .git/");
  });
});

describe("pbs-tree: --changed-since", () => {
  const repo = (): string => {
    const root = join(temp(), "proj");
    populate(root, ["a.txt", "src/b.ts", "src/c.ts", "old/gone.txt", "old/keep.txt", "docs/d.md", ".github/ci.yml"]);
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "one");
    return root;
  };
  const dirty = (root: string): void => {
    writeFileSync(join(root, "src", "b.ts"), "changed");
    populate(root, ["src/n.ts", "src/u.ts"]);
    git(root, "add", "src/n.ts");
    rmSync(join(root, "a.txt"));
    rmSync(join(root, "old", "gone.txt"));
    rmSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, ".github", "ci.yml"), "changed");
  };

  test("tags new, changed, and removed files; removed files are listed though absent", () => {
    const root = repo();
    dirty(root);
    const result = run(["--changed-since", "HEAD"], root);
    expect(result.err).toBe("");
    expect(body(result.out)).toBe(
      [
        "proj/",
        "  a.txt {removed}",
        "  docs/",
        "    d.md {removed}",
        "  old/",
        "    gone.txt {removed}",
        "    keep.txt",
        "  src/",
        "    b.ts {changed}",
        "    c.ts",
        "    n.ts {new}",
        "    u.ts {new}",
      ].join("\n"),
    );
    for (const tag of ["new", "changed", "removed"]) expect(TREE_TAGS).toContain(tag as (typeof TREE_TAGS)[number]);
  });

  test("tags what changed between two revisions and the working tree", () => {
    const root = repo();
    writeFileSync(join(root, "src", "c.ts"), "two");
    git(root, "commit", "-q", "-am", "two");
    expect(body(run(["--changed-since", "HEAD~1", "src"], root).out)).toBe(
      ["src/", "  b.ts", "  c.ts {changed}"].join("\n"),
    );
    expect(body(run(["--changed-since", "HEAD"], root).out)).not.toContain("{");
  });

  test("a renamed file shows as removed at the old path and new at the new one", () => {
    const root = repo();
    git(root, "mv", "src/c.ts", "src/renamed.ts");
    const text = body(run(["--changed-since", "HEAD", "src"], root).out);
    expect(text).toBe(["src/", "  b.ts", "  c.ts {removed}", "  renamed.ts {new}"].join("\n"));
  });

  test("a folder of the repository lists paths relative to itself", () => {
    const root = repo();
    dirty(root);
    expect(body(run(["--changed-since", "HEAD", "src"], root).out)).toBe(
      ["src/", "  b.ts {changed}", "  c.ts", "  n.ts {new}", "  u.ts {new}"].join("\n"),
    );
  });

  test("the other flags apply to removed files too: -I, -a, -d, -L", () => {
    const root = repo();
    dirty(root);
    // docs/ exists only as the home of a removed file: with that file filtered out it is gone, while old/ is still there.
    expect(body(run(["--changed-since", "HEAD", "-I", "*.md|*.txt"], root).out)).toBe(
      ["proj/", "  old/", "  src/", "    b.ts {changed}", "    c.ts", "    n.ts {new}", "    u.ts {new}"].join("\n"),
    );
    expect(body(run(["--changed-since", "HEAD", "-a", "-L", "1"], root).out)).toBe(
      ["proj/", "  .github/", "  a.txt {removed}", "  docs/", "  old/", "  src/"].join("\n"),
    );
    expect(body(run(["--changed-since", "HEAD", "-d"], root).out)).toBe(["proj/", "  old/", "  src/"].join("\n"));
  });

  test("a revision git does not know, or no repository, fails with git's message", () => {
    const root = repo();
    const bad = run(["--changed-since", "nope"], root);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("pbs-tree:");
    expect(bad.err).toContain("nope");
    expect(bad.out).toBe("");
    const outside = run(["--changed-since", "HEAD"], temp());
    expect(outside.code).toBe(1);
    expect(outside.err).toContain("pbs-tree:");
    expect(run(["--changed-since", "--help"], root).code).toBe(2);
    expect(run(["--changed-since=-x"], root).code).toBe(2);
  });
});

describe("pbs-tree: the contract", () => {
  test("names that would read as a note or tags are kept apart, and the output still parses", () => {
    const root = join(temp(), "proj");
    populate(root, ["a # b.txt", "x {new}", " lead.txt", "{y}", "… 3 more", "bad\nname.txt", "plain"]);
    const tree = treeOf(run([], root).out);
    expect(tree.children.map((child) => child.name).sort()).toEqual(
      [
        "\u00a0lead.txt",
        "\u00a0{y}",
        "…\u00a03 more",
        "a #\u00a0b.txt",
        "bad?name.txt",
        "plain",
        "x\u00a0{new}",
      ].sort(),
    );
    expect(tree.children.every((child) => child.tags.length === 0 && child.note === undefined)).toBe(true);
    expect(tree.children.every((child) => child.more === undefined)).toBe(true);
  });

  test("a name made of backticks gets a fence long enough to hold it", () => {
    const root = join(temp(), "proj");
    populate(root, ["```", "ok"]);
    const result = run([], root);
    expect(result.out.startsWith("````tree\n")).toBe(true);
    expect(treeOf(result.out).children.map((child) => child.name)).toEqual(["```", "ok"]);
  });

  test("names sort by byte order: capitals first, then by UTF-8", () => {
    const root = join(temp(), "proj");
    populate(root, ["b", "B2", "a", "_u", "é", "中", "Z", "10", "9"]);
    expect(treeOf(run([], root).out).children.map((child) => child.name)).toEqual([
      "10",
      "9",
      "B2",
      "Z",
      "_u",
      "a",
      "b",
      "é",
      "中",
    ]);
  });

  test("a tree the block cannot hold is refused with the numbers, not cut", () => {
    const flat = (count: number) => {
      const root = join(temp(), "proj");
      populate(
        root,
        Array.from({ length: count }, (_, i) => `f${i}`),
      );
      return root;
    };
    expect(treeOf(run([], flat(TREE_LIMITS.nodes - 1)).out).children).toHaveLength(TREE_LIMITS.nodes - 1);
    const over = run([], flat(TREE_LIMITS.nodes));
    expect(over.code).toBe(1);
    expect(over.out).toBe("");
    expect(over.err).toContain(`${TREE_LIMITS.nodes + 1} nodes`);
    expect(over.err).toContain(`at most ${TREE_LIMITS.nodes}`);
    expect(over.err).toContain("-L");
    expect(treeOf(run(["--filelimit", "100"], flat(TREE_LIMITS.nodes)).out).children[0]?.more).toBe(TREE_LIMITS.nodes);
  });

  test("so is one nested deeper than the block allows", () => {
    const nest = (folders: number) => {
      const root = join(temp(), "proj");
      populate(root, [`${Array.from({ length: folders }, (_, i) => `d${i}`).join("/")}/`]);
      return root;
    };
    expect(treeOf(run([], nest(TREE_LIMITS.depth - 1)).out).name).toBe("proj");
    const deep = run([], nest(TREE_LIMITS.depth));
    expect(deep.code).toBe(1);
    expect(deep.err).toContain(`${TREE_LIMITS.depth + 1} levels`);
    expect(deep.err).toContain("-L");
    expect(treeOf(run(["-L", "5"], nest(TREE_LIMITS.depth)).out).name).toBe("proj");
  });
});

describe("pbs-tree: usage", () => {
  test("--help prints the flags and exits 0", () => {
    const result = run(["--help"], temp());
    expect(result.code).toBe(0);
    for (const flag of [
      "-L",
      "-d",
      "-a",
      "-I",
      "-P",
      "--gitignore",
      "--dirsfirst",
      "--filelimit",
      "--prune",
      "--changed-since",
    ])
      expect(result.out).toContain(flag);
  });

  test("a bad flag or value exits 2 with the reason and no output", () => {
    for (const args of [
      ["-L", "0"],
      ["-L", "x"],
      ["--filelimit", "0"],
      ["--filelimit"],
      ["--nope"],
      ["a", "b"],
      ["-L"],
    ]) {
      const result = run(args, temp());
      expect({ args, code: result.code, out: result.out }).toEqual({ args, code: 2, out: "" });
      expect(result.err).toContain("pbs-tree:");
    }
  });

  test("a folder that does not exist, or a file, exits 1", () => {
    const root = fixture();
    expect(run(["missing"], root).code).toBe(1);
    expect(run(["src/main.ts"], root).code).toBe(1);
    expect(run(["missing"], root).err).toContain("missing");
  });
});
