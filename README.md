# pi-better-show

Interactive blocks for agent-written Markdown. An agent writes fenced blocks (`` ```form ``, `` ```table ``, ...); this package owns what they mean, so every host (a local pi session, a GUI, a chat bridge) shares one block vocabulary, one text fallback for surfaces that cannot draw blocks, and one encoding for the answers users send back.

Status: 0.1.0, core, server, elements, and React wrappers. The pi extension follows in a later unit. Design: `docs/specs/2026-11-07-better-show/spec.md`.

```
pi-better-show          core: isomorphic, no DOM, no node APIs; depends on `yaml` only
pi-better-show/elements browser: framework-free custom elements, one per block kind (no yaml, no node APIs)
pi-better-show/react    thin React wrappers over the elements (React is an optional peer)
pi-better-show/server   node: Mermaid to SVG and to Unicode text (beautiful-mermaid)
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

A block whose body is not valid YAML, or does not fit its schema, becomes an `invalid` segment that keeps its source and the reason; nothing throws.

## Core API

```ts
import { parse, toText, inline, encodeAnswer } from "pi-better-show";

parse(markdown: string): Segment[]
```

Splits a document into `{type: "markdown", text}`, `{type: "block", kind, data, index}`, and `{type: "invalid", kind, source, error}` segments, in order. `data` is typed per kind (`BlockDataMap`). `index` counts the document's blocks of every kind from 0; invalid blocks take no number. `index` is the block's address for answers.

```ts
toText(segments: Segment[], profile: TextProfile): string

interface TextProfile {
  flavor: "discord" | "line" | "plain";   // Discord Markdown, or plain text
  width?: number;                          // columns a diagram may take; default 60
  mermaid?: (source: string, width: number) => string | undefined;
}
```

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

`TAGS` maps a block kind to its tag. `pbs-doc` (a whole document) is not part of this release: it comes with the extension.

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

**Keyboard.** Every control is a native control, labelled. `pbs-mindmap` follows the ARIA tree pattern (arrows move, Right and Left open and close, Enter and Space toggle, Home and End jump); `pbs-table` sorts from header buttons (`aria-sort`) and filters from a labelled search box.

## React

```tsx
import { PbsBlock, PbsForm } from "pi-better-show/react";

<PbsBlock segment={segment} doc="chat-7" onAnswer={(answer) => send(encodeAnswer(answer))} />
<PbsForm data={formData} answered={fields} density="compact" onAnswer={...} />
```

One component per element (`PbsCallout` ... `PbsDiagram`) plus `PbsBlock`, which draws a `parse` segment with the element for its kind and addresses it by its `index`. Props: `data`, `answered`, `onAnswer(answer, event)` (return `false` to refuse), `blockRef`, `density`, `scheme`, `lang`, `className`, `id`, `ref`. A parent render with equal `data` does not redraw the element or clear what the user typed. React 19 or later, as an optional peer dependency.

## Development

```
bun install
bun test
bun run check    # tsc, tsc for core without node types, biome
bun run demo     # examples/elements.html on http://127.0.0.1:4177/
```

## License

MIT
