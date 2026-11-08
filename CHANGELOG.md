# Changelog

## Unreleased

Fix and performance.

- The extension loads on demand. Importing and installing it no longer loads the page server, the Markdown renderer (markdown-it), Mermaid (beautiful-mermaid), the page bundler (esbuild, React), or the YAML parser; they load on the first `show_doc` call that opens a page. An idle pi session pays for the tool registration and the bus listeners only: the import cost drops from about +72 MB RSS to about +41 MB, of which about 23 MB is Node's TypeScript loader and 11 MB is typebox, both already in a pi process. `createPageServer` exported from `./extension` now loads the server on its first call and has the same signature.
- `show_doc` no longer fails with "cannot read" when it is issued in the same assistant message as the `write` that creates its file. pi runs the calls of one message in parallel, so `show_doc` read the file before the write finished (it did not depend on an absolute or relative path). The tool is now sequential: the write finishes first.

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
