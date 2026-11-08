import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentTool, agentLoop } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { setup } from "./fixture.ts";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const reply = (content: AssistantMessage["content"], stopReason: "toolUse" | "stop"): AssistantMessage => ({
  role: "assistant",
  content,
  api: "faux",
  provider: "faux",
  model: "faux",
  usage,
  stopReason,
  timestamp: Date.now(),
});

describe("show_doc beside a write in the same assistant message", () => {
  test("opens the file the write creates, whether the path is absolute or relative", async () => {
    for (const absolute of [true, false]) {
      const t = setup({ files: {} });
      const target = absolute ? t.path("new.md") : "new.md";
      // A write that takes a moment, as a real one does, issued before show_doc in the same message.
      const write: AgentTool = {
        name: "write",
        label: "write",
        description: "write",
        parameters: Type.Object({ path: Type.String() }),
        execute: async () => {
          await Bun.sleep(40);
          writeFileSync(t.path("new.md"), "# New\n");
          return { content: [{ type: "text", text: "wrote" }], details: {} };
        },
      };
      const showDoc = t.tools[0] as unknown as AgentTool & {
        execute: (...args: unknown[]) => Promise<{ content: { text: string }[] }>;
      };
      const results: string[] = [];
      let turn = 0;
      const stream = agentLoop(
        [{ role: "user", content: "go", timestamp: Date.now() }],
        {
          messages: [],
          tools: [
            write,
            {
              ...showDoc,
              execute: (id: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) =>
                showDoc.execute(id, params, signal, onUpdate, { cwd: t.root, hasUI: false, isIdle: () => true }),
            } as AgentTool,
          ],
        },
        {
          model: { id: "faux", api: "faux", provider: "faux" } as never,
          convertToLlm: (messages) => messages as never,
        },
        undefined,
        () => {
          const out = createAssistantMessageEventStream();
          const message =
            turn++ === 0
              ? reply(
                  [
                    { type: "toolCall", id: "w", name: "write", arguments: { path: target } },
                    {
                      type: "toolCall",
                      id: "s",
                      name: "show_doc",
                      arguments: { paths: [target], reason: "r", view: "page" },
                    },
                  ],
                  "toolUse",
                )
              : reply([{ type: "text", text: "done" }], "stop");
          queueMicrotask(() => out.push({ type: "done", reason: message.stopReason, message } as never));
          return out;
        },
      );
      for await (const event of stream) {
        if (event.type === "tool_execution_end" && event.toolName === "show_doc") {
          results.push((event.result as { content: { text: string }[] }).content[0]?.text ?? "");
        }
      }
      expect(existsSync(join(t.root, "new.md"))).toBe(true);
      expect(results[0]).toContain("Opened new.md");
    }
  }, 30_000);
});
