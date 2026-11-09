# Changelog

## Unreleased

Minor bump. Hosts must upgrade core together with the elements: an older `validateAnswer` refuses an answer that carries a non-blank note (an unknown field), so the box would fail to send.

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
