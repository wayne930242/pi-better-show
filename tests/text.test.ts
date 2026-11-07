import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BLOCK_KINDS, DISPLAY_KINDS, parse, toText } from "../src/core/index.ts";

/**
 * Golden texts, one per block kind. Each was read by hand against the spec ("Core API": alert to bold title plus
 * quote, cards one line each, options numbered and starred, ...) before it went in; `line` must equal `plain`.
 */
const GOLDEN: { name: string; markdown: string; discord: string; plain: string }[] = [
  {
    name: "alert",
    markdown: "> [!TIP] 小技巧\n> 先 **備份**\n> 再動手\n",
    discord: "**小技巧**\n> 先 **備份**\n> 再動手",
    plain: "小技巧\n> 先 備份\n> 再動手",
  },
  {
    name: "alertBare",
    markdown: "> [!CAUTION]\n",
    discord: "**Caution**",
    plain: "Caution",
  },
  {
    name: "mermaid",
    markdown: "```mermaid\ngraph TD\n  A --> B\n```\n",
    discord: "```\ngraph TD\n  A --> B\n```\n(The web view shows this diagram drawn.)",
    plain: "  graph TD\n    A --> B\n(The web view shows this diagram drawn.)",
  },
  {
    name: "diff",
    markdown: "```diff\n@@ -1 +1 @@\n-old\n+new\n```\n",
    discord: "```diff\n@@ -1 +1 @@\n-old\n+new\n```",
    plain: "@@ -1 +1 @@\n-old\n+new",
  },
  {
    name: "cards",
    markdown:
      '```cards\n- {title: Speed, tone: ok, body: "**2x**\\nfaster"}\n- {body: only body}\n- {title: only title}\n```\n',
    discord: "• **Speed**: **2x** faster\n• only body\n• **only title**",
    plain: "• Speed: 2x faster\n• only body\n• only title",
  },
  {
    name: "options",
    markdown:
      '```options\n- {title: A, recommended: 最推薦, body: 說明, pros: "快; 簡單", cons: [貴]}\n- {body: no title}\n```\n',
    discord:
      "1. **A** ★ 最推薦 — 說明\n   + 快\n   + 簡單\n   − 貴\n2. **Option 2** — no title\n\nReply with a number.",
    plain: "1. A ★ 最推薦 - 說明\n   + 快\n   + 簡單\n   − 貴\n2. Option 2 - no title\n\nReply with a number.",
  },
  {
    name: "form",
    markdown:
      "```form\ntitle: 決定\nquestions:\n  - {name: s, label: 哪個？, required: true, hint: 選一個, choices: [A, {value: b, label: B, note: 較慢, recommended: true}]}\n  - {label: 多選, type: multi, other: false, choices: [x, y]}\n  - {label: 補充}\n```\n",
    discord:
      "**決定**\n1. **哪個？** (required)\n   選一個\n   a) A\n   b) B ★ — 較慢\n   or write your own answer\n2. **多選** (pick any)\n   a) x\n   b) y\n3. **補充**\n\nReply in text, one line per question, like `1: b`.",
    plain:
      "決定\n1. 哪個？ (required)\n   選一個\n   a) A\n   b) B ★ - 較慢\n   or write your own answer\n2. 多選 (pick any)\n   a) x\n   b) y\n3. 補充\n\nReply in text, one line per question, like 1: b.",
  },
  {
    name: "review",
    markdown:
      '```review\ntitle: 首頁\npick: 最喜歡\nitems:\n  - {name: A, label: 深色, image: a.png, body: "**好**"}\n  - {page: proto/b.html}\n```\n',
    discord:
      "**首頁**\n1. **A (深色)** — **好**\n   image: a.png\n2. **B**\n   page: proto/b.html\n\nReply with a comment for each item, naming the item. Say which one you pick (最喜歡).",
    plain:
      "首頁\n1. A (深色) - 好\n   image: a.png\n2. B\n   page: proto/b.html\n\nReply with a comment for each item, naming the item. Say which one you pick (最喜歡).",
  },
  {
    name: "mindmap",
    markdown: "```mindmap\n- 根\n  - 枝一\n    - 葉\n  - 枝二\n```\n",
    discord: "**根**\n- 枝一\n  - 葉\n- 枝二",
    plain: "根\n- 枝一\n  - 葉\n- 枝二",
  },
  {
    name: "suggest",
    markdown: "```suggest\n- 好\n- {label: 等等, text: 明天再說}\n```\n",
    discord: "You can reply: 好 | 等等",
    plain: "You can reply: 好 | 等等",
  },
  {
    name: "checklist",
    markdown:
      "```checklist\ntitle: 上線前\nitems:\n  - {label: 跑測試, checked: true}\n  - {label: 升版, note: semver}\n```\n",
    discord: "**上線前**\n☑ 跑測試\n☐ 升版 — semver",
    plain: "上線前\n☑ 跑測試\n☐ 升版 - semver",
  },
  {
    name: "table",
    markdown:
      "```table\ncolumns: [name, {name: n, label: 數量, type: number}]\nrows:\n  - [a, 1]\n  - [b, null]\n```\n",
    discord: "• name: a · 數量: 1\n• name: b",
    plain: "• name: a · 數量: 1\n• name: b",
  },
  {
    name: "steps",
    markdown:
      "```steps\nitems:\n  - {title: 設計, status: done, when: 週一}\n  - {title: 開發, status: doing, body: 進行中}\n  - {title: 上線, status: blocked}\n  - 驗收\n```\n",
    discord: "1. ✓ **設計** (週一)\n2. ▶ **開發**\n   進行中\n3. ✕ **上線**\n4. ○ **驗收**",
    plain: "1. ✓ 設計 (週一)\n2. ▶ 開發\n   進行中\n3. ✕ 上線\n4. ○ 驗收",
  },
  {
    name: "stats",
    markdown: "```stats\n- {label: 使用者, value: 1204, delta: +4%}\n- {label: 錯誤, value: 3, note: 一小時內}\n```\n",
    discord: "**使用者**: 1204 (+4%)\n**錯誤**: 3 — 一小時內",
    plain: "使用者: 1204 (+4%)\n錯誤: 3 - 一小時內",
  },
  {
    name: "invalid",
    markdown: "```form\nquestions: [unclosed\n```\n",
    discord: "```\nquestions: [unclosed\n```",
    plain: "  questions: [unclosed",
  },
  {
    name: "invalidShape",
    markdown: "```table\nrows: x\n```\n",
    discord: "```\nrows: x\n```",
    plain: "  rows: x",
  },
];

describe("toText: every block kind in every flavor", () => {
  for (const golden of GOLDEN) {
    test(golden.name, () => {
      const segments = parse(golden.markdown);
      expect(toText(segments, { flavor: "discord" })).toBe(golden.discord);
      expect(toText(segments, { flavor: "plain" })).toBe(golden.plain);
      expect(toText(segments, { flavor: "line" })).toBe(golden.plain);
    });
  }

  test("the golden set covers every block kind", () => {
    const covered = new Set(
      GOLDEN.flatMap((golden) => parse(golden.markdown).flatMap((s) => (s.type === "block" ? [s.kind] : []))),
    );
    expect([...covered].sort()).toEqual([...BLOCK_KINDS].sort());
  });
});

describe("toText: documents", () => {
  const document = readFileSync(new URL("./fixtures/all-blocks.md", import.meta.url), "utf8");

  test("a Discord document with every block kind leaves no fence of a block kind", () => {
    const segments = parse(document);
    const kinds = new Set(segments.flatMap((s) => (s.type === "block" ? [s.kind] : [])));
    expect([...kinds].sort()).toEqual([...BLOCK_KINDS].sort());
    for (const flavor of ["discord", "line", "plain"] as const) {
      const text = toText(segments, { flavor });
      // `diff` is the one block kind Discord draws natively; the spec keeps it unchanged there.
      const fenced = [...text.matchAll(/^ {0,3}(?:`{3,}|~{3,})[ \t]*([^\s`]*)/gm)].map((m) => m[1]?.toLowerCase());
      const left = fenced.filter(
        (language) => language && language !== "diff" && (BLOCK_KINDS as readonly string[]).includes(language),
      );
      expect(left).toEqual([]);
      if (flavor !== "discord") expect(text).not.toContain("```");
    }
  });

  test("prose is kept for Discord and loses its markers for LINE", () => {
    const segments = parse("# Title\n\nSee **this** and [docs](https://x.dev/a).\n\n```js\nlet a = **1**;\n```\n");
    expect(toText(segments, { flavor: "discord" })).toBe(
      "# Title\n\nSee **this** and [docs](https://x.dev/a).\n\n```js\nlet a = **1**;\n```",
    );
    expect(toText(segments, { flavor: "line" })).toBe(
      "Title\n\nSee this and docs (https://x.dev/a).\n\n  let a = **1**;",
    );
  });

  test("segments join with one blank line, and an empty block adds none", () => {
    const text = toText(parse("a\n\n```suggest\n[]\n```\n\nb\n"), { flavor: "plain" });
    expect(text).toBe("a\n\nb");
  });
});

describe("toText: invalid blocks", () => {
  test("keep their source in a code block, and no block-kind fence", () => {
    const segments = parse("before\n\n```form\nquestions: [oops\n```\n\nafter\n");
    expect(segments.map((s) => s.type)).toEqual(["markdown", "invalid", "markdown"]);
    const discord = toText(segments, { flavor: "discord" });
    expect(discord).toBe("before\n\n```\nquestions: [oops\n```\n\nafter");
    expect(toText(segments, { flavor: "plain" })).toBe("before\n\n  questions: [oops\n\nafter");
  });

  test("a source that holds backticks gets a longer fence", () => {
    const text = toText(parse("````table\nrows: ```\n````\n"), { flavor: "discord" });
    expect(text).toBe("````\nrows: ```\n````");
  });
});

describe("toText: mermaid", () => {
  const source = "```mermaid\ngraph TD\n  A --> B\n```\n";
  const fallback = "```\ngraph TD\n  A --> B\n```\n(The web view shows this diagram drawn.)";

  test("with no hook: the source in a plain fence and a pointer to the web view", () => {
    expect(toText(parse(source), { flavor: "discord" })).toBe(fallback);
  });

  test("with a hook: the drawing in a code block", () => {
    const drawn = "┌───┐\n│ A │\n└───┘";
    const text = toText(parse(source), { flavor: "discord", mermaid: () => drawn });
    expect(text).toBe(`\`\`\`\n${drawn}\n\`\`\``);
    expect(toText(parse(source), { flavor: "plain", mermaid: () => drawn })).toBe("  ┌───┐\n  │ A │\n  └───┘");
  });

  test("the hook gets the source and the width; the default width is 60", () => {
    const calls: [string, number][] = [];
    const hook = (code: string, width: number) => {
      calls.push([code, width]);
      return undefined;
    };
    expect(toText(parse(source), { flavor: "discord", mermaid: hook })).toBe(fallback);
    toText(parse(source), { flavor: "discord", width: 30, mermaid: hook });
    expect(calls).toEqual([
      ["graph TD\n  A --> B", 60],
      ["graph TD\n  A --> B", 30],
    ]);
  });

  test("a drawing wider than the width is never shown, even when the hook returns it", () => {
    const wide = "x".repeat(61);
    expect(toText(parse(source), { flavor: "discord", mermaid: () => wide })).toBe(fallback);
    expect(toText(parse(source), { flavor: "discord", width: 61, mermaid: () => wide })).toBe(
      `\`\`\`\n${wide}\n\`\`\``,
    );
    // Width counts terminal cells: three wide characters take six.
    expect(toText(parse(source), { flavor: "discord", width: 5, mermaid: () => "開始吧" })).toBe(fallback);
  });
});

describe("toText: table and options details", () => {
  test("a table is cut after 20 rows with a count", () => {
    const rows = Array.from({ length: 23 }, (_, i) => `  - [r${i + 1}]`).join("\n");
    const text = toText(parse(`\`\`\`table\ncolumns: [k]\nrows:\n${rows}\n\`\`\`\n`), { flavor: "plain" });
    const lines = text.split("\n");
    expect(lines).toHaveLength(21);
    expect(lines[19]).toBe("• k: r20");
    expect(lines[20]).toBe("… 3 more rows");
    const one = toText(
      parse(
        `\`\`\`table\ncolumns: [k]\nrows:\n${Array.from({ length: 21 }, (_, i) => `  - [r${i + 1}]`).join("\n")}\n\`\`\`\n`,
      ),
      {
        flavor: "plain",
      },
    );
    expect(one.split("\n").at(-1)).toBe("… 1 more row");
  });

  test("a table opens sorted by its sort column", () => {
    const text = toText(
      parse(
        "```table\ncolumns: [n, {name: v, type: number}]\nrows: [[a, 2], [b, 10], [c, null], [d, 1]]\nsort: -v\n```\n",
      ),
      {
        flavor: "plain",
      },
    );
    expect(text).toBe("• n: b · v: 10\n• n: a · v: 2\n• n: d · v: 1\n• n: c");
  });
});

describe("raw and keep", () => {
  const ALERT = "> [!TIP] 小技巧\n> 先 **備份**\n> 再動手";
  const FENCES: Record<string, string> = {
    mermaid: "```mermaid\ngraph TD\n  A --> B\n```",
    diff: "```diff\n@@ -1 +1 @@\n-old\n+new\n```",
    cards: "```cards\n- {title: Speed, tone: ok}\n```",
    table: "```table\ncolumns: [a]\nrows:\n  - [1]\n```",
    stats: "```stats\n- {label: Users, value: 1}\n```",
  };
  const kept = (markdown: string) =>
    parse(markdown).map((segment) => (segment.type === "markdown" ? undefined : segment.raw));

  test("every valid block carries its exact original text", () => {
    for (const raw of Object.values(FENCES))
      expect(kept(`intro\n\n${raw}\n\noutro`)).toEqual([undefined, raw, undefined]);
    expect(kept(`intro\n\n${ALERT}\n\noutro`)).toEqual([undefined, ALERT, undefined]);
  });

  test("an indented, tilde-fenced or unclosed block keeps its text", () => {
    const tilde = "~~~stats\n- {label: Users, value: 1}\n~~~";
    expect(kept(tilde)).toEqual([tilde]);
    const indented = "  ```mermaid\n  graph TD\n  ```";
    expect(kept(indented)).toEqual([indented]);
    const open = "```stats\n- {label: Users, value: 1}";
    expect(kept(open)).toEqual([open]);
  });

  test("an invalid block carries its exact original text", () => {
    const bad = "```cards\n- [unclosed\n```";
    const [segment] = parse(bad);
    expect(segment?.type).toBe("invalid");
    expect(kept(bad)).toEqual([bad]);
  });

  test("keep round-trips the fixture byte for byte", () => {
    const md = readFileSync(new URL("./fixtures/all-blocks.md", import.meta.url), "utf8").trimEnd();
    expect(toText(parse(md), { flavor: "discord", keep: BLOCK_KINDS })).toBe(md);
  });

  test("keep emits an invalid block of a kept kind as raw, and converts the rest", () => {
    const bad = "```cards\n- [unclosed\n```";
    const md = `${bad}\n\n${ALERT}\n\n${FENCES.stats}`;
    const text = toText(parse(md), { flavor: "plain", keep: ["cards", "stats"] });
    expect(text).toBe(`${bad}\n\n小技巧\n> 先 備份\n> 再動手\n\n${FENCES.stats}`);
  });

  test("DISPLAY_KINDS lists the display kinds", () => {
    expect(DISPLAY_KINDS).toEqual(["alert", "cards", "mermaid", "mindmap", "diff", "table", "steps", "stats"]);
  });
});
