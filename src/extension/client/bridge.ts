import type { Answer } from "../../core/types.ts";

/** The origin of a sandboxed frame without `allow-same-origin`. */
export const OPAQUE_ORIGIN = "null";

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
