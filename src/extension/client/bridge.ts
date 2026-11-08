import type { Answer } from "../../core/types.ts";

/** The origin of a sandboxed frame without `allow-same-origin`. */
export const OPAQUE_ORIGIN = "null";

/** The longest passage a frame may quote; the frame cuts to it and the host cuts again, since the frame is not trusted. */
export const MAX_SELECTION = 2000;

export interface FrameAnswer {
  answerId: string;
  answer: Answer;
}

/**
 * The answer a message carries, when the host page should take it: it came from the page's own frame (not from
 * another window), from that frame's opaque origin, and has the shape the frame hook sends. The server checks the
 * answer's own shape.
 */
export function frameAnswer(
  event: { source: unknown; origin: string; data: unknown },
  frameWindow: unknown,
): FrameAnswer | undefined {
  if (!frameWindow || event.source !== frameWindow || event.origin !== OPAQUE_ORIGIN) return undefined;
  const data = event.data as { source?: unknown; type?: unknown; answerId?: unknown; answer?: unknown } | null;
  if (data?.source !== "pbs-frame" || data.type !== "answer") return undefined;
  if (typeof data.answerId !== "string" || !data.answerId) return undefined;
  if (typeof data.answer !== "object" || data.answer === null) return undefined;
  return { answerId: data.answerId, answer: data.answer as Answer };
}

export interface FrameSelection {
  /** The selected text; empty when the selection was cleared. */
  text: string;
  /** Where the selection starts, in the frame's own viewport. */
  top?: number;
  left?: number;
}

/**
 * The selection a message reports, when the host page should take it: it came from the page's own frame, from that
 * frame's opaque origin, and has the shape the frame hook sends. The text is cut to `MAX_SELECTION`; a position that
 * is not a finite number is dropped.
 */
export function frameSelection(
  event: { source: unknown; origin: string; data: unknown },
  frameWindow: unknown,
): FrameSelection | undefined {
  if (!frameWindow || event.source !== frameWindow || event.origin !== OPAQUE_ORIGIN) return undefined;
  const data = event.data as { source?: unknown; type?: unknown; text?: unknown; top?: unknown; left?: unknown } | null;
  if (data?.source !== "pbs-frame" || data.type !== "selection" || typeof data.text !== "string") return undefined;
  const selection: FrameSelection = { text: data.text.slice(0, MAX_SELECTION) };
  if (typeof data.top === "number" && Number.isFinite(data.top)) selection.top = data.top;
  if (typeof data.left === "number" && Number.isFinite(data.left)) selection.left = data.left;
  return selection;
}
