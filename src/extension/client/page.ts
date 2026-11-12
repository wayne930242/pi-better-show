import type { Answer } from "../../core/types.ts";
import "../../elements/index.ts";
import { configure } from "../../elements/index.ts";
import { diagramQuote, fetchDiagramMap } from "./diagram-map.ts";
import { mountFeedback, wordsFor } from "./feedback.ts";
import { type AnswerReply, configureElements, newAnswerId, postAnswerToServer, serverPrefix } from "./host-config.ts";

/**
 * The script of a rendered Markdown page: wires the elements to the page server (diagrams, images, answers),
 * mounts the feedback panel, and reloads when the server says the document changed.
 */

const prefix = serverPrefix();
configureElements(prefix);
// A diagram's nodes and edges can be commented on, not only selected text.
configure({ diagramMap: fetchDiagramMap });

const postAnswer = (answer: Answer): Promise<AnswerReply> =>
  postAnswerToServer(`${prefix}/answer`, { answerId: newAnswerId(), answer, page: location.pathname });

const toast = (text: string): void => {
  const box = document.createElement("div");
  box.className = "pbs-toast";
  box.setAttribute("role", "status");
  box.textContent = text;
  document.body.append(box);
  setTimeout(() => box.remove(), 5000);
};

const lang = document.documentElement.lang || navigator.language;
const words = wordsFor(lang);

document.addEventListener("pbs-answer", (event) => {
  const answer = (event as CustomEvent<Answer>).detail;
  const element = event.target as (HTMLElement & { answered?: unknown }) | null;
  postAnswer(answer).then(
    (reply) => {
      if (reply.accepted) return;
      // A pick locks itself once taken; clearing `answered` reopens it so the user can try again.
      if (element) element.answered = undefined;
      toast(`${words.notSent}${reply.reason ?? "refused"}`);
    },
    (error: unknown) => {
      if (element) element.answered = undefined;
      toast(`${words.notSent}${error instanceof Error ? error.message : String(error)}`);
    },
  );
});

const feedback = mountFeedback({
  page: document.title || location.pathname.split("/").pop() || "",
  words,
  diagrams: true,
  storage: sessionStorage,
  storageKey: `pbs-feedback:${location.pathname}`,
  send: async (answer) => {
    const reply = await postAnswer(answer);
    if (!reply.accepted) throw new Error(reply.reason ?? "refused");
  },
});

document.addEventListener("pbs-diagram-target", (event) => {
  const target = (event as CustomEvent<{ kind: string; text: string }>).detail;
  if (event.target instanceof Element) feedback.comment(diagramQuote(event.target, target));
});

new EventSource(`${prefix}/events?page=${encodeURIComponent(location.pathname)}`).addEventListener("reload", () =>
  location.reload(),
);
