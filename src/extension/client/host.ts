import { frameAnswer } from "./bridge.ts";
import { type AnswerReply, serverPrefix } from "./host-config.ts";

/**
 * The page around an agent's HTML or TSX page. The page itself runs in a sandboxed frame without
 * `allow-same-origin`, so the server refuses its own requests (Origin null); it asks this parent, by `postMessage`, to carry its answers.
 * The parent trusts a message only from its own frame (see bridge.ts).
 */

const prefix = serverPrefix();
const frame = document.querySelector("iframe");
if (!frame) throw new Error("no frame to host");

window.addEventListener("message", (event) => {
  const taken = frameAnswer(event, frame.contentWindow);
  if (!taken) return;
  const reply = (result: AnswerReply): void =>
    frame.contentWindow?.postMessage(
      { source: "pbs-host", type: "answer-result", answerId: taken.answerId, ...result },
      "*",
    );
  fetch(`${prefix}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...taken, page: location.pathname }),
  })
    .then((response) => response.json() as Promise<AnswerReply>)
    .then(reply, (error: unknown) =>
      reply({ accepted: false, reason: error instanceof Error ? error.message : String(error) }),
    );
});

new EventSource(`${prefix}/events?page=${encodeURIComponent(location.pathname)}`).addEventListener("reload", () => {
  // Setting the same address again reloads the frame; the parent cannot call into it.
  frame.src = frame.getAttribute("src") ?? "";
});
