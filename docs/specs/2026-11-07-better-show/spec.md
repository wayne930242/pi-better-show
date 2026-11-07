# pi-better-show: unified interactive blocks

Status: approved (Wei-Hung, 2026-11-07)

One package, `pi-better-show`, owns the interactive block vocabulary that agents write in Markdown, its text fallback, its answer encoding, and one set of data-driven web components. Three hosts render it the same way: a local pi session (`show_doc`, replacing pi-herdr-doc-review), the pi-straw-boss GUI, and the pi-roundtable web GUI (Merlin). Discord, LINE, and terminals get the same content as readable text.

## Decisions

| # | Decision | Source |
|---|---|---|
| D1 | Agents author blocks as fenced blocks in Markdown (`` ```form ``, ...), the syntax `show_doc` pages already use. No separate tool. | form 1 `authoring: fence` |
| D2 | A submitted form or pick does not block: it becomes the user's next message and starts a turn. `ask_user` stays for blocking questions. | form 1 `answers: message` |
| D3 | Mermaid on text surfaces: Unicode box drawing in a code block; wider than about 60 columns, the Mermaid source plus a one-line pointer to the web view. | form 1 `mermaid_discord: ascii` |
| D4 | Four phases on roundtable (display, interaction, long content, message actions); the temp-knight unread bug is fixed separately first. | form 1 `phasing: four` |
| D5 | Shared rendering is framework-free custom elements fed with data, not React; React hosts wrap them thinly. | form 2 `elements: web-components` |
| D6 | pi-better-show replaces pi-herdr-doc-review: it ships its own `show_doc` extension that opens the default browser only (no Herdr nvim or terminal-browser panes). The old package gets a last release pointing here and is archived. | form 2 `old_package: replace`; "pi herdr doc pane 顯示並不好用，或許直接都改用 pi doc blocks，這樣我本地也使用" |
| D7 | Edit mode stays, in the user's editor (`$VISUAL`/`$EDITOR`, or VS Code): saving sends the diff back to the agent as today. | form 2 `edit_mode: editor` |
| D8 | Agent-written TSX/HTML pages (and review `page` items) run only in a sandboxed iframe; text surfaces get a one-line pointer. Superseded for roundtable by D13. | form 2 `tsx_pages: local-sandbox` |
| D9 | Own repository `wayne930242/pi-better-show`, own version; consumers pin it exactly. | form 2 `repo: own-repo` |
| D10 | Hosts can restyle the elements (straw-boss especially), and the elements follow light and dark schemes, fitting each host's look and use. | form 2 notes: "straw boss 要能自訂 ui，或是你要支援深色或是淺色，符合美觀和使用情境" |
| D11 | Name `pi-better-show`: it shows more than documents. Elements take the `pbs-` prefix, custom properties `--pbs-`, bus events `better-show:`. | "改成 pi-better-show（或是類似的方向）好像比較好，他不是只有 doc"; question round `pi-better-show` |
| D12 | Version 1 adds `checklist`, `table` (sortable, filterable), `steps` (steps or timeline), and `stats` to the vocabulary. | question round: "checklist, table（可排序篩選）, steps／timeline, stats" |
| D13 | Roundtable supports agent pages natively in phase 3, with the long-content reader. The isolation: a sandboxed iframe with `allow-scripts` only and an opaque origin, so it reaches neither the console's DOM, storage, nor cookies. The page's response carries a strict CSP: no network (`connect-src 'none'`), no form submission, no top navigation, and scripts only from its own directory. Answers travel by postMessage, and the parent checks the source window. TSX is bundled on the server with this package's bundler. Discord gets a one-line pointer. Security-relevant, so it needs an independent review before merge. | element review: "roundtable 不能原生支援嗎？", then "支援，放第三階段" |
| D14 | Element decisions. A Mermaid diagram with wide (CJK) labels falls back to its source plus the web pointer on text surfaces. A form, review, or checklist locks only when the host sets `answered`, while a pick or chip locks at once. A review `page` item shows only through the host's `pageUrl` hook. | element review form: `cjk_mermaid: source`, `lock: host_confirms` |

## Package layout

```
pi-better-show
  .            core: isomorphic, no DOM, no node APIs
  ./elements   custom elements (browser)
  ./react      thin React wrappers over the elements
  ./server     node: mermaid to SVG and to Unicode text
  ./extension  the pi extension: show_doc, page server, editor edit mode, event-bus contract v2
```

`.` and `./elements` must run in the browser bundle of every host; `./server` and `./extension` may use node APIs. Core depends on `yaml` only (plus a small inline-Markdown tokenizer of its own); `beautiful-mermaid` lives in `./server`; `esbuild` and React for local TSX pages live in `./extension` only.

## Block vocabulary, version 1

Existing show-doc blocks keep their schema exactly (pi-herdr-doc-review `src/markdown.ts`, README "Markdown pages"): GitHub alerts, `mermaid`, `diff`, `cards`, `options`, `form`, `review`. New blocks:

- `mindmap`: an indented Markdown list; the first item is the root. Renders as a collapsible tree. Concept maps stay `mermaid` `flowchart`.
- `suggest`: a list of strings or `{label, text}`; renders as quick-reply chips; clicking one sends `text` (default `label`) as the user's message.

- `checklist`: `{title, submit, items: [string | {name, label, checked, note}]}`; ticked items go back as an answer (kind `checklist`). Text: `☐`/`☑` lines.
- `table`: `{columns: [string | {name, label, align, type: text | number | date}], rows: [[...] | {...}], sort, filter: true}`; the element sorts by a clicked column and filters by a text box, locally. Text: one line per row as `label: value` pairs (Discord shows no tables), cut after 20 rows with a count.
- `steps`: `{items: [{title, status: done | doing | todo | blocked, when, body}]}`; a vertical steps or timeline view. Text: numbered list with a status mark.
- `stats`: list of `{label, value, delta, tone, note}`; metric tiles. Text: `label: value (delta)` lines.
- Flowcharts and concept maps stay Mermaid `flowchart` (top-down by default); no native flowchart block.

Text fields (`body`, `hint`, `note`) take restricted inline Markdown: bold, italic, code, `http(s)` links, line breaks. No raw HTML anywhere in a block.

## Core API

- `parse(markdown: string): Segment[]` splits a document into `{type: "markdown", text}`, `{type: "block", kind, data, index}`, and `{type: "invalid", kind, source, error}` segments, in order. `index` counts blocks in the document and is the block's address for answers.
- `toText(segments, profile): string` renders a document for a surface without blocks. `profile` is `{flavor: "discord" | "line" | "plain", width?, mermaid?: (source) => string | undefined}`; the flavor decides Markdown dialect (Discord Markdown, or plain text for LINE). Per block: alert to bold title plus quote; cards one line each; options numbered with the recommended one starred and "reply with a number"; form numbered questions and choices, answered in text; suggest a single "you can reply: ..." line (or omitted); mermaid by D3; mindmap a nested list; diff unchanged (Discord) or plain; review numbered items; invalid blocks as their source in a code block.
- `inline(text): InlineToken[]` is the restricted inline Markdown for elements.
- `Answer` is `{kind: "form" | "review" | "feedback" | "pick" | "suggest" | "checklist", title?, fields: [name, value][], ref?: {doc?: string, block: number}}`. `encodeAnswer(answer): string` produces the text the agent reads, byte-compatible with pi-herdr-doc-review's `formMessage`, `reviewMessage`, and `pageFeedbackMessage` for the kinds they cover.

## Elements

- Unit 2 (`./elements`, `./react`) ships the thirteen block elements below; `pbs-doc` is deferred to unit 3 (the extension), which needs it for local pages, and has no part in this release.
- One element per block: `pbs-callout`, `pbs-cards`, `pbs-options`, `pbs-form`, `pbs-review`, `pbs-mindmap`, `pbs-suggest`, `pbs-checklist`, `pbs-table`, `pbs-steps`, `pbs-stats`, `pbs-diff`, `pbs-diagram`, plus `pbs-doc` that renders a whole document (prose through core's Markdown, for the local page and hosts without a renderer of their own).
- Data in, events out: a host sets the `data` property (the block's parsed data) or a `data-json` attribute; the element never reads HTML. On submit it dispatches `pbs-answer` (bubbles, composed) with an `Answer`; the host delivers it and sets `answered` (the submitted fields) to lock the element and show what was sent, including after a reload.
- Unit 2 decisions on answers: a pick or chip locks itself once a listener takes the event (`pbs-answer` is cancelable, and setting `answered`, even to `undefined`, clears the local lock); a form, review, or checklist stays editable until the host sets `answered`, as pi-herdr-doc-review's did. Review items resolve `image` and `page` only through `configure({imageUrl, pageUrl})`; `page` shows in a frame with `sandbox="allow-scripts"` and never without a host hook.
- `pbs-diagram` shows an image URL the host supplies through `configure({diagramUrl(source, scheme)})`; hosts serve the SVG from `./server`, so no diagram markup enters the page.
- Shadow DOM with constructed stylesheets (`adoptedStyleSheets`), so a CSP without `unsafe-inline` works (roundtable sets `default-src 'self'`).
- Strings in zh-Hant and English by `lang` (element, then document), overridable through `configure({strings})`.
- Keyboard operable, labelled controls, focus kept on submit.
- Look:
  - **Tokens.** Every colour, radius, font, and spacing value is a custom property (`--pbs-bg`, `--pbs-fg`, `--pbs-muted`, `--pbs-line`, `--pbs-accent`, `--pbs-note`, `--pbs-ok`, `--pbs-warn`, `--pbs-risk`, `--pbs-radius`, `--pbs-font`, `--pbs-mono`, `--pbs-gap`).
  - **Light and dark.** The defaults use `light-dark()`, so they follow the host's `color-scheme`.
  - **Restyling.** Structure is exposed with `part` names for `::part()` restyling.
  - **Density.** A `density` attribute (`comfortable`, `compact`) fits a chat bubble or a full page.
  - **Host mapping.** A host maps its own tokens in one stylesheet: roundtable from `tokens.css` and its looks, straw-boss from `style.css` `:root`.
  - **Borders.** Cards carry a uniform border or none. Tone shows as a tint or a badge, never a one-sided border.

## Hosts

- **Local (`./extension`)**
  - **`show_doc`.** Keeps `show_doc`'s parameters. `view: "page"` opens the default browser on a loopback page server with a random path token. It keeps the current file allow-list and CSP, plus live reload over SSE.
  - **Pages.** `.md` renders through `pbs-doc`. `.html`, `.tsx`, and `.jsx` pages (D8) render in a sandboxed iframe.
  - **Edit mode.** `view: "edit"` opens the user's editor (D7). Saving sends the zero-context diff, steered or next-turn, as today.
  - **Answers and passage comments.** Both reach the agent through `encodeAnswer`: steered while the agent is busy, starting a turn when it is idle.
  - **Mini SDD.** The auto-open of a Mini SDD folder carries over.
- **pi-straw-boss GUI**
  - **Documents.** Renders `blocks` documents (contract v2) with the elements directly, not in an iframe. It keeps the iframe for `html` documents.
  - **Chat.** Agent messages in the chat log render their blocks with the same elements.
  - **Answers.** They go back over the event bus as today.
  - **Look.** Applies its own look through the tokens (D10).
- **pi-roundtable**
  - **Surface capability.** Core gets a surface capability (`ChatSurface` blocks: the kinds a surface draws). It runs `toText` on every reply bound for a surface without them, before `splitReply`, and adds a `describeSurfaceContract` case.
  - **Web app.** Draws blocks in message bubbles (the `MessageMarkdown` `pre` handler dispatches on the fence language) and serves diagrams. An answer becomes a user message carrying `ref`. Phase 2 adds a `web_room_messages` column for it, which is a migration and needs an independent review.
  - **Formatting text per surface.** `APP_FORMATTING` names the blocks; Discord's and LINE's do not.
- **Merlin**
  - **Persona.** Gets web-surface block guidance. `ask_user` wording no longer assumes Discord buttons.
  - **Pins.** Bumps the seven roundtable pins and the pi-better-show pin.

## Event-bus document contract, version 2

- **Event names.** `better-show:documents`, `better-show:documents-request`, `better-show:answer`, `better-show:answer-result`, each payload `{version: 2, ...}`.
- **Semantics.** Same as v1 (pi-herdr-doc-review README "Browser viewers"), with these changes:
  - `kind` is `"blocks" | "html" | "text"`.
  - `blocks` documents are fetched as Markdown text by capability and rendered by the viewer.
  - `better-show:answer` carries an `Answer` instead of bare fields, and keeps `answerId` idempotency.
- **v1.** pi-straw-boss keeps its v1 listener until pi-herdr-doc-review is archived, then drops it.

## Security

- **Hosted pages.** Elements take data only. Inline Markdown is tokenized, never parsed as HTML. Images resolve only through the host: a capability locally and in straw-boss, a `file:` id in roundtable.
- **Agent HTML and TSX.** They run only in a sandboxed iframe, under the page server's CSP and allow-list. That applies locally and in straw-boss now, and in roundtable from phase 3 under D13's isolation.
- **Roundtable** does not change its CSP.

## Work and owners

| Unit | Owner | Depends on |
|---|---|---|
| pi-better-show core, elements, react, server, first release | this tab | — |
| pi-better-show extension (`show_doc` replacement) and pi-herdr-doc-review's last release and archive; `show_doc` wording in weihung-agent-root (`AGENTS.md.in`, `rules/presenting.md`) | this tab | core, elements |
| pi-roundtable phase 1 (display blocks, text fallback, diagrams, formatting text) and Merlin bump | this tab | core, elements, server |
| pi-roundtable phases 2–4 | this tab | phase 1 |
| pi-straw-boss: contract v2, block documents, chat blocks, token mapping | an agent the sb head tower opens | elements API frozen (first pi-better-show release) |

## Acceptance

- **Core**
  - `parse` and `toText` are covered by golden tests for every block kind and every flavor, including invalid YAML.
  - `encodeAnswer` output equals pi-herdr-doc-review's encoders on their test fixtures.
- **Elements**
  - DOM tests (happy-dom or a real browser) cover rendering from data, `pbs-answer` detail, the `answered` lock, keyboard submit, and that no input string reaches `innerHTML`.
  - Screenshots in light and dark at both densities pass the user's visual check.
- **Local.** `show_doc` on `examples/` opens in the default browser. A submitted form and a passage comment reach the agent. A save in the editor sends a diff. A TSX page runs sandboxed.
- **Roundtable phase 1**
  - The surface contract case passes.
  - A Discord reply containing every block kind posts only text: the test asserts no fence of a block kind is left.
  - The web app shows the blocks (visual check).
- **straw-boss.** Set by its agent from this spec, with a contract v2 round-trip test against the extension.
