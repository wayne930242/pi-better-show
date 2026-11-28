# Authoring `show_doc` pages

## Markdown blocks

Use a fenced code block with the kind as its first word. Except where noted, the contents are YAML. Text fields (`body`, `hint`, `note`) take bold, italic, code, `http(s)` links and line breaks, but no HTML. Quote YAML text containing ` #` or `: `. Images and links resolve from the page directory; assets cannot load from above it or from another site.

| Kind | Contents | Use |
| --- | --- | --- |
| GitHub alert | `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]`, with an optional title after the marker | Callout, no fence |
| `mermaid` | Mermaid source: flowchart, state, sequence, class, ER, or xychart (bar/line) | Use flowchart for flows and concept maps |
| `diff` | Unified diff | Colour-coded changes |
| `cards` | List of `{title, tone: note/ok/warn/risk, body}` | Tiles side by side |
| `options` | List of `{title, recommended, body, pros: [...], cons: [...]}`; `recommended` takes `true` or a label | Side-by-side alternatives; picking sends the choice |
| `form` | `{title, submit, questions: [{name, label, hint, required, type, other, choices}]}` | Submit several answers in one message |
| `review` | `{title, submit, pick, pickMode, columns, items: [{name, label, group, image, page, height, body}]}` | Compare screenshots or prototypes; comment on any item |
| `mindmap` | Indented Markdown list, first item is the root | Collapsible concept tree |
| `suggest` | List of strings or `{label, text}` | Click sends `text` (default `label`) as the user's message |
| `checklist` | `{title, submit, items: [...]}`; items are strings or `{name, label, checked, note}` | Submit checked items as a message |
| `table` | `{columns, rows, sort, filter}`; columns are strings or `{name, label, align, type}` (`text`, `number`, `date`), rows are arrays or objects | Sortable columns; `filter: true` adds a filter box |
| `steps` | `{items: [{title, status, when, body}]}`; status is `done`, `doing`, `todo`, or `blocked` | Steps or timeline |
| `stats` | List of `{label, value, delta, tone, note}` | Metric tiles |
| `tree` | Indented text; see below | Expandable directory tree |

`form`: `type` is `single`, `multi` or `text`. Each choice is a label or `{value, label, note, recommended}`. Choice questions include a box for the user's own answer unless `other: false`; set `other` to a string to change its label. Put page decisions at the end of the page; use the question tool for one short standalone question.

`review`: `image` is an image path and `page` an HTML prototype path. Items are named A, B, C… unless they set `name`. `pick: true` or a button label alone selects one favourite. `pickMode: grouped` selects one per group (set `group` on every item); `pickMode: multi` allows any number.

`tree`: The first line is the root; indent two spaces per level. End folder names with `/`; optionally add `{tags}` (`new`, `changed`, `removed`, `focus`, `risk`) and ` # note`, as in `  core/ {focus} # parser and text`. Use `… N more` for cut entries. `npx pbs-tree [dir]` or `bunx pbs-tree` prints the fence. Flags: `-L n`, `-d`, `-a`, `-I pattern`, `-P pattern`, `--dirsfirst`, `--filelimit n`, `--prune`, `--gitignore`, `--changed-since <rev>` (tags `new`/`changed`/`removed` from Git). Keep it under a few hundred nodes (`-L`, `-I`, `--gitignore`); add notes and tags by hand.

## HTML and React

HTML runs as written in a sandbox with scripts and forms, no storage or requests to other sites. Submit fields with `<form action="cgi-bin:pi-answer">` or `piBetterShow.send(fields)`.

Use `.tsx`/`.jsx` with a default-exported React component for tabs, filters and recomputing inputs. React is built in; import sibling modules, not CSS. The `pi-kit` module exports `PbsBlock`, `PbsForm`, `PbsOptions`, `PbsReview`, `PbsChecklist`, `PbsTable`, `PbsCallout`, `PbsCards`, `PbsMindmap`, `PbsSuggest`, `PbsSteps`, `PbsStats`, `PbsDiff`, `PbsDiagram`, `PbsTree`. The components take `data` and `onAnswer`; `PbsBlock` draws a parsed block. The module also exports `parse`, `encodeAnswer`, and `send(answer or fields)`.
