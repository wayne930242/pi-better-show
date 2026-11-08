import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BetterShow } from "./controller.ts";

export const DESCRIPTION =
  "Show documents to the user in their browser or editor, without waiting for them. " +
  'view "page" (for reading and deciding) opens the file in the default browser: a Markdown file renders as a page, and its blocks (below) become interactive; an .html file, or a .tsx/.jsx file whose default export is a React component, runs in a sandboxed frame; images (png, jpg, gif, webp, bmp, svg) open as they are. ' +
  'view "edit" (the default) opens a text file in the user\'s editor ($PI_BETTER_SHOW_EDITOR, else VS Code, else the system text editor), and their saved edits come back to you as a diff: use it for specs and drafts the user should edit. ' +
  "Write Markdown with these fenced blocks (a code fence whose first word is the kind); text fields (body, hint, note) take bold, italic, code, http(s) links, and line breaks, and no HTML: " +
  "a GitHub alert (> [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION], with an optional title after the marker) is a callout; " +
  "```mermaid is a diagram (flowchart, state, sequence, class, ER, xychart bar or line; use flowchart for flows and concept maps); ```diff is coloured; " +
  "```cards holds a YAML list of {title, tone: note|ok|warn|risk, body}; " +
  "```options holds a YAML list of {title, recommended: true or a label, body, pros: [..], cons: [..]} shown side by side, and picking one sends it to you; " +
  "```form holds {title, submit, questions: [{name, label, hint, required, type: single|multi|text, other: label or false, choices: [label or {value, label, note, recommended}]}]}, and the user's answers reach you as a message when they send it; a choice question always ends with a box for the user's own answer unless other is false; " +
  "```review holds {title, submit, pick: true or a label, columns, items: [{name, label, image: path, page: path to an HTML prototype, height, body}]}: the user comments on each item (blank means no feedback) and, with pick, picks a favourite, for A/B tests of designs, screenshots, or prototypes; items are named A, B, C… unless named; " +
  "```mindmap is an indented Markdown list whose first item is the root, shown as a collapsible tree; " +
  "```suggest holds a YAML list of strings or {label, text}: quick-reply chips, and clicking one sends text (default label) to you as the user's message; " +
  "```checklist holds {title, submit, items: [string | {name, label, checked, note}]}, and the ticked items come back to you as a message; " +
  "```table holds {columns: [string | {name, label, align, type: text|number|date}], rows: [[..] | {..}], sort, filter: true}: the user sorts by a column and filters by a text box; " +
  "```steps holds {items: [{title, status: done|doing|todo|blocked, when, body}]}, a steps or timeline view; " +
  "```stats holds a YAML list of {label, value, delta, tone, note} shown as metric tiles. body fields are Markdown. " +
  "Images and links resolve against the page's directory; nothing loads from above it or from another site. " +
  "Every Markdown, HTML, and TSX page has a feedback panel: the user comments on selected passages and sends them to you as a message. " +
  "Put decisions that belong to the page (several questions, or a choice after a comparison) in a ```form at its end; ask a single short question with your question tool. " +
  'An .html page runs as written under a sandbox (scripts and forms, no storage, nothing from other sites): a <form action="cgi-bin:pi-answer"> sends its fields to you when submitted, and piBetterShow.send(fields) does the same from a script. ' +
  'When a page needs interaction (inputs that recompute, tabs, filters), write a .tsx or .jsx file and open it with view "page": React is built in, and the "pi-kit" module exports PbsBlock, PbsForm, PbsOptions, PbsReview, PbsChecklist, PbsTable, PbsCallout, PbsCards, PbsMindmap, PbsSuggest, PbsSteps, PbsStats, PbsDiff, PbsDiagram (props data, onAnswer; PbsBlock draws a parsed block), parse, encodeAnswer, and send(answer or fields) to hand you any values as a message. Import sibling modules freely; import no CSS. ' +
  "It returns at once without waiting for the user. Pages reload and edited documents refresh when you change them.";

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
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      show.setContext(ctx);
      const result = await show.show(ctx.cwd, params.paths, params.reason, params.view);
      return { content: [{ type: "text", text: result.text }], details: { opened: result.opened } };
    },
  });
