# Changelog

## Unreleased

Additive.

- `tree` block: an indented directory tree (two spaces per level, the first line the root, a folder ends with `/`, optional `{new|changed|removed|focus|risk}` tags and a ` # note`, `… N more` for cut entries). Core parses it to `TreeData` (limits: 2,000 nodes, 32 levels; `TREE_TAGS`, `TREE_LIMITS`), `tree` joins `BLOCK_KINDS` and `DISPLAY_KINDS`, and `toText` draws it in `tree` style (in a fence on Discord).
- `pbs-tree` element (and `PbsTree` in the React wrappers): ARIA tree, folders collapse and expand, tag badges, notes, entry counts, expand all and collapse all; folders deeper than 2 start closed unless something under them is tagged.
- `pbs-tree` script, a `bin` of the package: `npx pbs-tree [dir]` prints the fence. Flags `-L -d -a -I -P --dirsfirst --filelimit --prune` follow Linux `tree`; `--gitignore` and `--changed-since <rev>` (tags from `git diff --name-status`) are additions. Plain JavaScript, node built-ins only; runs under node and bun.
- The `show_doc` description teaches `tree` and `pbs-tree`.

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
