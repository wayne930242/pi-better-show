# Changelog

## Unreleased

## 0.7.0 - 2026-11-12

Minor bump: `Configuration` has a new optional `diagramMap` hook and `FeedbackWords` a new `hintDiagram` word (hosts that build their own words add it); the `feedback` answer's shape is unchanged.

- Comment on a diagram, not only on selected text. On a Markdown page, a node, an edge (its line or its label box), or a subgraph title in a flowchart or state diagram is a button over the image: click it, or Tab to it and press Enter or Space, and it goes into the feedback panel as a quote. The agent reads it in the diagram's own words: `> [Diagram 2, stateDiagram-v2] edge: Paid → Refunded "money back"` (the diagram's position on the page and its type, then `node: <label>`, `edge: <from> → <to>` plus the edge's label in quotes, or `group: <title>`). Quotes from selected text are unchanged. A quote names exactly one element, and the same element is not added twice: when two elements of a diagram would read alike, the quote adds a suffix, the node or group id (`node: Check (B)`), an edge's endpoint ids (`edge: Check → Done (A → C)`), or, for the same edge drawn twice, a number in drawing order (`#1`, `#2`); unique elements keep the plain form. A state diagram's `[*]` reads `start` and `end`; with several, each inside a composite state is scoped (`node: start (in Active)`). Mermaid entity codes in labels (`#quot;`) are decoded. A host whose `diagramMap` throws, or does not return a promise, leaves the image drawn. Hover and focus tint the element without moving anything.
- Elements: `configure({ diagramMap })` and the `DiagramMap`, `DiagramTarget`, and `DiagramShape` types; `pbs-diagram` dispatches `pbs-diagram-target` with `{kind, text}`. Elements still parse no markup: the host reads the drawing (the extension's page fetches the diagram SVG and maps it). Other diagram types stay plain images. Pages in a frame (`.html`, `.tsx`) comment on selected text only.

## 0.6.1 - 2026-11-12

Windows support for opening pages and documents; macOS and Linux behave as before.

- Pages open in the default browser through `rundll32 url.dll,FileProtocolHandler`, run by absolute path from `%SystemRoot%\System32` (so a `rundll32` earlier on PATH is never used) with the URL as one argument and no shell, so `&` and `%` in it are passed as written. Before, Windows ran `xdg-open`, which it does not have, and `show_doc` failed.
- Whether a command is on PATH is answered on Windows by scanning PATH for `.exe` and `.com`, without `sh`. A `.cmd` shim (VS Code puts `code.cmd` on PATH) counts as absent, because Node starts it only through a shell; set `PI_BETTER_SHOW_EDITOR` to the editor's `.exe` path to use it. On Windows a backslash in `PI_BETTER_SHOW_EDITOR` is part of the path, not an escape.
- Edit view on Windows: with neither `PI_BETTER_SHOW_EDITOR` nor VS Code, each file opens in Notepad (absolute path). Without `diff` on PATH (Git for Windows keeps it out of the PATH it adds), the user's edits are diffed with `git diff --no-index`, whose header lines and hunk-header context are taken out, so the agent gets the same hunks as from `diff -U0`. `core.autocrlf` is turned off for it, so a change of line endings alone is still reported; a binary change reports git's `Binary files … differ` line.

## 0.6.0 - 2026-11-11

Minor bump: the exported `Deps` has a new required `schedule(run, ms)` (returns a cancel function); hosts that build their own `Deps` add it, or spread `defaultDeps()`.

- Edit view: the user's saves are coalesced. Instead of one message per save, the agent gets the net diff of each file from the version it last saw, once: with the next run when idle (through `before_agent_start`), or steered in after the saves settle for 3 s while the agent works. Several files make one message with a section per file; a change undone before the report sends nothing; the user is told once that edits wait for their next message. A shell command's window joins the same report instead of sending its own. Before the agent writes or edits a file the user changed, that file's change goes out at once. Diffs longer than 200 lines are cut with a count of the lines left out.

## 0.5.2 - 2026-11-10

Documentation only; no code changes. (0.5.1 was tagged but not published: its package test still expected no `pi.image`.)

- The README is shorter: what `show_doc` does, the block kinds, screenshots of four example pages (`examples/readme-*.md`), and the measured token savings of blocks against an equivalent HTML page (`scripts/token-bench.sh`). The API and extension details moved to `docs/reference.md`.
- `pi.image` gives the pi package gallery a preview.

## 0.5.0 - 2026-11-09

Minor bump. Hosts upgrade core and elements together: an older `validateAnswer` refuses an answer that carries a non-blank `pi-note`, so the Other comments box would fail to send.

- `checkBlocks(markdown, options?)` and `formatProblems` in core: for each block, the problems an author needs to fix, with the line in the Markdown file, the key path, a message, and `error` or `warning`. Errors: every invalid block (YAML errors at the line that caused them, a flow map broken by an unquoted ` #` at the line that opened it, tree and mindmap errors at their line), a diagram the `mermaid` hook refuses. Warnings: a plain value cut short by ` #` (silently parsed as a YAML comment), an unknown key at any level the converters read (with the known keys and a near-miss suggestion), a fence that never closes. `BlockProblem` and `CheckOptions` are exported.
- `show_doc` appends the block problems of each Markdown document it opens, page or edit view, after its usual text (`Block problems in notes.md:` then one line per problem); the text is unchanged when there are none.
- A `write` or `edit` of a `.md` file that holds a block fence returns the same list in the tool's own result, so the agent sees it at once. The checker, the YAML parser, and Mermaid load on first use; files without block fences cost a regular expression.
- Mermaid is checked in the extension with `beautiful-mermaid` (diagram type and what it can draw); core takes the check as a hook and stays free of it.

- Every submittable block (`pbs-form`, `pbs-review`, `pbs-checklist`, and `pbs-options` on a pick, with their React wrappers) shows a fixed free-text box "Other comments" (`其他意見` in Traditional Chinese, key `otherComments` in `configure({strings})`). Its trimmed text goes out in the same answer as the reserved field `pi-note` (`NOTE_FIELD`, namespaced like `pi-kind`, exported from core); a blank box sends no field. A locked element shows the note that was sent.
- `validateAnswer` accepts at most one `pi-note` field on every interactive kind, under the usual 1,024-character cap, and does not let it count as an answer or toward the 64-field cap. A form question or checklist item named `pi-note` does not parse (and `validateAnswer` refuses a hand-built block that has one), so the field cannot collide.
- `encodeAnswer` appends `Other comments: <text>` after the text of any non-feedback answer that carries `pi-note`.
- `toText` tells the reader that other comments are welcome in the reply of options, forms, reviews (with or without pick), and checklists. In `pbs-options` the box sits above the options, since a pick sends at once.

## 0.4.0 - 2026-11-08

Additive, with fixes and a performance change.

- `tree` block: an indented directory tree (two spaces per level, the first line the root, a folder ends with `/`, optional `{new|changed|removed|focus|risk}` tags and a ` # note`, `… N more` for cut entries). Core parses it to `TreeData` (limits: 2,000 nodes, 32 levels; `TREE_TAGS`, `TREE_LIMITS`), `tree` joins `BLOCK_KINDS` and `DISPLAY_KINDS`, and `toText` draws it in `tree` style (in a fence on Discord).
- `pbs-tree` element (and `PbsTree` in the React wrappers): ARIA tree, folders collapse and expand, tag badges, notes, entry counts, expand all and collapse all; folders deeper than 2 start closed unless something under them is tagged.
- `pbs-tree` script, a `bin` of the package: `npx pbs-tree [dir]` prints the fence. Flags `-L -d -a -I -P --dirsfirst --filelimit --prune` follow Linux `tree`; `--gitignore` and `--changed-since <rev>` (tags from `git diff --name-status`) are additions. Plain JavaScript, node built-ins only; runs under node and bun.
- The `show_doc` description teaches `tree` and `pbs-tree`.
- The extension loads on demand. Importing and installing it no longer loads the page server, the Markdown renderer (markdown-it), Mermaid (beautiful-mermaid), the page bundler (esbuild, React), or the YAML parser; they load on the first `show_doc` call that opens a page. An idle pi session pays for the tool registration and the bus listeners only: the import cost drops from about +72 MB RSS to about +41 MB, of which about 23 MB is Node's TypeScript loader and 11 MB is typebox, both already in a pi process. `createPageServer` exported from `./extension` now loads the server on its first call and has the same signature.
- `show_doc` no longer fails with "cannot read" when it is issued in the same assistant message as the `write` that creates its file. pi runs the calls of one message in parallel, so `show_doc` read the file before the write finished (it did not depend on an absolute or relative path). The tool is now sequential: the write finishes first.
- Review fixes: two first `show_doc` calls at once start one page server, not two (the second leaked its port); `pbs-tree` keeps a file named like `a #` with tags readable as name and tags; `validateAnswer` refuses an answer whose `kind` is not a string or whose `fields` are not string pairs, instead of throwing.

## 0.3.1 - 2026-11-08

Fix.

- HTML and TSX pages have the feedback panel again. The panel is mounted in the page around the sandboxed frame; the frame hook reports the user's text selection to the parent (`postMessage`, bounded, accepted only from the page's own frame), so a passage can be commented on and sent with an overall note as a `feedback` answer, as on a Markdown page. The sandbox and CSP are unchanged. The page is named by its HTML `<title>`, else the file name.

## 0.3.0 - 2026-11-08

Additive.

- `INTERACTIVE_KINDS` (`options`, `suggest`, `form`, `checklist`, `review`), exported beside `DISPLAY_KINDS`.
- `toText`: a `checklist` now ends with a reply instruction like the other interactive kinds.
- `toText` takes `lang` (`en` default, `zh-TW`) for the reply instructions; an unknown value is `en`.
- `validateAnswer(block, answer)` checks an untrusted answer against its block and returns `{ ok, reason }`.
- `optionName` is shared by `validateAnswer` and the `options` element.
- Tests: a `multi` form question carries all chosen values; a form, checklist, or review sends nothing until Send; an empty required `multi` question is refused.
