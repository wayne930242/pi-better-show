/**
 * `show_doc`: the pi extension of pi-better-show. It opens documents in the user's default browser (rendered
 * Markdown with interactive blocks, or an agent's HTML and TSX page in a sandboxed frame) or in their editor, and
 * carries what the user does there (answers, passage comments, saved edits) back to the agent as messages.
 * Other viewers read the same documents through pi's event bus, contract version 2 (`./contract.ts`).
 */

import { basename, isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ANSWER_EVENT,
  type BetterShow,
  createBetterShow,
  type Deps,
  DOCUMENTS_REQUEST_EVENT,
  defaultDeps,
} from "./controller.ts";
import { showDocTool } from "./tool.ts";

export * from "./contract.ts";
export { createBetterShow, type Deps, defaultDeps } from "./controller.ts";
export { createPageServer } from "./server.ts";

/** Set to `off` to stop a proposed Mini SDD spec from opening on its own. */
export const AUTO_OPEN_ENV = "PI_BETTER_SHOW_AUTO_OPEN";

/** Registers the tool, hooks, and bus listeners on `pi`, and returns the controller they drive. */
export function install(pi: ExtensionAPI, deps: Deps = defaultDeps()): BetterShow {
  const show = createBetterShow(pi, deps);

  pi.registerTool(showDocTool(show));
  pi.on("session_start", (_event, ctx) => show.setContext(ctx));

  const pathOf = (cwd: string, input: unknown): string | undefined => {
    const path = (input as { path?: unknown } | undefined)?.path;
    return typeof path === "string" ? deps.realpath(isAbsolute(path) ? path : resolve(cwd, path)) : undefined;
  };

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName === "bash") show.agentWillWrite(undefined);
    else if (event.toolName === "write" || event.toolName === "edit") {
      const path = pathOf(ctx.cwd, event.input);
      if (path) show.agentWillWrite(path);
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    show.setContext(ctx);
    if (event.toolName === "bash") return show.agentWrote(undefined);
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const path = pathOf(ctx.cwd, event.input);
    if (!path) return;
    show.agentWrote(path);
    if (event.isError || !ctx.hasUI || process.env[AUTO_OPEN_ENV] === "off") return;
    const followUp = show.miniSddFollowUp(path);
    if (followUp.length === 0) return;
    try {
      await show.show(
        ctx.cwd,
        followUp,
        basename(path) === "spec.md" ? "Spec proposed for approval" : `${basename(path)} written`,
        "page",
      );
    } catch (error) {
      ctx.ui.notify(`better-show could not open ${path}: ${(error as Error).message}`, "warning");
    }
  });

  const stopAnswers = pi.events.on(ANSWER_EVENT, show.onAnswer);
  const stopRequests = pi.events.on(DOCUMENTS_REQUEST_EVENT, show.onRequest);
  pi.on("session_shutdown", () => {
    stopAnswers();
    stopRequests();
    show.shutdown();
  });
  return show;
}

export default function betterShow(pi: ExtensionAPI): void {
  install(pi);
}
