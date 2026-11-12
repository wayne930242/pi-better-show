---
title: Develop
description: Run the tests and the demo, edit the docs, and keep the site and its zh-TW twins in step.
---

The repository is the `pi-better-show` package: core, elements, React wrappers, the server entry, and the `show_doc` extension, all TypeScript source.
The package uses Bun for its own code.

## Checks

```bash
bun install
bun test
bun run check    # tsc, tsc for core without node types, biome
bun run demo     # examples/elements.html on http://127.0.0.1:4177/
bun run show     # the show_doc page server on examples/, with a fake pi that prints each message
```

Run `bun test` and `bun run check` before declaring a change verified. `bun run demo` draws every element with its answer log; `bun run show` serves the real page server and prints each message the agent would receive.

## Docs

- `README.md` and `README.zh-TW.md` stay short: the pitch, install, quick start, and a one-line-per-block table.
- This site is the reference. `site/` is a Starlight project served at https://wayne930242.github.io/pi-better-show/ by `.github/workflows/pages.yml`; it uses npm, like the other documentation sites, while the package uses Bun.
- `docs/reference.md` is the source of the Reference pages; `site/scripts/sync.mjs` splits it by H2, so keep its headings stable. `CHANGELOG.md` becomes the changelog page, and `docs/images` is copied to the site.
- `docs/reference.zh-TW.md` mirrors it line for line, and its first line names the English commit it matches.
- `cd site && npm ci && npm run check && npm run build` checks the twin, the hand-written pages' zh-TW twins, and every internal link and anchor.

<details>
<summary>Releasing</summary>

- Bump the version in `package.json` and add the release to `CHANGELOG.md` together; docs-only changes need no bump.
- The `Publish` workflow publishes from a `v*` tag.

</details>
