# Tree block: decisions where the spec is silent

Made while implementing; each is cheap to change.

## Format and core

- `TreeNode` has one field beyond the spec, `more?: number`, set on a `… N more` line (its `name` stays `… N more`). Elements and `toText` read it instead of matching the name.
- Limits: the root is level 1, so 32 levels means 31 folders below the root; the 2,000 nodes count every line, `… N more` and the root included.
- Only spaces and tabs are trimmed from a line and its parts, so a no-break space at the edge of a name survives (the script uses it, see below).
- Errors name the line (`line 3: ...`) except the structural ones (empty tree, second root, limits).
- `toText` writes notes after ` — ` in every flavor (the spec's wording), not the ` - ` that other kinds use on LINE and plain text. Notes lose their Markdown (the tree sits in a fence). LINE and plain indent the tree by two spaces, like other preformatted output; Discord fences it.

## Element

- A folder's count reads `entries: 3` (`3 項`), counting the entries a `… N more` line stands for; it is hidden on a folder with no children.
- Depth 0 is the root: folders at depth 0 to 2 start open; deeper ones start closed unless something *under* them is tagged (a tagged folder alone does not open).
- Collapse all closes every folder except the root, which stays open. Open state survives a redraw (language, density, scheme) and resets with new data.
- Tag text is the tag as written (`new`, `changed`, ...), not translated: it is the block's vocabulary.

## Script

- It is plain JavaScript in `bin/`, not TypeScript: node refuses to strip types in `node_modules`, where `npx` runs it. A test keeps its limits in step with `TREE_LIMITS` by building trees at the limit.
- `-P` keeps only folders that hold a match, as the spec says (GNU `tree` needs `--prune` for that), looks below the `-L` cut to decide, and is ignored with `-d`.
- `--prune` counts what `-L` hides: a folder cut by `-L` is not empty (GNU `tree --prune -L 1` drops it). `--prune` is ignored with `-d`, as in GNU `tree`.
- `… N more` comes from `--filelimit` only, with N the entries that would have been listed (after `-a`, `-I`, `.gitignore`, `-d`). `-L` cuts without a line, as GNU `tree` does.
- `--gitignore` reads `.gitignore` files only, those below the folder and those above it up to the first folder with a `.git`; not `.git/info/exclude` or the global excludes.
- `--changed-since`: `git diff --name-status --no-renames --relative <rev>` against the working tree, so staged and unstaged edits count and a rename is a removed and a new file. Untracked, not-ignored files are tagged `new`. The other flags apply to removed paths; a folder that exists only as the home of removed files is shown only while one of them is, and `-d` hides them.
- Output safety: a control character in a name becomes `?` (GNU `tree -q`); a no-break space replaces the space where a plain one would read as a note (` # `), as tags (a trailing `{...}`), as an edge space, or as a `… N more` line. The fence is longer than any backtick run in a name.
- Over the block's limits it exits 1 with the count and what to narrow, rather than cutting the tree.
