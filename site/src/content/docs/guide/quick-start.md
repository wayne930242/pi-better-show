---
title: Quick start
description: Ask for a page, answer it by clicking, and choose between the page and edit views.
---

1. **Ask the agent to show you something.** "Lay out the two cache options and let me pick" is enough. The agent writes a Markdown file with blocks and calls `show_doc`; the call returns at once, so the agent is not waiting on you.
2. **Read the page.** `view: "page"` opens it in your default browser: prose, an alert, options side by side, a form.
3. **Answer by clicking.** Pick an option, fill the form, press Send. Select a passage to comment on it, and the feedback panel collects your comments with an overall note.
4. **The agent reads your answer as a message.** It steers into a running turn, or starts a turn when the agent is idle.

![A decision page: an alert, two options, and a form](/pi-better-show/images/decide.png)

When you press **Send** on the form above, the agent receives:

```text
User submitted a form in the HTML review pane:
- ttl: week
- extras: WAL mode, Nightly backup
- note: The API runs on two hosts next month.
```

## Page or edit

`show_doc` has two views. Use the page to decide and the editor to write.

| View | Opens | Use it for | Your answer |
| --- | --- | --- | --- |
| `page` | Your default browser | Reading and deciding: blocks, diagrams, designs to compare | Clicks, forms, and comments, each sent as a message |
| `edit` (the default) | Your editor | Specs and drafts you want to change in place | Your saves, as one net diff per file |

Open pages reload when the agent edits the file. Close the last tab and the page server stops after 30 seconds; the next `show_doc` starts it again.

<details>
<summary>What you may see</summary>

- A notice that your edits go to the agent with your next message: in `edit` view the agent reads your saves when your next run starts, or after you stop saving for 3 seconds while it works.
- A line in the agent's `write` or `edit` result such as `Block problems in questions.md:` with a line number: a block did not parse, and the page shows its source and the reason until it is fixed.
- A `Mini SDD` spec (`docs/specs/<slug>/spec.md` with `Status: proposed`) opening on its own. `PI_BETTER_SHOW_AUTO_OPEN=off` stops that.

</details>

## Next

- [Concepts](/pi-better-show/guide/concepts/): blocks, answers, and the text fallback.
- [Feedback](/pi-better-show/guide/feedback/): commenting on text and on diagrams.
- [Block reference](/pi-better-show/reference/blocks/): every block kind.
