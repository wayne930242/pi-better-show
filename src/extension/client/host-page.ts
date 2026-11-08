import { frameAnswer, frameSelection } from "./bridge.ts";
import { type FeedbackWords, mountFeedback } from "./feedback.ts";
import { type AnswerReply, newAnswerId, type PostAnswer } from "./host-config.ts";

export interface HostOptions {
  frame: HTMLIFrameElement;
  /** The page server's path prefix (`/<token>`). */
  prefix: string;
  /** The name the agent knows the page by: the HTML title, else the file name. */
  page: string;
  words: FeedbackWords;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  storageKey: string;
  post: PostAnswer;
}

/**
 * The page around an agent's HTML or TSX page. The page itself runs in a sandboxed frame without `allow-same-origin`,
 * so the server refuses its own requests (Origin null); it asks this parent, by `postMessage`, to carry its answers and
 * to report the text the user selects. The parent trusts a message only from its own frame (see bridge.ts), and the
 * feedback panel lives here, outside the frame, where the user's comments and the server's answer check are the same
 * as on a Markdown page.
 */
export function mountHost(options: HostOptions): { destroy: () => void } {
  const { frame, prefix, post } = options;
  const answerUrl = `${prefix}/answer`;
  const feedback = mountFeedback({
    page: options.page,
    words: options.words,
    storage: options.storage,
    storageKey: options.storageKey,
    watchDocument: false,
    send: async (answer) => {
      const reply = await post(answerUrl, { answerId: newAnswerId(), answer, page: location.pathname });
      if (!reply.accepted) throw new Error(reply.reason ?? "refused");
    },
  });

  const onMessage = (event: MessageEvent): void => {
    const selection = frameSelection(event, frame.contentWindow);
    if (selection) {
      // The position is in the frame's viewport; the Add button sits in this one.
      const origin = frame.getBoundingClientRect();
      feedback.offer({
        text: selection.text,
        ...(selection.top === undefined ? {} : { top: selection.top + origin.top }),
        ...(selection.left === undefined ? {} : { left: selection.left + origin.left }),
      });
      return;
    }
    const taken = frameAnswer(event, frame.contentWindow);
    if (!taken) return;
    const reply = (result: AnswerReply): void =>
      frame.contentWindow?.postMessage(
        { source: "pbs-host", type: "answer-result", answerId: taken.answerId, ...result },
        "*",
      );
    post(answerUrl, { ...taken, page: location.pathname }).then(reply, (error: unknown) =>
      reply({ accepted: false, reason: error instanceof Error ? error.message : String(error) }),
    );
  };
  // A frame that loads again has lost its selection.
  const onLoad = (): void => feedback.offer(undefined);
  window.addEventListener("message", onMessage);
  frame.addEventListener("load", onLoad);
  return {
    destroy: () => {
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", onLoad);
      feedback.destroy();
    },
  };
}
