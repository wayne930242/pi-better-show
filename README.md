# pi-better-show

Interactive blocks for agent-written Markdown. An agent writes fenced blocks (`` ```form ``, `` ```table ``, ...); this package owns what they mean, so every host (a local pi session, a GUI, a chat bridge) shares one block vocabulary, one text fallback for surfaces that cannot draw blocks, and one encoding for the answers users send back.

Status: 0.1.0, core and server. Elements, React wrappers, and the pi extension follow in later units. Design: `docs/specs/2026-11-07-better-show/spec.md`.

```
pi-better-show          core: isomorphic, no DOM, no node APIs; depends on `yaml` only
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

## Development

```
bun install
bun test
bun run check    # tsc, tsc for core without node types, biome
```

## License

MIT
