# Block check

Status: proposed

Requested by the boss, 2026-11-09; implemented on feat/block-check, awaiting review.

## Goal

An agent learns when a block it wrote is broken or silently lost data. Before this, an invalid block showed as source on the page and `show_doc` said only that it had opened the file; a ` #` inside a value parsed without an error and dropped the rest of the text.

## Design

- Core `checkBlocks(markdown, {mermaid?})` returns `BlockProblem {kind, line, path, message, severity}`; `formatProblems(name, problems)` words them. Lines are lines of the Markdown file (`parse` has a `locate` twin that keeps where each segment starts).
- `error`: every invalid segment. A YAML error is reported at YAML's line, except a broken flow collection, whose error points past it: the check looks back for the line that opened it with a ` #` in it. Tree and mindmap errors take the line they name.
- `warning`: a plain scalar followed on its line by a ` #` comment (the text after it is lost; the message gives the quoted form); a key the converters do not read, per level, with the known keys and a near-miss suggestion; a fence that never closes.
- Mermaid: core has no parser. The extension passes `beautiful-mermaid`'s `mermaidSvg` as the hook, loaded only for a file with a `mermaid` fence. It validates the diagram type and what the renderer can draw; most flowchart slips still pass.
- `show_doc` appends the list per Markdown document (page or edit view). The tool-result hook appends it to the `write` and `edit` result of a `.md` file that holds a block fence (pi's `tool_result` handler may return replacement `content`). Files without a block fence cost one regular expression; the checker and YAML load on first use.

## Not covered

A misspelled fence kind (`` ```option ``) is ordinary code to the parser and is not reported. Row keys of a table are not checked against its columns. A comment after a quoted value is intentional YAML and is not flagged.
