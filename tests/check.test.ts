import { describe, expect, test } from "bun:test";
import { type BlockProblem, checkBlocks, formatProblems } from "../src/core/index.ts";

const block = (kind: string, body: string): string => `\`\`\`${kind}\n${body}\n\`\`\`\n`;
/** A document with a heading and a blank line before the block, so the fence is on line 3. */
const doc = (kind: string, body: string): string => `# T\n\n${block(kind, body)}`;
const only = (problems: BlockProblem[]): BlockProblem => {
  expect(problems).toHaveLength(1);
  return problems[0] as BlockProblem;
};

describe("checkBlocks: a clean document", () => {
  test("has no problems, whatever the blocks and the prose hold", () => {
    const text = [
      "# Title with # and a tag #x",
      "",
      "```js",
      "let a = { b: 1 }; // not a block",
      "```",
      "",
      block(
        "form",
        'title: T\nquestions:\n  - name: q\n    label: "要，跟 #客戶 一樣"\n    choices:\n      - {value: a, label: "x #y", recommended: true}\n      - plain',
      ),
      block("table", "columns: [a, b]\nrows:\n  - [1, 2]\nsort: {column: a, direction: desc}\nfilter: true"),
      block("cards", "- {title: A, tone: ok, body: b}"),
      block("tree", "root/\n  a.txt {new} # note"),
      block("mermaid", "flowchart LR\n A --> B"),
      "> [!NOTE]\n> hi",
    ].join("\n");
    expect(checkBlocks(text)).toEqual([]);
  });

  test("a document without blocks has none", () => {
    expect(checkBlocks("")).toEqual([]);
    expect(checkBlocks("just text # not a comment\n")).toEqual([]);
  });
});

describe("checkBlocks: invalid blocks", () => {
  test("the motivating line: a ` #` inside a flow map breaks the block; the problem is on that line", () => {
    const body = [
      "title: T",
      "questions:",
      "  - name: o5",
      "    label: a",
      "    choices:",
      "      - {value: yes, label: 要，跟 #客戶 一樣, recommended: true}",
      "      - {value: no, label: 不用}",
    ].join("\n");
    const found = only(checkBlocks(doc("form", body)));
    // The fence is on line 3, the broken choice is the 6th line of the body.
    expect(found).toMatchObject({ kind: "form", line: 9, path: "form", severity: "error" });
    expect(found.message).toContain("the form block is invalid and is shown as source");
    expect(found.message).toContain("Flow map in block collection");
    expect(found.message).toContain('quote any value that holds " #"');
    expect(found.message).not.toMatch(/at line \d+/);
  });

  test("a broken flow sequence points at the line that opened it", () => {
    const found = only(checkBlocks(doc("cards", "- title: a\n- {title: b # c, body: d}\n- title: e")));
    expect(found).toMatchObject({ kind: "cards", line: 5, severity: "error" });
  });

  test("another YAML error is reported at the line YAML names", () => {
    const found = only(checkBlocks(doc("steps", "- title: a\n  status: 'done\n- title: b")));
    expect(found.severity).toBe("error");
    expect(found.line).toBeGreaterThanOrEqual(4);
    expect(found.message).toContain("quote");
  });

  test("a block that parses but breaks its schema is reported at its fence", () => {
    const found = only(checkBlocks(doc("form", "questions:\n  - type: single")));
    expect(found).toMatchObject({ kind: "form", line: 3, severity: "error" });
    expect(found.message).toContain("each question needs a name or a label");
  });

  test("a tree error names the file line, a mindmap error the line of the item", () => {
    const tree = only(checkBlocks(doc("tree", "root/\n  a\n      deep")));
    expect(tree).toMatchObject({ kind: "tree", line: 6, severity: "error" });
    expect(tree.message).not.toMatch(/^line /);
    expect(tree.message).toContain("indented more than one level");
    const mind = only(checkBlocks(doc("mindmap", "- a\n  - b\nplain text")));
    expect(mind).toMatchObject({ kind: "mindmap", line: 6 });
  });

  test("an empty diagram is an error", () => {
    expect(only(checkBlocks(doc("mermaid", "")))).toMatchObject({ kind: "mermaid", severity: "error" });
  });

  test("the mermaid hook judges real diagrams, at the first line of the diagram", () => {
    const seen: string[] = [];
    const mermaid = (source: string) => {
      seen.push(source);
      return source.startsWith("bad") ? 'Invalid mermaid header: "bad"' : undefined;
    };
    expect(checkBlocks(doc("mermaid", "flowchart LR\n A-->B"), { mermaid })).toEqual([]);
    const found = only(checkBlocks(doc("mermaid", "bad diagram"), { mermaid }));
    expect(found).toMatchObject({ kind: "mermaid", line: 4, severity: "error" });
    expect(found.message).toContain("Invalid mermaid header");
    expect(seen).toEqual(["flowchart LR\n A-->B", "bad diagram"]);
  });

  test("an indented fence keeps the file line", () => {
    const found = only(checkBlocks("para\n\n  ```cards\n  - {title: a # b}\n  ```\n"));
    expect(found).toMatchObject({ kind: "cards", line: 4 });
  });
});

describe("checkBlocks: a value cut at ` #`", () => {
  test("the block-style twin of the motivating line parses and silently loses text; it is a warning that names the key path", () => {
    const body = [
      "questions:",
      "  - name: o5",
      "    label: q",
      "    choices:",
      "      - value: yes",
      "        label: 要，跟 #客戶 一樣",
    ].join("\n");
    const found = only(checkBlocks(doc("form", body)));
    expect(found).toMatchObject({
      kind: "form",
      line: 9,
      path: 'form question "o5" choice 1 label',
      severity: "warning",
    });
    expect(found.message).toContain('"#客戶 一樣" is read as a YAML comment and dropped');
    expect(found.message).toContain('the value "要，跟"');
    expect(found.message).toContain("quote the whole value: '要，跟 #客戶 一樣'");
  });

  test("a bare scalar in a list, an empty value, and nested lists are found, with their paths", () => {
    const found = checkBlocks(
      doc("options", "- title: A\n  body:  #later\n  pros: [x]\n  cons:\n    - slow #maybe\n- title: B"),
    );
    expect(found.map((problem) => [problem.line, problem.path])).toEqual([
      [5, "options option 1 body"],
      [8, "options option 1 cons 1"],
    ]);
    expect(found[0]?.message).toContain("leaving no value");
    const suggest = only(checkBlocks(doc("suggest", "- 好 #1")));
    expect(suggest.path).toBe("suggest suggestion 1");
  });

  test("quoted values, and a ` #` that is part of a word, are left alone", () => {
    expect(checkBlocks(doc("cards", "- {title: 'a #b', body: c#d}\n- title: \"x # y\" # real comment"))).toEqual([]);
  });
});

describe("checkBlocks: unknown keys", () => {
  const cases: [string, string, string, string][] = [
    ["cards", "- {title: a, colour: ok}", "cards card 1", "title, tone, body"],
    ["options", "- {title: a, recommend: true}", "options option 1", "title, recommended, body, pros, cons"],
    ["options", "options:\n  - title: a\nextra: 1", "options", "options"],
    ["form", "title: T\nsubmit: s\nquestion: []\nquestions:\n  - name: q", "form", "title, submit, questions"],
    ["form", "questions:\n  - name: q\n    chioces: [a]", 'form question "q"', "name, label, type"],
    [
      "form",
      "questions:\n  - name: q\n    choices:\n      - {label: a, recommend: true}",
      'form question "q" choice 1',
      "value, label, note, recommended",
    ],
    ["review", "title: R\nitem: []\nitems:\n  - image: a.png", "review", "title, submit, pick, columns, items"],
    [
      "review",
      "items:\n  - {name: B, image: a.png, caption: x}",
      'review item "B"',
      "name, label, image, page, height, body",
    ],
    ["suggest", "- {label: a, txt: b}", "suggest suggestion 1", "label, text"],
    ["checklist", "titel: T\nitems: [a]", "checklist", "title, submit, items"],
    ["checklist", "items:\n  - {label: a, check: true}", "checklist item", "name, label, checked, note"],
    ["table", "columns: [a]\nrows: [[1]]\nfilters: true", "table", "columns, rows, sort, filter"],
    ["table", "columns:\n  - {name: a, aling: left}\nrows: [[1]]", 'table column "a"', "name, label, type, align"],
    [
      "table",
      "columns: [a]\nrows: [[1]]\nsort: {column: a, dirction: desc}",
      "table sort",
      "column, by, direction, dir",
    ],
    ["steps", "- {title: a, statuss: done}", "steps step 1", "title, status, when, body"],
    ["stats", "- {label: a, value: 1, unit: kg}", "stats stat 1", "label, value, delta, tone, note"],
  ];
  for (const [kind, body, path, known] of cases) {
    test(`${kind}: ${path}`, () => {
      const found = checkBlocks(doc(kind, body)).filter((problem) => problem.message.includes("unknown key"));
      expect(found.length).toBeGreaterThan(0);
      expect(found[0]).toMatchObject({ kind, severity: "warning" });
      expect(found[0]?.path.startsWith(path)).toBe(true);
      expect(found[0]?.message).toContain(`this level reads: ${known}`);
    });
  }

  test("the misspelled `recommend` on a choice offers `recommended`, at its line", () => {
    const found = only(
      checkBlocks(doc("form", "questions:\n  - name: q\n    choices:\n      - value: a\n        recommend: true")),
    );
    expect(found).toMatchObject({ line: 8, path: 'form question "q" choice 1', severity: "warning" });
    expect(found.message).toBe(
      'unknown key "recommend" is ignored (did you mean "recommended"?); this level reads: value, label, note, recommended',
    );
  });

  test("keys that carry data are not flagged: table rows keyed by column, a bare list, aliases the converters read", () => {
    expect(checkBlocks(doc("table", "columns: [name, size]\nrows:\n  - {name: a, size: 1}"))).toEqual([]);
    expect(checkBlocks(doc("form", "- {label: q, choices: [a, b]}"))).toEqual([]);
    expect(checkBlocks(doc("table", "columns: [a]\nrows: [[1]]\nsort: {by: a, dir: desc}"))).toEqual([]);
  });
});

describe("checkBlocks: structure", () => {
  test("a fence that never closes is a warning at its opening", () => {
    const found = only(checkBlocks("text\n\n```steps\n- a\n"));
    expect(found).toMatchObject({ kind: "steps", line: 3, severity: "warning" });
    expect(found.message).toContain("never closed");
  });

  test("problems come in document order, across blocks", () => {
    const text = `${doc("cards", "- {title: a, x: 1}")}\n${doc("steps", "- {title: b, y: 2}")}`;
    const lines = checkBlocks(text).map((problem) => problem.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(lines).toHaveLength(2);
  });

  test("CRLF files keep their line numbers", () => {
    const text = "# T\r\n\r\n```cards\r\n- {title: a, x: 1}\r\n```\r\n";
    expect(only(checkBlocks(text)).line).toBe(4);
  });
});

describe("formatProblems", () => {
  test("lists each problem with its line and path, marking warnings", () => {
    const text = formatProblems("q.md", [
      { kind: "form", line: 40, path: "form", message: "broken", severity: "error" },
      { kind: "form", line: 50, path: 'form question "o5" choice 1 label', message: "cut", severity: "warning" },
    ]);
    expect(text).toBe(
      'Block problems in q.md:\n- line 40 form: broken\n- line 50 form question "o5" choice 1 label (warning): cut',
    );
  });
});
