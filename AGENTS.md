# Agent Working Agreements: pi-better-show

This repository is the `pi-better-show` package: the block vocabulary (core, custom elements, React wrappers, the server entry) and the `show_doc` extension for pi. The documentation site at https://wayne930242.github.io/pi-better-show/ describes it.

## Core Directives

- All prompts, agent instructions, and code comments are in English; user communication is in Traditional Chinese (繁體中文).
- Documentation states expected behavior directly, without defensive phrasing.
- Commit messages follow Conventional Commits and do not mention AI tools.
- The package ships TypeScript source with no build step; source uses erasable syntax only, and `src/core` imports only its own files and `yaml`.

## Development Workflow

- `bun install --frozen-lockfile`, then `bun test` and `bun run check` (tsc, tsc for core without node types, biome); both run in CI.
- `bun run demo` draws every element on http://127.0.0.1:4177/; `bun run show` starts the `show_doc` page server on `examples/` with a fake pi.
- A user-visible change adds a line to `CHANGELOG.md`; bump `package.json` only for a release. A `v*` tag publishes to npm.

## Docs

- `README.md` and `README.zh-TW.md` stay short: the pitch, why, install, quick start, a one-line-per-kind block table, and develop. The behavior reference goes on the site, and a user-facing feature gets its guide page in both languages.
- `site/` is the Starlight documentation site, served by `.github/workflows/pages.yml`; it uses npm (its own `package-lock.json`), while the package uses bun. `site/scripts/sync.mjs` generates the Reference pages from `docs/reference.md` split by H2, the changelog page from `CHANGELOG.md`, and copies `docs/images` to the site, so `docs/` stays the one source for long behavior text; keep the reference's headings stable, since pages and the README link to them. `cd site && npm ci && npm run check && npm run build` checks the twin and every internal link and anchor.
- `docs/reference.zh-TW.md` mirrors `docs/reference.md` line for line, and its first line names the English commit it matches. A change to the English file changes the same lines of the twin and moves that commit; `npm --prefix site run check` fails when the headings, line kinds, or backticked tokens no longer match and lists the English commits not yet translated. Each hand-written page under `site/src/content/docs/` has a twin under `zh-tw/` with the same headings, folds, diagrams, and tables, which the same check enforces.
- Each Mermaid diagram carries a comment naming the source files it was checked against; a change to that code rechecks the diagram.
- Screenshots in `docs/images` come from `bun run show` on a Markdown file of the examples; `docs/images/blocks/*.png` are the block reference's one-per-kind crops.
