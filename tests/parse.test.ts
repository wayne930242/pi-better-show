import { describe, expect, test } from "bun:test";
import { type BlockKind, parse, type Segment } from "../src/core/index.ts";

const one = (markdown: string): Segment => {
  const segments = parse(markdown);
  expect(segments).toHaveLength(1);
  return segments[0] as Segment;
};
const data = (kind: BlockKind, body: string) => {
  const segment = one(`\`\`\`${kind}\n${body}\n\`\`\`\n`);
  if (segment.type !== "block") throw new Error(`not a block: ${JSON.stringify(segment)}`);
  expect(segment.kind).toBe(kind);
  return segment.data;
};
const error = (kind: BlockKind, body: string): string => {
  const segment = one(`\`\`\`${kind}\n${body}\n\`\`\`\n`);
  if (segment.type !== "invalid") throw new Error(`not invalid: ${JSON.stringify(segment)}`);
  expect(segment.kind).toBe(kind);
  expect(segment.source).toBe(body);
  return segment.error;
};

describe("parse: segments", () => {
  test("splits prose and blocks in order, and numbers blocks of every kind from 0", () => {
    const segments = parse(
      "# T\n\n```cards\n- {title: X}\n```\n\ntext\n\n```mermaid\ngraph TD\n A-->B\n```\n\n> [!NOTE]\n> hi\n\ntail\n",
    );
    expect(segments.map((s) => (s.type === "block" ? `${s.kind}:${s.index}` : s.type))).toEqual([
      "markdown",
      "cards:0",
      "markdown",
      "mermaid:1",
      "alert:2",
      "markdown",
    ]);
    expect(segments[0]).toEqual({ type: "markdown", text: "# T" });
  });

  test("an invalid block takes no index", () => {
    const segments = parse("```form\n[oops\n```\n\n```steps\n- a\n```\n");
    expect(segments.map((s) => (s.type === "block" ? s.index : s.type))).toEqual(["invalid", 0]);
  });

  test("other code blocks, and block fences inside a longer outer fence, stay Markdown", () => {
    const text = "```js\nlet a = 1;\n```\n\n````markdown\n```form\n- {label: q}\n```\n````\n\n~~~\n```table\n~~~\n";
    expect(parse(text)).toEqual([{ type: "markdown", text: text.trimEnd() }]);
  });

  test("tilde fences, indented fences, an info string after the kind, and an unclosed fence work", () => {
    expect(data("steps", "- a")).toMatchObject({ items: [{ title: "a" }] });
    expect(one("~~~steps\n- a\n~~~\n")).toMatchObject({ type: "block", kind: "steps" });
    expect(one("  ```steps title\n  - a\n  ```\n")).toMatchObject({
      type: "block",
      kind: "steps",
      data: { items: [{ title: "a" }] },
    });
    expect(one("```STEPS\n- a\n```")).toMatchObject({ type: "block", kind: "steps" });
    expect(one("```steps\n- a\n")).toMatchObject({ type: "block", kind: "steps" });
  });

  test("CRLF documents parse like LF ones", () => {
    expect(parse("a\r\n\r\n```steps\r\n- x\r\n```\r\n")).toEqual(parse("a\n\n```steps\n- x\n```\n"));
  });

  test("a blockquote inside a code fence is not an alert", () => {
    const text = "```md\n> [!NOTE]\n> x\n```";
    expect(parse(text)).toEqual([{ type: "markdown", text }]);
  });
});

describe("parse: alerts", () => {
  test("tone by type, the given or default title, the body after the marker line", () => {
    expect(one("> [!WARNING] 注意\n> 會覆寫\n> 第二行")).toMatchObject({
      kind: "alert",
      data: { tone: "warn", title: "注意", body: "會覆寫\n第二行" },
    });
    expect(one("> [!TIP]\n> 小技巧")).toMatchObject({ data: { tone: "ok", title: "Tip", body: "小技巧" } });
    expect(one("> [!note]\n")).toMatchObject({ data: { tone: "note", title: "Note", body: "" } });
    expect(one("> [!IMPORTANT]")).toMatchObject({ data: { tone: "note", title: "Important" } });
    expect(one("> [!CAUTION]")).toMatchObject({ data: { tone: "risk", title: "Caution" } });
  });

  test("a plain quote stays Markdown", () => {
    expect(one("> just a quote\n> more")).toEqual({ type: "markdown", text: "> just a quote\n> more" });
  });
});

describe("parse: existing blocks keep their schema", () => {
  test("mermaid and diff carry their source", () => {
    expect(data("mermaid", "graph TD\n  A --> B")).toEqual({ source: "graph TD\n  A --> B" });
    expect(data("diff", "@@ a @@\n-old\n+new")).toEqual({ source: "@@ a @@\n-old\n+new" });
    expect(error("mermaid", "  ")).toBe("the diagram is empty");
  });

  test("cards: a list, or a mapping with `cards`", () => {
    expect(data("cards", "- {title: X, tone: ok, body: '**1**'}\n- title: Y")).toEqual({
      cards: [
        { title: "X", tone: "ok", body: "**1**" },
        { title: "Y", tone: undefined, body: undefined },
      ],
    });
    expect(data("cards", "cards:\n  - {title: Z}")).toMatchObject({ cards: [{ title: "Z" }] });
    expect(error("cards", "- just text")).toBe("each card must be a mapping");
  });

  test("options: recommended as true or a label; pros and cons as a list or `;` text", () => {
    expect(
      data(
        "options",
        "- title: A\n  recommended: true\n  pros: [快, '有 ; 分號']\n  cons: 貴; 慢\n  body: 說明\n- title: B\n  recommended: 建議",
      ),
    ).toEqual({
      options: [
        { title: "A", recommended: true, body: "說明", pros: ["快", "有 ; 分號"], cons: ["貴", "慢"] },
        { title: "B", recommended: "建議", body: undefined, pros: [], cons: [] },
      ],
    });
    expect(error("options", "title: not a list")).toBe("expected a YAML list, or a mapping with a `options` list");
  });

  test("form: names, types, choices, other", () => {
    const form = data(
      "form",
      [
        "title: 決定",
        "submit: 送出",
        "questions:",
        "  - name: s",
        "    label: 哪個？",
        "    required: true",
        "    other: 另填",
        "    choices: [A, {value: b, label: 'B <x>', note: n, recommended: 建議}]",
        "  - label: 補充",
        "  - {label: m, type: multi, other: false, choices: x; y}",
      ].join("\n"),
    );
    expect(form).toEqual({
      title: "決定",
      submit: "送出",
      questions: [
        {
          name: "s",
          label: "哪個？",
          type: "single",
          hint: undefined,
          required: true,
          other: "另填",
          choices: [
            { value: "A", label: "A", note: undefined, recommended: undefined },
            { value: "b", label: "B <x>", note: "n", recommended: "建議" },
          ],
        },
        { name: "補充", label: "補充", type: "text", hint: undefined, required: false, other: false, choices: [] },
        {
          name: "m",
          label: "m",
          type: "multi",
          hint: undefined,
          required: false,
          other: false,
          choices: [
            { value: "x", label: "x", note: undefined, recommended: undefined },
            { value: "y", label: "y", note: undefined, recommended: undefined },
          ],
        },
      ],
    });
  });

  test("form: a bare list of questions; a choice question has the Other box unless `other: false`", () => {
    expect(data("form", "- {label: q, choices: [a]}")).toMatchObject({ questions: [{ name: "q", other: true }] });
    expect(data("form", "- {label: q, other: false, choices: [a]}")).toMatchObject({ questions: [{ other: false }] });
    expect(error("form", "- {hint: x}")).toBe("each question needs a name or a label");
    expect(error("form", "- {label: q, type: radio}")).toBe("type must be one of single, multi, text");
  });

  test("review: item names A, B, C... unless named; a bare path is an image; pick", () => {
    expect(
      data(
        "review",
        "title: 首頁\npick: 最喜歡\ncolumns: 2\nitems:\n  - {name: A, label: 深色, image: a.png}\n  - {page: proto/b.html, height: 600}\n  - body: '**元件**'",
      ),
    ).toEqual({
      title: "首頁",
      submit: undefined,
      pick: "最喜歡",
      columns: 2,
      items: [
        { name: "A", label: "深色", image: "a.png", page: undefined, height: undefined, body: undefined },
        { name: "B", label: undefined, image: undefined, page: "proto/b.html", height: 600, body: undefined },
        { name: "C", label: undefined, image: undefined, page: undefined, height: undefined, body: "**元件**" },
      ],
    });
    expect(data("review", "pick: true\nitems: [a.png, b.png]")).toMatchObject({
      pick: true,
      items: [
        { name: "A", image: "a.png" },
        { name: "B", image: "b.png" },
      ],
    });
  });

  test("review: names a named item claims are skipped, and repeats get a number", () => {
    const review = data("review", "- {name: A}\n- {}\n- {name: B}\n- {name: A}") as { items: { name: string }[] };
    expect(review.items.map((item) => item.name)).toEqual(["A", "C", "B", "A2"]);
  });
});

describe("parse: new blocks", () => {
  test("mindmap: the first item is the root", () => {
    expect(data("mindmap", "- Root\n  - A\n    - A1\n  - B\n    - B1\n    - B2")).toEqual({
      root: {
        text: "Root",
        children: [
          { text: "A", children: [{ text: "A1", children: [] }] },
          {
            text: "B",
            children: [
              { text: "B1", children: [] },
              { text: "B2", children: [] },
            ],
          },
        ],
      },
    });
    expect(data("mindmap", "* Root\n\t* tab child")).toMatchObject({ root: { children: [{ text: "tab child" }] } });
    expect(error("mindmap", "- A\n- B")).toBe("a mindmap has one root: indent the other top-level items under it");
    expect(error("mindmap", "just text")).toBe("not a list item: just text");
  });

  test("suggest: strings or {label, text}", () => {
    expect(data("suggest", "- Yes\n- {label: Later, text: 'Not now'}\n- {text: only text}")).toEqual({
      items: [
        { label: "Yes", text: "Yes" },
        { label: "Later", text: "Not now" },
        { label: "only text", text: "only text" },
      ],
    });
    expect(error("suggest", "- {note: x}")).toBe("each suggestion needs a label or a text");
  });

  test("checklist: items as strings or {name, label, checked, note}", () => {
    expect(
      data("checklist", "title: T\nsubmit: Go\nitems:\n  - plain\n  - {name: n, label: L, checked: true, note: why}"),
    ).toEqual({
      title: "T",
      submit: "Go",
      items: [
        { name: "plain", label: "plain", checked: false, note: undefined },
        { name: "n", label: "L", checked: true, note: "why" },
      ],
    });
    expect(error("checklist", "- {label: a, checked: yes please}")).toBe("checked must be true or false");
  });

  test("table: columns, rows as lists or mappings, sort, filter", () => {
    expect(
      data(
        "table",
        "columns:\n  - name\n  - {name: n, label: Count, type: number}\n  - {name: d, type: date, align: center}\nrows:\n  - [a, 1, 2026-01-02]\n  - {name: b, n: 2}\nsort: -n\nfilter: true",
      ),
    ).toEqual({
      columns: [
        { name: "name", label: "name", align: "left", type: "text" },
        { name: "n", label: "Count", align: "right", type: "number" },
        { name: "d", label: "d", align: "center", type: "date" },
      ],
      rows: [
        ["a", 1, "2026-01-02"],
        ["b", 2, null],
      ],
      sort: { column: 1, direction: "desc" },
      filter: true,
    });
  });

  test("table: without columns the keys of mapping rows name them; sort may be a mapping", () => {
    expect(
      data("table", "rows:\n  - {a: 1, b: 2}\n  - {b: 3, c: 4}\nsort: {column: b, direction: desc}"),
    ).toMatchObject({
      columns: [{ name: "a" }, { name: "b" }, { name: "c" }],
      rows: [
        [1, 2, null],
        [null, 3, 4],
      ],
      sort: { column: 1, direction: "desc" },
      filter: false,
    });
    expect(error("table", "rows: [[a]]")).toBe("a table needs `columns`, or rows written as mappings");
    expect(error("table", "columns: [a]\nrows: [[1, 2]]")).toBe("a row has 2 cells for 1 columns");
    expect(error("table", "columns: [a]\nrows: [[1]]\nsort: z")).toBe("sort names no column: z");
  });

  test("steps: status defaults to todo; a string is a title", () => {
    expect(data("steps", "items:\n  - {title: A, status: done, when: Mon, body: b}\n  - B")).toEqual({
      items: [
        { title: "A", status: "done", when: "Mon", body: "b" },
        { title: "B", status: "todo", when: undefined, body: undefined },
      ],
    });
    expect(error("steps", "- {title: A, status: stuck}")).toBe("status must be one of done, doing, todo, blocked");
  });

  test("stats: label and value are required; numbers become text", () => {
    expect(
      data("stats", "- {label: Users, value: 1204, delta: +4%, tone: ok, note: n}\n- {label: Zero, value: 0}"),
    ).toEqual({
      items: [
        { label: "Users", value: "1204", delta: "+4%", tone: "ok", note: "n" },
        { label: "Zero", value: "0", delta: undefined, tone: undefined, note: undefined },
      ],
    });
    expect(error("stats", "- {label: A}")).toBe("a stat's value is required");
  });
});

describe("parse: invalid YAML", () => {
  test("becomes an invalid segment with the source and the first line of the reason", () => {
    const segment = one("```form\nquestions: [unclosed\n```\n");
    expect(segment).toEqual({
      type: "invalid",
      kind: "form",
      source: "questions: [unclosed",
      error: "Flow sequence in block collection must be sufficiently indented and end with a ] at line 1, column 21",
    });
  });

  test("an empty block and duplicate keys are invalid too", () => {
    expect(error("cards", "")).toBe("expected a YAML list, or a mapping with a `cards` list");
    expect(error("stats", "- {label: a, label: b, value: 1}")).toMatch(/^Map keys must be unique/);
  });

  test("text fields must be text", () => {
    expect(error("cards", "- {title: [a, b]}")).toBe("title must be text");
  });
});
