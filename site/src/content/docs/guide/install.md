---
title: Install
description: Install pi-better-show for pi, or use it as a library.
---

pi-better-show is a pi package. One command adds the `show_doc` tool.

```bash
pi install npm:pi-better-show
```

Then `/reload` in a running session.

## Requirements

- [pi](https://github.com/earendil-works/pi), the coding agent that loads the package.
- A default browser for `view: "page"`, and an editor for `view: "edit"` (VS Code, or the one `PI_BETTER_SHOW_EDITOR` names).

<details>
<summary>Replacing pi-herdr-doc-review</summary>

If you use `pi-herdr-doc-review`, uninstall it first (`pi uninstall npm:pi-herdr-doc-review`): both register `show_doc`, so only one may load. `show_doc` keeps its name and parameters; Herdr panes, terminal editors, and the `<pi-*>` page-kit tags are gone. [The reference](/pi-better-show/reference/the-pi-extension/#moving-from-pi-herdr-doc-review) lists what changed.

</details>

<details>
<summary>Without pi</summary>

The block vocabulary is a library too: `npm install pi-better-show` gives a host core (`pi-better-show`), custom elements (`pi-better-show/elements`), React wrappers (`pi-better-show/react`), and Mermaid drawing (`pi-better-show/server`). [Hosts](/pi-better-show/guide/hosts/) shows how a host puts them together.

The package ships TypeScript source with no build step, so it loads under Node's type stripping, in Bun, and in bundler pipelines.

</details>

## Next

- [Quick start](/pi-better-show/guide/quick-start/): a first page and its answer.
- [Concepts](/pi-better-show/guide/concepts/): what a block is and how answers travel.
