# pi-better-show

Interactive blocks for agent-written Markdown. An agent writes fenced blocks (`` ```form ``, `` ```table ``, ...); this package owns what they mean, so every host (a local pi session, a GUI, a chat bridge) shares one block vocabulary, one text fallback for surfaces that cannot draw blocks, and one encoding for the answers users send back.

Status: 0.1.0, core, server, elements, React wrappers, and the `show_doc` pi extension. Design: `docs/specs/2026-11-07-better-show/spec.md`.

```
pi-better-show          core: isomorphic, no DOM, no node APIs; depends on `yaml` only
pi-better-show/elements browser: framework-free custom elements, one per block kind (no yaml, no node APIs)
pi-better-show/react    thin React wrappers over the elements (React is an optional peer)
pi-better-show/server   node: Mermaid to SVG and to Unicode text (beautiful-mermaid)
pi-better-show/extension  the pi extension: `show_doc`, a loopback page server, edit mode, event-bus contract v2
```

The package ships TypeScript source, with no build step. Source uses erasable syntax only, so it loads under node's type stripping and in bun and bundler pipelines.

## Blocks

A block is a fenced code block whose first word is the kind, or a GitHub alert. Text fields (`body`, `hint`, `note`, ...) take restricted inline Markdown: bold, italic, code, `http(s)` links, line breaks. No raw HTML anywhere.

| Kind | Written as | Answer kind |
|---|---|---|
| `alert` | `> [!NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION] title` quote | |
| `mermaid` | Mermaid source | |
| `diff` | unified diff | |
| `cards` | YAML list of `{title, tone, body}` | |
| `options` | YAML list of `{title, recommended, body, pros, cons}` | `pick` |
| `form` | YAML `{title, submit, questions: [{name, label, type, hint, required, other, choices}]}` | `form` |
| `review` | YAML `{title, submit, pick, columns, items: [{name, label, image, page, height, body}]}` | `review` |
| `mindmap` | indented Markdown list; the first item is the root | |
| `suggest` | YAML list of strings or `{label, text}` | `suggest` |
| `checklist` | YAML `{title, submit, items: [string \| {name, label, checked, note}]}` | `checklist` |
| `table` | YAML `{columns, rows, sort, filter}` | |
| `steps` | YAML `{items: [{title, status: done\|doing\|todo\|blocked, when, body}]}` | |
| `stats` | YAML list of `{label, value, delta, tone, note}` | |
| `tree` | indented lines (two spaces per level, first line the root): `name/` for a folder, then `{tags}` and ` # note` | |

**The `tree` block** shows a directory tree for structure reviews:

```tree
pi-better-show/
  src/ # one package, four entries
    core/ {focus} # parser and text, no DOM
      parse.ts
      validate.ts {new} # checks answers
    elements/ # web components
  tests/
  README.md {changed}
```

A folder's name ends with `/`; tags are `new`, `changed`, `removed`, `focus`, `risk` (an unknown tag makes the block invalid); the note after ` # ` takes inline Markdown; a `… N more` line stands for entries a limit cut. A tree has at most 2,000 nodes and 32 levels (the root is level 1). The block carries a snapshot, so every host draws it; `toText` writes it in `tree` style (`├──`, `└──`, tags as `[new]`, notes after ` — `), in a fence on Discord.

**`pbs-tree`** prints the fence for a folder: `npx pbs-tree [dir]` or `bunx pbs-tree [dir]` (plain JavaScript on node built-ins; runs under node and bun). Output is sorted by name in byte order, so a snapshot is reproducible; symlinks are not followed. Flags follow Linux `tree` where they exist:

| Flag | Meaning |
|---|---|
| `-L n` | depth |
| `-d` | folders only |
| `-a` | include dot files (default skips them; `.git` is always skipped) |
| `-I pattern` | leave out names matching the glob (`*` `?` `[..]`); `\|` separates several; repeatable |
| `-P pattern` | list only files matching; a folder is kept when it holds a match (even below the `-L` cut); ignored with `-d` |
| `--gitignore` | honour `.gitignore` files, those of the folder and of the folders above it up to the repository's top |
| `--dirsfirst` | folders before files |
| `--filelimit n` | do not open a folder holding more than n entries; writes `… N more` in its place |
| `--prune` | drop folders that hold nothing (what `-L` hides still counts); ignored with `-d` |
| `--changed-since <rev>` | tag `new`, `changed`, `removed` from `git diff --name-status <rev>` against the working tree; removed files are listed though absent, untracked files are `new`, a rename is a removed and a new file |

A tree over the block's limits is refused (exit 1) with the node count; narrow it with `-L`, `-I`, `--gitignore`. Names that would read as a note or tags get a no-break space, and a newline in a name becomes `?`. Exit codes: 0, 1 for a failure (not a folder, git failed, too large), 2 for a bad flag.

A block whose body is not valid YAML, or does not fit its schema, becomes an `invalid` segment that keeps its source and the reason; nothing throws.

## Core API

```ts
import { parse, toText, inline, encodeAnswer, checkBlocks } from "pi-better-show";

parse(markdown: string): Segment[]
```

Splits a document into `{type: "markdown", text}`, `{type: "block", kind, data, index}`, and `{type: "invalid", kind, source, error}` segments, in order. `data` is typed per kind (`BlockDataMap`). `index` counts the document's blocks of every kind from 0; invalid blocks take no number. `index` is the block's address for answers.

```ts
checkBlocks(markdown: string, options?: { mermaid?: (source: string) => string | undefined }): BlockProblem[]
formatProblems(name: string, problems: BlockProblem[]): string

interface BlockProblem {
  kind: BlockKind;
  line: number;                      // 1-based, in the Markdown file
  path: string;                      // e.g. form question "o5" choice 1 label
  message: string;
  severity: "error" | "warning";
}
```

Tells the author what is wrong with the blocks of a file, where `parse` only keeps going. `error`: the block is invalid and the page shows its source (a YAML error is reported at the line that caused it; a flow collection broken by an unquoted ` #` points at the line that opened it). `warning`: the block draws, but part of what was written is lost: a plain value that a ` #` cut short (YAML reads the rest as a comment; the message names the key path and says to quote the value), a key the block does not read at that level (with the known keys, and a "did you mean" for a near miss), or a fence that never closes. Core has no Mermaid parser: pass `options.mermaid`, which returns what is wrong with a diagram source, to check diagrams too. Pure; it loads no more than `parse` does.

```ts
toText(segments: Segment[], profile: TextProfile): string

interface TextProfile {
  flavor: "discord" | "line" | "plain";   // Discord Markdown, or plain text
  width?: number;                          // columns a diagram may take; default 60
  mermaid?: (source: string, width: number) => string | undefined;
  keep?: readonly BlockKind[];             // kinds emitted as their `raw` text instead of converted
  lang?: "en" | "zh-TW";                   // language of the reply instructions; default "en", anything else is "en"
}
```

The interactive kinds end with a reply instruction (`options`, `form`, `review`, `suggest`, and `checklist`): "Reply with a number.", "Reply in text, one line per question, like `1: b`.", and so on. `lang: "zh-TW"` writes them in Traditional Chinese; pass the conversation's language when you know it. Block content is never translated.

Every `BlockSegment` and `InvalidSegment` carries `raw`: the block's exact original text, fences (or an alert's whole `>` quote) included, byte for byte. Kinds listed in `keep` are emitted as `raw` verbatim, valid or invalid, for a surface that draws them itself; other kinds convert as usual. `DISPLAY_KINDS` (`alert`, `cards`, `mermaid`, `mindmap`, `diff`, `table`, `steps`, `stats`, `tree`) is the usual `keep` list for such a surface; `INTERACTIVE_KINDS` (`options`, `suggest`, `form`, `checklist`, `review`) are the kinds a reader answers, the ones a surface that cannot draw them gets as reply instructions. Without `keep`, output is unchanged.

Renders a document for a surface that cannot draw blocks. A diagram goes through the `mermaid` hook; when there is no hook, or it returns `undefined` or a drawing wider than `width`, the output is the Mermaid source in a code block plus a pointer to the web view. No block-kind fence is left in the output, except Discord's native `diff`.

```ts
inline(text: string): InlineToken[]      // restricted inline Markdown, tokenized, never HTML
inlinePlain(text: string): string        // the same text without markers
displayWidth(text: string): number       // terminal columns: CJK counts 2
reviewItemName(item): string             // "B (dark header)"

interface Answer {
  kind: "form" | "review" | "feedback" | "pick" | "suggest" | "checklist";
  title?: string;
  fields: [name: string, value: string][];
  ref?: { doc?: string; block: number };
}
encodeAnswer(answer: Answer): string
```

`encodeAnswer` produces the text the agent reads. For `form`, `review`, and `feedback` it is byte-compatible with pi-herdr-doc-review's `formMessage`, `reviewMessage`, and `pageFeedbackMessage` given the same fields (the legacy `pi-kind` field is ignored). `ref` addresses the block for hosts and does not appear in the text.

| Kind | `fields` | Text |
|---|---|---|
| `form` | one `[name, value]` per question | `User submitted a form ...` then `- name: value` lines |
| `review` | `title`, `picked`, `item`/`comment` pairs, `silent` | `User reviewed "title":` ... |
| `feedback` | `page`, `quote`/`comment` pairs, `overall` | `User feedback on the page "page":` ... |
| `pick` | `[["picked", option]]` | `User picked "option" for "title".` |
| `suggest` | `[["text", text]]` | the text itself |
| `checklist` | one `[name, "checked" \| "unchecked"]` per item | `User updated the checklist "title":` then `☑`/`☐` lines |

```ts
validateAnswer(block: BlockSegment, answer: Answer): { ok: true } | { ok: false; reason: string }
```

`validateAnswer` is for a host that receives an `Answer` from an untrusted client. It accepts the answer when its `kind` fits the block (`options` takes `pick`, the others their own kind), every field names a question, choice, or item of that block, and there are at most 64 fields of at most 1,024 characters each. Several values for one name are accepted only for a `multi` form question (as repeated fields, or the joined value the form element sends); a `single` or `text` question, a pick, and a suggestion take one. A required question must be answered (an empty value or `(no answer)` is not an answer). On a `form` question without an `other` box, a value must be one of its choices. A `checklist` field is an item name once with `checked` or `unchecked`; a `review` may carry `picked` only when the block has `pick`. On refusal `reason` says why, for the host's error reply. Blocks that take no answer (display kinds) are refused.

**Several values.** A block that gathers several values (a `form` with a `multi` question, a `checklist`, a `review`) sends nothing on a tick, a pick, or typing: choices stay changeable until the reader presses Send, and a required `multi` question with none chosen is refused at that question. Only `options` and `suggest` send on the click.

## Server API

```ts
import { mermaidSvg, mermaidText } from "pi-better-show/server";

mermaidSvg(source: string, options?: { scheme?: "light" | "dark" | DiagramColors; font?: string; transparent?: boolean }): string
mermaidText(source: string, width = 60): string | undefined
```

`mermaidSvg` draws a self-contained SVG in the colours of `scheme` (use real colours; an image URL cannot read the host page's CSS). It has no `@import` and no `<script>`, and throws on a source it cannot draw. `mermaidText` draws Unicode box drawing, and returns `undefined` when the source is invalid, a line is wider than `width`, or a wide (CJK, emoji) character would misalign the boxes. It is the `mermaid` hook for `toText`:

```ts
toText(parse(reply), { flavor: "discord", mermaid: mermaidText });
```

## Elements

```ts
import "pi-better-show/elements";           // defines every pbs-* tag (a no-op without a DOM)
import { configure } from "pi-better-show/elements";

el.data = segment.data;                      // or <pbs-form data-json='{...}'>
el.addEventListener("pbs-answer", (event) => send(encodeAnswer(event.detail)));
el.answered = event.detail.fields;           // once delivered: locks the element and shows what was sent
```

A host gives an element the block's parsed `data` and listens for `pbs-answer` (bubbles, composed, cancelable) whose `detail` is a core `Answer`. An element never reads or writes HTML: text reaches the page as text nodes, and links are `http(s)` only with `rel="noopener noreferrer"` and `target="_blank"`. Each element is a shadow root with constructed stylesheets (`adoptedStyleSheets`), so it runs under `default-src 'self'`: no `<style>` element, no `style` attribute. `examples/` is such a page; run it with `bun run demo` (loopback, port 4177).

| Tag | Block | `data` | Answer | Parts |
|---|---|---|---|---|
| `pbs-callout` | `alert` | `AlertData` | | `callout` `header` `icon` `title` `body` |
| `pbs-cards` | `cards` | `CardsData` | | `grid` `card` `title` `icon` `body` |
| `pbs-options` | `options` | `OptionsData` | `pick` | `grid` `option` `title` `badge` `body` `pros` `cons` `actions` `pick` `status` |
| `pbs-form` | `form` | `FormData` | `form` | `form` `title` `question` `label` `hint` `choices` `choice` `badge` `other` `textarea` `error` `actions` `submit` `status` `sent` |
| `pbs-review` | `review` | `ReviewData` | `review` | `review` `title` `items` `item` `item-title` `pick` `media` `image` `enlarge` `frame` `unavailable` `body` `comment` `actions` `submit` `status` `lightbox` `close` `sent` |
| `pbs-mindmap` | `mindmap` | `MindmapData` | | `mindmap` `tree` `item` `node` `toggle` `label` `group` |
| `pbs-suggest` | `suggest` | `SuggestData` | `suggest` | `suggest` `chips` `chip` `status` |
| `pbs-checklist` | `checklist` | `ChecklistData` | `checklist` | `checklist` `title` `items` `item` `progress` `actions` `submit` `status` `sent` |
| `pbs-table` | `table` | `TableData` | | `table` `bar` `filter` `count` `scroll` `header` `head` `sort` `body` `row` `cell` `empty` |
| `pbs-steps` | `steps` | `StepsData` | | `steps` `step` `rail` `marker` `content` `title` `badge` `when` `body` |
| `pbs-stats` | `stats` | `StatsData` | | `grid` `stat` `label` `value` `delta` `note` |
| `pbs-diff` | `diff` | `DiffData` | | `diff` `scroll` `line` |
| `pbs-diagram` | `mermaid` | `MermaidData` | | `diagram` `image` `source` `note` |
| `pbs-tree` | `tree` | `TreeData` | | `treeview` `bar` `expand-all` `collapse-all` `tree` `item` `node` `toggle` `name` `count` `tags` `tag` `note` `more` `group` |

`TAGS` maps a block kind to its tag. There is no whole-document element: the extension renders Markdown on its page server, and other hosts use their own renderer.

**Attributes and properties** (every element)

| Name | Kind | Meaning |
|---|---|---|
| `data` / `data-json` | property / attribute | The block's data; bad JSON or a shape the element cannot draw shows an error panel and fires `pbs-error`. |
| `answered` / `data-answered` | property / attribute | The submitted `[name, value][]`: locks the element and shows them. `undefined` reopens it. |
| `ref`, or `doc` and `block` attributes | property / attributes | The block's address, copied into every answer's `ref`. |
| `density` | attribute and property | `comfortable` (default) or `compact`. |
| `scheme` | attribute and property | `light` or `dark`, to force a scheme; else the element follows the host's `color-scheme`. |
| `lang` | attribute (or an ancestor's, or the document's) | `zh*` shows Traditional Chinese, anything else English. |
| `refresh()` | method | Draws again. Call it after the host changes `color-scheme` or the document `lang`, which an element cannot observe. |

**Answers.** A pick (`pbs-options`) or a chip (`pbs-suggest`) sends at once and locks itself once a listener takes the event; a listener that calls `preventDefault()` refuses it and the element stays open. A form, review, or checklist stays editable after sending (the status line says "Sent."), so the user can send a changed answer; the host locks it by setting `answered`. A form's required questions are checked before sending. Ctrl/Cmd+Enter sends from a text box.

**Looking after the host: `configure`**

```ts
configure({
  strings: { "zh-Hant": { send: "送出" } },            // per locale, per word (see Strings)
  diagramUrl: (source, scheme) => `/diagram.svg?...`,   // an image URL for pbs-diagram; without it the source is shown
  imageUrl: (ref) => `/files/${ref}`,                    // a review item's `image`; default admits http(s) and raster data URLs only
  pageUrl: (ref) => `/pages/${ref}`,                     // a review item's `page`, shown in a sandboxed frame; without it, its name
});
```

Serve diagram images from `pi-better-show/server` (`mermaidSvg(source, { scheme, transparent: true })`); no diagram markup enters the page. `resetConfiguration()` restores the defaults.

**Tokens.** Set a `--pbs-*` property on an element or any ancestor; each has a `light-dark()` default that follows the host's `color-scheme`.

| Token | Meaning |
|---|---|
| `--pbs-bg` `--pbs-surface` | Panel background; tinted surface (table header, code) |
| `--pbs-fg` `--pbs-muted` | Text; secondary text |
| `--pbs-line` `--pbs-control` | Panel and divider lines; the edge of an input (3:1 against its surface) |
| `--pbs-accent` `--pbs-on-accent` | Buttons, links, selection; text on them |
| `--pbs-note` `--pbs-ok` `--pbs-warn` `--pbs-risk` | Tones |
| `--pbs-radius` `--pbs-gap` | Corner radius; space between blocks and inside them |
| `--pbs-font` `--pbs-mono` `--pbs-font-size` | Type |
| `--pbs-font-display` | Titles and headings (defaults to `--pbs-font`) |

Structure carries `part` names for `::part()` restyling. A panel has the same border on all four sides, or none; a tone shows as a tint, a badge, an icon, and the heading colour, never a coloured or thicker one-sided border. `examples/demo.css` maps the Roundtable and Straw boss tokens as examples.

**Keyboard.** Every control is a native control, labelled. `pbs-mindmap` follows the ARIA tree pattern (arrows move, Right and Left open and close, Enter and Space toggle, Home and End jump); `pbs-tree` follows it too, and opens folders to depth 2 (deeper folders that hold a tagged node open their path) with "expand all" and "collapse all" buttons; `pbs-table` sorts from header buttons (`aria-sort`) and filters from a labelled search box.

## React

```tsx
import { PbsBlock, PbsForm } from "pi-better-show/react";

<PbsBlock segment={segment} doc="chat-7" onAnswer={(answer) => send(encodeAnswer(answer))} />
<PbsForm data={formData} answered={fields} density="compact" onAnswer={...} />
```

One component per element (`PbsCallout` ... `PbsTree`) plus `PbsBlock`, which draws a `parse` segment with the element for its kind and addresses it by its `index`. Props: `data`, `answered`, `onAnswer(answer, event)` (return `false` to refuse), `blockRef`, `density`, `scheme`, `lang`, `className`, `id`, `ref`. A parent render with equal `data` does not redraw the element or clear what the user typed. React 19 or later, as an optional peer dependency.

## The pi extension: `show_doc`

`pi-better-show` is a pi package: it adds `show_doc`, which shows the agent's documents in your default browser or your editor and carries what you do there back to the agent as messages. It replaces `pi-herdr-doc-review` (same tool name, no Herdr, no terminal panes).

```bash
pi uninstall npm:pi-herdr-doc-review     # same tool name: do not load both
pi install npm:pi-better-show
```

Then `/reload` in a running session.

**Tool.** `show_doc({paths, reason, view})` returns at once, without waiting for you.

| View | Opens |
|---|---|
| `page` | The default browser (`open`, `xdg-open`), one tab per page, on a loopback page server behind a random token. `.md` renders with its blocks; `.html`, `.tsx`, `.jsx` run in a sandboxed frame; images show as they are. |
| `edit` (default) | A text file in your editor: `PI_BETTER_SHOW_EDITOR` (a command line, for example `code -r` or `subl`), else `code`, else `open -t` / `xdg-open`. It must return at once; terminal editors do not work. |

**Block problems.** `show_doc` appends the problems of each Markdown document it opens (`checkBlocks`, see Core API) after its usual reply, and the `write` and `edit` tools of the agent get them in their own result for a `.md` file that holds a block fence: `Block problems in questions.md:` then `- line 40 form question "o5" choice 1 label (warning): ...`. Files without block fences are not read by the checker; the YAML parser and Mermaid load on the first file that needs them. Mermaid is checked in the extension with `beautiful-mermaid`, which validates the diagram type and parses what it draws; it does not catch every syntax slip in a flowchart.

**Markdown pages.** Prose is Markdown with raw HTML left as text; every block above becomes its element. Select a passage to comment on it; the panel collects comments and an overall note and sends them in one message. A form, pick, chip, checklist, or review reaches the agent as a message: steered into a running turn, or starting a turn when the agent is idle (`encodeAnswer`). Diagrams are drawn on the server, in the page's colour scheme. Images and links resolve against the page's directory: nothing loads from above it, from a dot file or directory, or from another site. Every response carries a CSP, and the server answers only the loopback host.

**Agent pages.** `.html` and `.tsx`/`.jsx` run in `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`: no storage, no cookies, and no way to answer on its own: the server refuses a POST whose Origin is not its own (a frame's is `null`) or that is not JSON, and an event stream not opened from its own page. A `<form action="cgi-bin:pi-answer">` or `piBetterShow.send(fields)` answers through the page around the frame. The page around the frame carries the same feedback panel as a Markdown page: the frame reports the text the user selects to its parent by `postMessage({source: "pbs-frame", type: "selection", text})` (cut to 2000 characters, accepted only from the page's own frame with origin `null`), the user comments on passages and adds an overall note, and one Send delivers a `feedback` answer named by the HTML `<title>`, else the file name. A TSX page works the same way. A TSX page's default export is a React component, built by esbuild on each load with the React this package ships; `import {PbsBlock, PbsForm, ..., parse, encodeAnswer, send} from "pi-kit"` gives it the wrappers.

**Edit mode.** Your editor opens the file and the extension watches it. When you save, the change since the version the agent last saw goes to it as a zero-context diff (`@@` headers carry line numbers): steered into a running turn, or attached to your next message when idle, so a save never starts a turn. A save in the same instant as the agent's own write is not reported.

**Live reload and closing.** When the agent edits a shown document (`write`, `edit`, or `bash`), open tabs reload. When you close the last tab, the server stops after 30 seconds, and the next `show_doc` starts a new one and opens its pages again; showing a page whose tab you closed opens it again.

**Mini SDD.** When the agent writes a `docs/specs/<slug>/spec.md` whose header says `Status: proposed`, the folder's `decision.md`, `spec.md`, `design.md`, and `verification.md` open as pages on their own (only when pi has a UI); a phase file written later joins. `PI_BETTER_SHOW_AUTO_OPEN=off` stops it.

**Event bus, contract version 2.** Other viewers (the pi-straw-boss GUI) read the same documents through `pi.events`; every payload carries `version: 2`.

| Event | Payload |
|---|---|
| `better-show:documents` | `{version, documents}` in full on every change (a document shown, changed by the agent or saved by you, a page closed) and `[]` when the session ends. Each entry is `{id, kind: "blocks" \| "html" \| "text", display, reason, revision, onScreen, capability?, assets?}`. There is no path: `display` is relative to the working directory, else a `~` path, else the base name. While the page server runs, `capability` is, for a document on screen or open in the editor, the URL that serves the document (Markdown text for `blocks` and `text`; the page as a frame loads it, to be shown in an iframe with `sandbox="allow-scripts allow-forms"`, for `html`) and `assets` the directory URL its relative references resolve against. The list keeps the 32 most recent documents. |
| `better-show:documents-request` | `{version}` asks for the list again; it is sent once on `better-show:documents`. Another `version`, or a request after the session ended, is ignored. |
| `better-show:answer` | `{version, id, answerId, answer}` with `answer` an `Answer`. It reaches the agent as the same message a page answer produces. |
| `better-show:answer-result` | `{version, id, answerId, accepted, reason?}`; `reason` is `closed`, `invalid` (wrong version or shape, or a `text` document), `empty`, or a delivery error. A repeated `answerId` gets its first result back and delivers nothing again. A payload without a string `id` and `answerId` gets no reply. |

A viewer that shows an `html` document in a frame receives its answers as `postMessage({source: "pbs-frame", type: "answer", answerId, answer})` from the frame (origin `"null"`) and replies `{source: "pbs-host", type: "answer-result", answerId, accepted, reason?}`. It also receives `{source: "pbs-frame", type: "selection", text, top?, left?}` whenever the user's selection in the frame changes (`text` is empty when it was cleared) and may offer its own feedback panel with it.

**Moving from pi-herdr-doc-review.** Uninstall it and install this package; `show_doc` keeps its name and parameters. Gone: Herdr panes, nvim and vim, Chawan and terminal-browser, and the `<pi-*>` page-kit tags (write `form`, `review`, ... blocks instead, or use the `pbs-*` elements). The event names changed from `doc-review:*` (version 1) to `better-show:*` (version 2).

Try it without pi: `bun run show` starts the page server on `examples/` with a fake pi that prints each message the agent would receive.

## Development

```
bun install
bun test
bun run check    # tsc, tsc for core without node types, biome
bun run demo     # examples/elements.html on http://127.0.0.1:4177/
```

## License

MIT
