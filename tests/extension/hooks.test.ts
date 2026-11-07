import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { BLOCK_KINDS } from "../../src/core/types.ts";
import { AUTO_OPEN_ENV } from "../../src/extension/index.ts";
import { DESCRIPTION } from "../../src/extension/tool.ts";
import { setup } from "./fixture.ts";

const SPEC = "docs/specs/2026-11-07-x/spec.md";
const FILES = {
  [SPEC]: "# Spec\n\nStatus: proposed\n",
  "docs/specs/2026-11-07-x/decision.md": "# D",
  "n.md": "one\ntwo\n",
};

describe("the show_doc tool", () => {
  test("is registered under the name pi-herdr-doc-review used, with the same parameters", () => {
    const t = setup({ files: FILES });
    const tool = t.tools[0] as unknown as {
      name: string;
      parameters: { properties: Record<string, unknown>; required: string[] };
    };
    expect(tool.name).toBe("show_doc");
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(["paths", "reason", "view"]);
    expect(tool.parameters.required.sort()).toEqual(["paths", "reason"]);
  });

  test("its description names every block kind, the views, and the sandboxed pages", () => {
    for (const word of [
      "[!NOTE]",
      "```mermaid",
      "```diff",
      "```cards",
      "```options",
      "```form",
      "```review",
      "```mindmap",
      "```suggest",
      "```checklist",
      "```table",
      "```steps",
      "```stats",
      'view "page"',
      'view "edit"',
      "PI_BETTER_SHOW_EDITOR",
      "cgi-bin:pi-answer",
      "pi-kit",
      "feedback panel",
      ".tsx",
    ]) {
      expect(DESCRIPTION).toContain(word);
    }
    for (const kind of BLOCK_KINDS)
      expect(DESCRIPTION.toLowerCase()).toContain(kind === "alert" ? "alert" : `\`\`\`${kind}`);
    expect(DESCRIPTION).not.toMatch(/herdr|nvim|chawan|terminal-browser/i);
  });

  test("returns at once with what it opened, and sends the agent nothing", async () => {
    const t = setup({ files: FILES });
    const tool = t.tools[0] as unknown as {
      execute: (...args: unknown[]) => Promise<{ content: { text: string }[]; details: { opened: string[] } }>;
    };
    const ctx = { cwd: t.root, hasUI: true, isIdle: () => true, ui: { notify: () => {} } };
    const result = await tool.execute(
      "call-1",
      { paths: ["n.md"], reason: "Read", view: "page" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.details.opened).toEqual(["n.md"]);
    expect(result.content[0]?.text).toContain("returned without waiting for the user");
    expect(t.opened).toHaveLength(1);
    expect(t.sent).toHaveLength(0);
  });
});

describe("hooks", () => {
  const written = (t: ReturnType<typeof setup>, path: string, toolName = "write", isError = false) =>
    t.fire(
      "tool_result",
      { toolName, input: { path }, isError },
      { cwd: t.root, hasUI: true, isIdle: () => true, ui: { notify: () => {} } },
    );

  test("a proposed Mini SDD spec opens its phase files in the browser on its own, once", async () => {
    const t = setup({ files: FILES });
    await written(t, SPEC);
    expect(t.opened).toHaveLength(2);
    expect(lists(t)).toEqual(["decision.md", "spec.md"]);
    await written(t, SPEC);
    expect(t.opened).toHaveLength(2);
  });

  test("does not open anything when the write failed, there is no UI, or it is switched off", async () => {
    const t = setup({ files: FILES });
    await written(t, SPEC, "write", true);
    await t.fire(
      "tool_result",
      { toolName: "write", input: { path: SPEC }, isError: false },
      { cwd: t.root, hasUI: false },
    );
    expect(t.opened).toHaveLength(0);
    process.env[AUTO_OPEN_ENV] = "off";
    try {
      await written(t, SPEC);
    } finally {
      delete process.env[AUTO_OPEN_ENV];
    }
    expect(t.opened).toHaveLength(0);
    await written(t, "n.md");
    expect(t.opened).toHaveLength(0);
  });

  test("a failure to open is a warning, not an error in the agent's write", async () => {
    const t = setup({ files: FILES });
    const notices: [string, string][] = [];
    const ctx = {
      cwd: t.root,
      hasUI: true,
      isIdle: () => true,
      ui: { notify: (...args: [string, string]) => notices.push(args) },
    };
    // The spec's folder holds a file that cannot be read.
    await t.fire(
      "tool_result",
      { toolName: "write", input: { path: `${t.root}/docs/specs/2026-11-07-x/spec.md` }, isError: false },
      ctx,
    );
    expect(notices).toEqual([]);
  });

  test("tool_call and tool_result keep the agent's own writes out of the user's edits", async () => {
    const t = setup({ files: FILES, installed: ["code"] });
    await t.show.show(t.root, ["n.md"], "r");
    const ctx = { cwd: t.root, hasUI: true, isIdle: () => true, ui: { notify: () => {} } };
    await t.fire("tool_call", { toolName: "edit", input: { path: "n.md" } }, ctx);
    t.save("n.md", "one\ntwo\nagent\n");
    expect(t.sent).toHaveLength(0);
    await t.fire("tool_result", { toolName: "edit", input: { path: "n.md" }, isError: false }, ctx);
    t.save("n.md", "one\ntwo\nagent\n");
    expect(t.sent).toHaveLength(0);
    await t.fire("tool_call", { toolName: "bash", input: { command: "sed -i s/one/1/ n.md" } }, ctx);
    writeFileSync(t.path("n.md"), "1\ntwo\nagent\n");
    t.save("n.md", "1\ntwo\nagent\n");
    await t.fire("tool_result", { toolName: "bash", input: { command: "x" }, isError: false }, ctx);
    t.save("n.md", "1\ntwo\nagent\n");
    expect(t.sent).toHaveLength(0);
    t.save("n.md", "1\ntwo\nagent\nuser\n");
    expect(t.sent).toHaveLength(1);
  });

  test("the session end empties the list and ends the page server", async () => {
    const t = setup({ files: FILES });
    await t.show.show(t.root, ["n.md"], "r", "page");
    await t.fire("session_shutdown", {}, {});
    expect(lists(t)).toEqual([]);
    expect(t.show.server).toBeUndefined();
  });
});

function lists(t: ReturnType<typeof setup>): string[] {
  return [...t.show.docs.values()].map((doc) => doc.display.split("/").pop() as string);
}
