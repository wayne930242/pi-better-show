import type { Answer } from "../../core/types.ts";
import { configureElements } from "./host-config.ts";

export { encodeAnswer, inline, parse } from "../../core/index.ts";
/**
 * The `pi-kit` module of TSX pages: the React wrappers of every block element, `parse` and `encodeAnswer` from
 * the core, and `send`, which hands the agent an answer (or plain fields) through the page around the frame.
 */
export * from "../../react/index.ts";

configureElements();

interface Bridge {
  send: (
    input: Answer | Record<string, unknown> | Iterable<readonly [string, unknown]>,
  ) => Promise<{ accepted: boolean; reason?: string }>;
}

/** Sends an `Answer`, or an object or `[name, value]` pairs as a form answer. Resolves with whether the agent took it. */
export const send: Bridge["send"] = (input) => {
  const bridge = (window as unknown as { piBetterShow?: Bridge }).piBetterShow;
  if (!bridge) return Promise.resolve({ accepted: false, reason: "this page is not shown through show_doc" });
  return bridge.send(input);
};
