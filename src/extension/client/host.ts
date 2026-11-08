import { wordsFor } from "./feedback.ts";
import { postAnswerToServer, serverPrefix } from "./host-config.ts";
import { mountHost } from "./host-page.ts";

/** The script of the page around an agent's HTML or TSX page: carries its answers, mounts the feedback panel, and reloads the frame when the document changes. */

const prefix = serverPrefix();
const frame = document.querySelector("iframe");
if (!frame) throw new Error("no frame to host");

mountHost({
  frame,
  prefix,
  page: document.title || location.pathname.split("/").pop() || "",
  words: wordsFor(document.documentElement.lang || navigator.language),
  storage: sessionStorage,
  storageKey: `pbs-feedback:${location.pathname}`,
  post: postAnswerToServer,
});

new EventSource(`${prefix}/events?page=${encodeURIComponent(location.pathname)}`).addEventListener("reload", () => {
  // Setting the same address again reloads the frame; the parent cannot call into it.
  frame.src = frame.getAttribute("src") ?? "";
});
