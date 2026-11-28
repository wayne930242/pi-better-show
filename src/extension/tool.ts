import { fileURLToPath } from "node:url";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BetterShow } from "./controller.ts";

const AUTHORING = fileURLToPath(new URL("./authoring.md", import.meta.url));

export const DESCRIPTION =
  "Show documents without waiting for the user. " +
  'view "page" opens the browser for reading and deciding: interactive Markdown, sandboxed HTML or TSX/JSX (default React component), or images (png, jpg, gif, webp, bmp, svg). ' +
  'view "edit" (default) opens text in $PI_BETTER_SHOW_EDITOR, VS Code, or the system editor; saved edits return as a diff. Use it for specs or drafts the user should edit. ' +
  `For block syntax and the React API, read ${AUTHORING} on demand before authoring unfamiliar blocks. ` +
  "Markdown fences name the kind: mermaid (use flowchart for flows and concept maps), diff, cards, options, form, review, mindmap, suggest, checklist, table, steps, stats, tree. GitHub alerts are callouts. " +
  'Body, hint and note support inline Markdown (bold, italic, code, http(s) links, line breaks), no HTML. Quote YAML text containing " #" or ": ". Block problems such as bad YAML, truncated text or unknown keys report line numbers in show_doc and the write or edit of a .md file. ' +
  "Images and links resolve from the page directory; assets cannot load from above it or another site. Markdown, HTML and React pages have a feedback panel: selected-passage comments reach you as messages. " +
  "Put page decisions (multiple questions or a choice after a comparison) in a form fence at the end; use your question tool for one short question. Form questions take name, label, type single|multi|text and choices; choice allows a custom answer unless other: false. " +
  'HTML supports sandboxed scripts/forms, not storage or other sites. Use <form action="cgi-bin:pi-answer"> or piBetterShow.send(fields) to send values. ' +
  'For recomputing inputs, tabs or filters, use TSX/JSX with built-in React. Import block components and send(answer or fields) from "pi-kit"; sibling modules are allowed, CSS imports are not. ' +
  "Snapshot directory trees with npx pbs-tree [dir] or bunx pbs-tree; keep them under a few hundred nodes and add notes/tags as needed. Pages and editor diffs refresh on changes.";

export const parameters = Type.Object({
  paths: Type.Array(Type.String({ description: "File path, absolute or relative to the working directory" }), {
    minItems: 1,
  }),
  reason: Type.String({
    description: "One short line telling the user what to review, e.g. 'Spec ready for approval'",
  }),
  view: Type.Optional(
    Type.Union([Type.Literal("page"), Type.Literal("edit")], {
      description:
        'How a document opens: "page" renders it in the browser for reading and answering, "edit" (default) opens it in the editor for review edits',
    }),
  ),
});

export const showDocTool = (show: BetterShow) =>
  defineTool({
    name: "show_doc",
    label: "Show document",
    description: DESCRIPTION,
    parameters,
    // pi runs the calls of one assistant message in parallel; a `write` issued beside this call would not have
    // finished when it reads the file ("cannot read"). Sequential runs the calls in order, the write first.
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      show.setContext(ctx);
      const result = await show.show(ctx.cwd, params.paths, params.reason, params.view);
      return { content: [{ type: "text", text: result.text }], details: { opened: result.opened } };
    },
  });
