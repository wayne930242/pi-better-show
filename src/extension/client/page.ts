import type { Answer } from "../../core/types.ts";
import "../../elements/index.ts";
import { configure } from "../../elements/index.ts";
import { fetchDiagramMap } from "./diagram-map.ts";
import { wordsFor } from "./feedback.ts";
import { configureElements, newAnswerId, postAnswerToServer, serverPrefix } from "./host-config.ts";
import { mountPage } from "./markdown-page.ts";

/**
 * The script of a rendered Markdown page: wires the elements to the page server (diagrams, images, answers),
 * mounts the feedback panel, and reloads when the server says the document changed.
 */

const prefix = serverPrefix();
configureElements(prefix);
// A diagram's nodes and edges can be commented on, not only selected text.
configure({ diagramMap: fetchDiagramMap });

mountPage({
  page: document.title || location.pathname.split("/").pop() || "",
  words: wordsFor(document.documentElement.lang || navigator.language),
  storage: sessionStorage,
  storageKey: `pbs-feedback:${location.pathname}`,
  post: (answer: Answer) =>
    postAnswerToServer(`${prefix}/answer`, { answerId: newAnswerId(), answer, page: location.pathname }),
});

new EventSource(`${prefix}/events?page=${encodeURIComponent(location.pathname)}`).addEventListener("reload", () =>
  location.reload(),
);
