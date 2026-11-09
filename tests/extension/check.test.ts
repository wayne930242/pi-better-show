import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkText, hasBlockFence } from "../../src/extension/check.ts";
import { DESCRIPTION } from "../../src/extension/tool.ts";
import { setup } from "./fixture.ts";

/** The motivating file: an unquoted ` #` inside a flow map (line 8), and the same slip in block style (line 14). */
const BROKEN = [
  "# Questions",
  "",
  "```form",
  "questions:",
  "  - name: o5",
  "    label: q",
  "    choices:",
  "      - {value: yes, label: 要，跟 #客戶 一樣, recommended: true}",
  "      - {value: no, label: 不用}",
  "```",
  "",
  "```form",
  "questions:",
  "  - name: o6",
  "    choices:",
  "      - value: yes",
  "        label: 要，跟 #客戶 一樣",
  "```",
  "",
].join("\n");
const FILES = {
  "broken.md": BROKEN,
  "clean.md": "# A\n\n```options\n- {title: One}\n- {title: Two}\n```\n",
  "prose.md": "# Only prose # with hashes\n",
  "bad-diagram.md": "```mermaid\nnot a diagram\n```\n",
  "dir/nested.md": "```cards\n- {title: a, colour: red}\n```\n",
};

const FLOW =
  '- line 8 form: the form block is invalid and is shown as source: Flow map in block collection must be sufficiently indented and end with a }; quote any value that holds " #" or ": " (and commas inside {…})';
const CUT = `- line 17 form question "o6" choice 1 label (warning): a plain value ends at " #"`;

describe("checkText", () => {
  test("finds a block fence of every kind but alerts, and skips files without one", () => {
    expect(hasBlockFence("```form\n```")).toBe(true);
    expect(hasBlockFence("~~~tree\nroot/\n~~~")).toBe(true);
    expect(hasBlockFence("  ```Mermaid\n")).toBe(true);
    expect(hasBlockFence("```js\n```")).toBe(false);
    expect(hasBlockFence("```formal\n```")).toBe(false);
    expect(hasBlockFence("> [!NOTE]\n> x")).toBe(false);
  });

  test("returns nothing for a clean file and for prose", async () => {
    expect(await checkText("clean.md", FILES["clean.md"])).toBeUndefined();
    expect(await checkText("prose.md", FILES["prose.md"])).toBeUndefined();
  });

  test("words the motivating problems for the agent", async () => {
    const text = (await checkText("broken.md", BROKEN)) as string;
    expect(text.split("\n")[0]).toBe("Block problems in broken.md:");
    expect(text).toContain(FLOW);
    expect(text).toContain(CUT);
  });

  test("a diagram with a bad header is an error, found by the Mermaid renderer", async () => {
    const text = (await checkText("d.md", FILES["bad-diagram.md"])) as string;
    expect(text).toContain("- line 2 mermaid: the diagram will not draw: Invalid mermaid header");
  });
});

describe("show_doc names the block problems", () => {
  test("its description tells the agent about them", () => {
    expect(DESCRIPTION).toContain("Block problems");
    expect(DESCRIPTION).toContain("write or edit of a .md file");
  });

  test("a page view appends them after the usual text", async () => {
    const t = setup({ files: FILES });
    const result = await t.show.show(t.root, ["broken.md"], "Read", "page");
    expect(result.text.startsWith("Opened broken.md in the default browser")).toBe(true);
    expect(result.text).toContain("returned without waiting for the user.\n\nBlock problems in broken.md:\n");
    expect(result.text).toContain(FLOW);
    expect(result.text).toContain(CUT);
  });

  test("an edit view appends them too, after the feedback sentence", async () => {
    const t = setup({ files: FILES, editor: "my-editor", installed: ["my-editor"] });
    const result = await t.show.show(t.root, ["broken.md"], "Edit", "edit");
    expect(result.text).toContain(
      "Their saved edits will reach you as review feedback.\n\nBlock problems in broken.md:\n",
    );
  });

  test("several documents each get their own list, named as shown", async () => {
    const t = setup({ files: FILES });
    const result = await t.show.show(t.root, ["broken.md", "clean.md", "dir/nested.md"], "Read", "page");
    expect(result.text).toContain("Block problems in broken.md:");
    expect(result.text).toContain(
      'Block problems in dir/nested.md:\n- line 2 cards card 1 (warning): unknown key "colour"',
    );
    expect(result.text).not.toContain("clean.md:");
  });

  test("a document without problems leaves the text unchanged", async () => {
    const t = setup({ files: FILES });
    const result = await t.show.show(t.root, ["clean.md", "prose.md"], "Read", "page");
    expect(result.text).toBe(
      "Opened clean.md, prose.md in the default browser (one tab per page) and returned without waiting for the user.",
    );
  });

  test("the tool result carries the problems", async () => {
    const t = setup({ files: FILES });
    const tool = t.tools[0] as unknown as {
      execute: (...args: unknown[]) => Promise<{ content: { text: string }[] }>;
    };
    const ctx = { cwd: t.root, hasUI: true, isIdle: () => true, ui: { notify: () => {} } };
    const result = await tool.execute(
      "c",
      { paths: ["broken.md"], reason: "r", view: "page" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0]?.text).toContain(FLOW);
  });
});

describe("the write hook names the block problems", () => {
  const written = (t: ReturnType<typeof setup>, path: string, extra: Record<string, unknown> = {}) =>
    t.fire(
      "tool_result",
      {
        toolName: "write",
        input: { path },
        isError: false,
        content: [{ type: "text", text: "Successfully wrote" }],
        ...extra,
      },
      { cwd: t.root, hasUI: false, isIdle: () => true, ui: { notify: () => {} } },
    ) as Promise<{ content: { type: string; text: string }[] } | undefined>;

  test("a write of a Markdown file with broken blocks gets the list after its own text", async () => {
    const t = setup({ files: FILES });
    const result = await written(t, join(t.root, "broken.md"));
    expect(result?.content).toHaveLength(2);
    expect(result?.content[0]?.text).toBe("Successfully wrote");
    expect(result?.content[1]?.text).toContain("Block problems in broken.md:");
    expect(result?.content[1]?.text).toContain(FLOW);
  });

  test("an edit of a relative path is checked the same, and the file is read as it is now", async () => {
    const t = setup({ files: FILES });
    writeFileSync(join(t.root, "clean.md"), "```steps\n- {title: a, statuss: done}\n```\n");
    const result = await t.fire(
      "tool_result",
      { toolName: "edit", input: { path: "clean.md" }, isError: false, content: [{ type: "text", text: "ok" }] },
      { cwd: t.root, hasUI: false },
    );
    expect((result as { content: { text: string }[] }).content[1]?.text).toContain('unknown key "statuss"');
  });

  test("a clean file, a file without block fences, a non-Markdown file, and a failed write add nothing", async () => {
    const t = setup({ files: { ...FILES, "n.txt": "```form\n[oops\n```\n" } });
    expect(await written(t, join(t.root, "clean.md"))).toBeUndefined();
    expect(await written(t, join(t.root, "prose.md"))).toBeUndefined();
    expect(await written(t, join(t.root, "n.txt"))).toBeUndefined();
    expect(await written(t, join(t.root, "broken.md"), { isError: true })).toBeUndefined();
  });

  test("it adds the list when the UI is on too, and the Mini SDD follow-up still opens", async () => {
    const spec = "docs/specs/2026-11-07-x/spec.md";
    const t = setup({
      files: {
        [spec]: "Status: proposed\n\n```cards\n- {title: a, tone: ok, bogus: 1}\n```\n",
        "docs/specs/2026-11-07-x/decision.md": "# D",
      },
    });
    const result = (await t.fire(
      "tool_result",
      {
        toolName: "write",
        input: { path: join(t.root, spec) },
        isError: false,
        content: [{ type: "text", text: "ok" }],
      },
      { cwd: t.root, hasUI: true, isIdle: () => true, ui: { notify: () => {} } },
    )) as { content: { text: string }[] };
    expect(result.content[1]?.text).toContain("Block problems in docs/specs/2026-11-07-x/spec.md:");
    expect(t.opened.length).toBeGreaterThan(0);
  });

  test("the problem list of a document the session showed uses the name it was shown by", async () => {
    const t = setup({ files: FILES });
    await t.show.show(t.root, ["dir/nested.md"], "r", "page");
    const result = await written(t, join(t.root, "dir/nested.md"));
    expect(result?.content[1]?.text).toContain("Block problems in dir/nested.md:");
  });
});
