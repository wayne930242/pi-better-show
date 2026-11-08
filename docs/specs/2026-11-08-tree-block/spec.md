# Tree block

Status: approved

## Goal

Show a directory tree as a block, for reviewing a project's architecture: an agent snapshots a workspace with a script whose flags follow Linux `tree`, puts the output in a document or reply, and annotates it. Every host draws it (show_doc pages, pi-roundtable app, straw boss GUI); text surfaces get an ASCII tree.

## Decisions (Wei-Hung, 2026-11-08)

- Snapshot at write time by a script, not scanned when the page opens. The block carries the snapshot, so it works on every surface.
- The drawn tree: folders collapse and expand; any node can carry a note; nodes can be marked as highlights.
- Not in scope: clicking a file to open it.
- Spec approved by form 2026-11-08 (tree: approve).

## Design

### Block source: ```` ```tree ````

Indented lines, two spaces per level; the first line is the root. A folder ends with `/`. After the name, optional tags in `{}` and a note after ` # `:

```tree
pi-better-show/
  src/ # one package, four entries
    core/ {focus} # parser and text, no DOM
      parse.ts
      validate.ts {new} # checks answers
    elements/ # web components
  tests/
  README.md {changed}
```

- Tags: `new`, `changed`, `removed`, `focus`, `risk`. Unknown tags make the block invalid (it then shows as a code block, like any invalid block).
- `… N more` as a line means entries cut by a limit; the script writes it, the agent may too.
- Hand-written trees are valid: the format is the contract, the script is a convenience.
- Limits: 2,000 nodes and depth 32; over that the block is invalid with a reason.

### Script: `pbs-tree`

A `bin` of the package (`bunx pbs-tree`, `npx pbs-tree`), printing the fence to stdout. Flags follow GNU `tree` where they exist:

| Flag | Meaning |
|---|---|
| `[dir]` | root, default `.` |
| `-L n` | depth |
| `-d` | folders only |
| `-a` | include dot files (default skips them; `.git` always skipped) |
| `-I pattern` | exclude names matching the glob; `|` separates several; repeatable |
| `-P pattern` | list only files matching; folders kept when they hold a match |
| `--gitignore` | honour `.gitignore` files |
| `--dirsfirst` | folders before files |
| `--filelimit n` | do not descend into a folder holding more than n entries; writes `… N more` |
| `--prune` | drop empty folders |
| `--changed-since <rev>` | tag `new`/`changed`/`removed` from `git diff --name-status <rev>` (removed files are listed though absent) |

No symlink following. Output is sorted by name (byte order, `--dirsfirst` aside), so a snapshot is reproducible.

### Core

- `tree` joins `DISPLAY_KINDS`; parse to `TreeData {root: TreeNode}` with `TreeNode {name, dir, tags, note?, children}`.
- `toText`: an ASCII tree in `tree` style (`├──`, `└──`, `│`), tags as `[new]`, notes after ` — `; in a fence on Discord so columns stay aligned.

### Element `pbs-tree`

- ARIA tree pattern like `pbs-mindmap` (arrows, Enter/Space toggle, Home/End).
- Folders show a count of entries; depth > 2 starts collapsed unless it holds a tagged node, which opens its path.
- Tag colours from the theme tokens (`new` ok, `changed` note, `removed` muted strike, `risk` risk, `focus` accent); notes in muted text beside the name.
- Buttons: expand all, collapse all.

### Agent guidance

Tool description and roundtable `APP_FORMATTING`: use `tree` for structure reviews; snapshot with `pbs-tree`, keep it under a few hundred nodes (`-L`, `-I`, `--gitignore`), then add notes and tags by hand.

## Acceptance

- Parse: golden cases for valid trees, each tag, notes, `… N more`, invalid indentation, unknown tag, limits.
- `pbs-tree`: fixture directory tests for every flag, compared against GNU `tree` output shape where the flag exists; `--changed-since` in a temp git repo.
- `toText` golden ASCII for Discord, LINE, plain.
- Element DOM tests: toggle, keyboard, auto-open path to tagged nodes, expand/collapse all.
- `bun test` and `bun run check` clean; red first for each.
- Released as 0.4.0; pi-roundtable picks it up in a later bump (`tree` then draws in the app).
