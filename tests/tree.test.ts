import { describe, expect, test } from "bun:test";
import { DISPLAY_KINDS, parse, type Segment, TREE_LIMITS, TREE_TAGS, toText } from "../src/core/index.ts";
import type { TreeData, TreeNode } from "../src/core/types.ts";

const one = (body: string): Segment => {
  const segments = parse(`\`\`\`tree\n${body}\n\`\`\`\n`);
  expect(segments).toHaveLength(1);
  return segments[0] as Segment;
};
const data = (body: string): TreeData => {
  const segment = one(body);
  if (segment.type !== "block" || segment.kind !== "tree") throw new Error(`not a tree: ${JSON.stringify(segment)}`);
  return segment.data;
};
const error = (body: string): string => {
  const segment = one(body);
  if (segment.type !== "invalid") throw new Error(`not invalid: ${JSON.stringify(segment)}`);
  expect(segment.kind).toBe("tree");
  expect(segment.source).toBe(body);
  return segment.error;
};

const node = (name: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  name,
  dir: false,
  tags: [],
  children: [],
  ...extra,
});

const EXAMPLE = [
  "pi-better-show/",
  "  src/ # one package, four entries",
  "    core/ {focus} # parser and text, no DOM",
  "      parse.ts",
  "      validate.ts {new} # checks answers",
  "    elements/ # web components",
  "  tests/",
  "  README.md {changed}",
].join("\n");

describe("parse: tree", () => {
  test("the spec's example: folders end with /, tags in {}, a note after ' # '", () => {
    expect(data(EXAMPLE)).toEqual({
      root: node("pi-better-show", {
        dir: true,
        children: [
          node("src", {
            dir: true,
            note: "one package, four entries",
            children: [
              node("core", {
                dir: true,
                tags: ["focus"],
                note: "parser and text, no DOM",
                children: [node("parse.ts"), node("validate.ts", { tags: ["new"], note: "checks answers" })],
              }),
              node("elements", { dir: true, note: "web components" }),
            ],
          }),
          node("tests", { dir: true }),
          node("README.md", { tags: ["changed"] }),
        ],
      }),
    });
  });

  test("the tree is a block of its kind, numbered like any other", () => {
    const segments = parse("```tree\nr/\n```\n\n```steps\n- a\n```\n");
    expect(segments.map((s) => (s.type === "block" ? `${s.kind}:${s.index}` : s.type))).toEqual(["tree:0", "steps:1"]);
  });

  test("every tag, several tags (comma or space), repeats once, empty braces none", () => {
    expect([...TREE_TAGS]).toEqual(["new", "changed", "removed", "focus", "risk"]);
    for (const tag of TREE_TAGS) expect(data(`r/\n  f {${tag}}`).root.children[0]?.tags).toEqual([tag]);
    expect(data("r/\n  f {new, risk}").root.children[0]?.tags).toEqual(["new", "risk"]);
    expect(data("r/\n  f {focus changed}").root.children[0]?.tags).toEqual(["focus", "changed"]);
    expect(data("r/\n  f {new,new}").root.children[0]?.tags).toEqual(["new"]);
    expect(data("r/\n  f {}").root.children[0]).toEqual(node("f"));
  });

  test("notes: only after ' # '; braces and hashes inside a name or a note stay", () => {
    expect(data("r/\n  a#b.ts # why").root.children[0]).toEqual(node("a#b.ts", { note: "why" }));
    expect(data("r/\n  f # uses {new} and # again").root.children[0]).toEqual(
      node("f", { note: "uses {new} and # again" }),
    );
    expect(data("r/\n  my file.txt {risk} # a **big** one").root.children[0]).toEqual(
      node("my file.txt", { tags: ["risk"], note: "a **big** one" }),
    );
    expect(data("r/\n  f #").root.children[0]).toEqual(node("f #"));
    expect(data("r/\n  f {new}x").root.children[0]).toEqual(node("f {new}x"));
  });

  test("only spaces and tabs are trimmed: a no-break space at the edge of a name is kept", () => {
    expect(data("r/\n  \u00a0lead.txt\u00a0 # n").root.children[0]).toEqual(
      node("\u00a0lead.txt\u00a0", { note: "n" }),
    );
  });

  test("an empty folder, a folder with a note and no children", () => {
    expect(data("r/\n  empty/ # nothing yet").root.children[0]).toEqual(
      node("empty", { dir: true, note: "nothing yet" }),
    );
  });

  test("`… N more` is the entries a limit cut", () => {
    expect(data("r/\n  big/\n    a.ts\n    … 12 more").root.children[0]?.children[1]).toEqual(
      node("… 12 more", { more: 12 }),
    );
  });

  test("blank lines and trailing spaces are ignored, and a deeper dedent may climb several levels", () => {
    expect(data("r/\n\n  a/   \n    b/\n      c\n  d\n").root.children.map((child) => child.name)).toEqual(["a", "d"]);
  });

  test("names keep CJK characters and spaces", () => {
    expect(data("專案/\n  說明 文件.md # 中文備註").root.children[0]).toEqual(
      node("說明 文件.md", { note: "中文備註" }),
    );
  });

  test("errors: empty, indentation, tabs, a second root, a file holding entries", () => {
    expect(error("")).toBe("a tree needs a root line");
    expect(error("\n\n")).toBe("a tree needs a root line");
    expect(error("  r/")).toBe("line 1: the root line is not indented");
    expect(error("r/\n   a")).toBe("line 2: indent by two spaces per level");
    expect(error("r/\n    a")).toBe("line 2: indented more than one level below the line above");
    expect(error("r/\n\ta")).toBe("line 2: indent with two spaces, not tabs");
    expect(error("r/\nsecond/")).toBe("a tree has one root: indent the other top-level lines under it");
    expect(error("r/\n  a.ts\n    b.ts")).toBe(
      'line 3: "a.ts" is a file and cannot hold entries (end a folder\'s name with /)',
    );
    expect(error("r/\n  a/\n    … 3 more\n      b")).toBe(
      'line 4: "… 3 more" is a file and cannot hold entries (end a folder\'s name with /)',
    );
    expect(error("r/\n  /")).toBe("line 2: a line has no name");
    expect(error("r/\n  {new}")).toBe("line 2: a line has no name");
  });

  test("an unknown tag makes the block invalid and names the tag", () => {
    expect(error("r/\n  f {wip}")).toBe('line 2: unknown tag "wip" (use new, changed, removed, focus, risk)');
    expect(error("r/\n  f {new, wip}")).toBe('line 2: unknown tag "wip" (use new, changed, removed, focus, risk)');
  });

  test("limits: 2,000 nodes and 32 levels", () => {
    expect(TREE_LIMITS).toEqual({ nodes: 2000, depth: 32 });
    const flat = (count: number) => ["r/", ...Array.from({ length: count - 1 }, (_, i) => `  f${i}`)].join("\n");
    expect(data(flat(2000)).root.children).toHaveLength(1999);
    expect(error(flat(2001))).toBe("a tree holds at most 2000 nodes");
    const deep = (levels: number) => Array.from({ length: levels }, (_, i) => `${"  ".repeat(i)}d${i}/`).join("\n");
    expect(data(deep(32)).root.name).toBe("d0");
    expect(error(deep(33))).toBe("a tree is at most 32 levels deep");
  });
});

describe("toText: tree", () => {
  const PLAIN = [
    "pi-better-show/",
    "├── src/ — one package, four entries",
    "│   ├── core/ [focus] — parser and text, no DOM",
    "│   │   ├── parse.ts",
    "│   │   └── validate.ts [new] — checks answers",
    "│   └── elements/ — web components",
    "├── tests/",
    "└── README.md [changed]",
  ].join("\n");
  const md = `\`\`\`tree\n${EXAMPLE}\n\`\`\`\n`;

  test("Discord: tree style in a fence so the columns stay aligned", () => {
    expect(toText(parse(md), { flavor: "discord" })).toBe(`\`\`\`\n${PLAIN}\n\`\`\``);
  });

  test("LINE and plain: the same tree, indented like other preformatted text", () => {
    const indented = PLAIN.split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    expect(toText(parse(md), { flavor: "line" })).toBe(indented);
    expect(toText(parse(md), { flavor: "plain" })).toBe(indented);
  });

  test("several tags, a note's Markdown dropped, `… N more` as a leaf, a lone root", () => {
    const text = toText(parse("```tree\nr/\n  a/ {new, risk} # **mind** `this`\n    … 4 more\n  z\n```\n"), {
      flavor: "plain",
    });
    expect(text).toBe(["  r/", "  ├── a/ [new] [risk] — mind this", "  │   └── … 4 more", "  └── z"].join("\n"));
    expect(toText(parse("```tree\nalone/\n```\n"), { flavor: "plain" })).toBe("  alone/");
  });

  test("a name holding backticks gets a longer Discord fence", () => {
    expect(toText(parse("```tree\nr/\n  a```b\n```\n"), { flavor: "discord" })).toBe("````\nr/\n└── a```b\n````");
  });

  test("an invalid tree keeps its source in a code block", () => {
    expect(toText(parse("```tree\nr/\n  f {wip}\n```\n"), { flavor: "discord" })).toBe("```\nr/\n  f {wip}\n```");
  });

  test("tree is a display kind, kept raw when a surface draws it", () => {
    expect(DISPLAY_KINDS).toContain("tree");
    expect(toText(parse(md), { flavor: "discord", keep: DISPLAY_KINDS })).toBe(md.trimEnd());
  });
});
