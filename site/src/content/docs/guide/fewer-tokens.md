---
title: Fewer tokens
description: What blocks save against writing an HTML page for the same content, measured.
---

The agent writes data, not a web page: the package owns the layout, the styles, the controls, and the code that sends answers back.
For the four example pages below, writing the blocks took **1,253 output tokens**; asking the same model for one self-contained HTML page with the same content and working controls took **12,364**, about **10 times as many** (90% saved).

| Page | Blocks | HTML page (median) | HTML runs | Saved |
| --- | ---: | ---: | --- | ---: |
| [Decision](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-decide.md): alert, options, form | 347 | 2,770 | 1,651 – 2,917 | 87% |
| [Status](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-status.md): stats, steps, table | 412 | 3,726 | 2,145 – 3,895 | 89% |
| [Structure](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-structure.md): tree, mermaid, diff | 338 | 3,719 | 3,514 – 4,064 | 91% |
| [Review](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-review.md): review, suggest | 156 | 2,149 | 2,008 – 2,478 | 93% |
| Total | 1,253 | 12,364 | | 90% |

The saving repeats on every revision: the agent changes a few YAML lines instead of rewriting markup and script.

<details>
<summary>How it was measured</summary>

Counts are Claude output tokens from `claude -p --model claude-sonnet-5-5` (3 to 5 HTML runs per page; the block count is the file echoed back verbatim), measured on 2026-11-10 with `scripts/token-bench.sh`.
None of the HTML pages had the feedback panel for commenting on a selected passage, which `show_doc` adds to every page.

</details>

## The four pages

![A decision page: an alert, two options, and a form](/pi-better-show/images/decide.png)

![Stats tiles, a steps timeline, and a sortable table](/pi-better-show/images/status.png)

![A directory tree with tags, a flowchart, and a diff](/pi-better-show/images/structure.png)

![Two header designs to compare, with quick-reply chips below](/pi-better-show/images/review.png)
