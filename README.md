# pi-better-show

[繁體中文](README.zh-TW.md)

**Let your [pi](https://github.com/earendil-works/pi) agent show you a page instead of a wall of text, and answer it by clicking.**

**[Documentation](https://wayne930242.github.io/pi-better-show/)** in English and [Traditional Chinese](https://wayne930242.github.io/pi-better-show/zh-tw/): concepts, every block kind, agent pages, and the library.

![A decision page: an alert, two options, and a form](https://raw.githubusercontent.com/wayne930242/pi-better-show/main/docs/images/decide.png)

## Why

- **Blocks, not markup.** The agent writes a few YAML lines per block; the package owns the layout, the controls, and the code that sends answers back.
- **Answers come back as a message.** A pick, a form, a comment on a passage or on a diagram node: one message, in a fixed shape.
- **About 10 times fewer tokens** than the same pages written as HTML (1,253 against 12,364 output tokens, measured).
- **One vocabulary for every host.** Core, custom elements, and React wrappers share one parser, one text fallback, and one answer encoding.

## Install

```bash
pi install npm:pi-better-show
```

Then `/reload` in a running session. If you use `pi-herdr-doc-review`, uninstall it first (`pi uninstall npm:pi-herdr-doc-review`): both register `show_doc`.

## Quick start

Ask the agent to show you something. It writes a Markdown file with blocks and calls `show_doc({paths, reason, view})`, which returns at once:

- `view: "page"` opens the file in your browser; select a passage, or click a diagram node, to comment on it.
- `view: "edit"` (the default) opens it in your editor; your saves reach the agent as one net diff per file.

When you press **Send** on a form, the agent receives:

```text
User submitted a form in the HTML review pane:
- ttl: week
- extras: WAL mode, Nightly backup
```

## Blocks

| Kind | Shows | You answer by |
|---|---|---|
| `alert`, `cards`, `stats` | callouts and tiles with a tone | |
| `options` | choices with pros and cons | picking one |
| `form` | single, multi, and text questions | Send |
| `review` | designs or prototypes to compare | commenting, picking |
| `checklist`, `suggest` | items to tick, quick-reply chips | Send, clicking |
| `table`, `steps`, `tree`, `mindmap` | sortable rows, a timeline, a directory tree, an outline | |
| `mermaid`, `diff` | a diagram you can comment on, a coloured diff | |

HTML and TSX pages, the `pbs-tree` CLI, the library entries, and every schema are in the [documentation](https://wayne930242.github.io/pi-better-show/reference/blocks/).

## Develop

```bash
bun install
bun test
bun run check    # tsc, tsc for core without node types, biome
bun run demo     # every element, on http://127.0.0.1:4177/
cd site && npm ci && npm run check && npm run build   # the documentation site
```

## License

MIT
