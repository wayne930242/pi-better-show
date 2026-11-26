import type { Answer } from "../../core/types.ts";
import { diagramQuote, diagramRef, requoteDiagram } from "./diagram-map.ts";
import { answerText, failureReason, showFailure } from "./fallback.ts";
import { type FeedbackWords, mountFeedback } from "./feedback.ts";
import type { AnswerReply } from "./host-config.ts";

export interface PageOptions {
  /** The name the agent knows the page by: its title, else the file name. */
  page: string;
  words: FeedbackWords;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  storageKey: string;
  /** Delivers one answer to the page server, and tells whether it was taken. */
  post: (answer: Answer) => Promise<AnswerReply>;
}

/**
 * The wiring of a rendered Markdown page: each block's answer goes to the page server (a refused one reopens its
 * block), and the feedback panel takes selected text and the diagrams' elements.
 */
export function mountPage(options: PageOptions): { destroy: () => void } {
  const { words, post } = options;
  /** A refused or failed answer reopens its block, and the notice offers its text to paste into pi. */
  const failed = (answer: Answer, element: { answered?: unknown } | null, reason: string): void => {
    // A pick locks itself once taken; clearing `answered` reopens it so the user can try again.
    if (element) element.answered = undefined;
    showFailure(words, reason, reason === "empty" ? undefined : answerText(answer));
  };

  const onAnswer = (event: Event): void => {
    const answer = (event as CustomEvent<Answer>).detail;
    const element = event.target as (HTMLElement & { answered?: unknown }) | null;
    post(answer).then(
      (reply) => {
        if (!reply.accepted) failed(answer, element, reply.reason ?? "refused");
      },
      (error: unknown) => failed(answer, element, failureReason(error, words)),
    );
  };

  const feedback = mountFeedback({
    page: options.page,
    words,
    diagrams: true,
    requote: requoteDiagram,
    storage: options.storage,
    storageKey: options.storageKey,
    send: async (answer) => {
      const reply = await post(answer);
      if (!reply.accepted) throw new Error(reply.reason ?? "refused");
    },
  });

  const onDiagramTarget = (event: Event): void => {
    const target = (event as CustomEvent<{ kind: string; text: string }>).detail;
    // The path runs from the element's own button, inside the diagram's shadow tree, out through the diagram.
    const path = event.composedPath();
    const diagram = path.find((node) => node instanceof Element && node.localName === "pbs-diagram");
    if (!(diagram instanceof Element)) return;
    const [button] = path;
    feedback.comment(diagramQuote(diagram, target), {
      ref: diagramRef(diagram),
      // Escape in the panel returns there.
      back: button instanceof HTMLElement || button instanceof SVGElement ? button : undefined,
    });
  };

  document.addEventListener("pbs-answer", onAnswer);
  document.addEventListener("pbs-diagram-target", onDiagramTarget);
  return {
    destroy: () => {
      document.removeEventListener("pbs-answer", onAnswer);
      document.removeEventListener("pbs-diagram-target", onDiagramTarget);
      feedback.destroy();
    },
  };
}
