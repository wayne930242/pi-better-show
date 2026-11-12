---
title: Feedback
description: Comment on a passage or on a node of a diagram, and send it all in one message.
---

Every page has a feedback panel: select a passage and comment on it, or click a node or an edge in a diagram, then send all your comments with an overall note in one message.
It is for what no block asks: "this step is wrong", "why this arrow?".

![The feedback panel with a comment on a selected passage](/pi-better-show/images/feedback.png)

## Comment on a passage

1. Select text on the page. A **Comment** button appears beside it.
2. Press it, and write your comment in the panel.
3. Add more passages if you like, write an overall note, and press **Send to agent**.

Your drafts stay in the tab, so they survive the reload an agent's edit causes. The agent receives:

```text
User feedback on the page "Cache store: pick one":

> Either choice needs one restart of the API.
Can we do it on Sunday?

Overall: Go with SQLite.
```

## Comment on a diagram

In a flowchart or a state diagram, click a node, an edge (its line or its label), or a subgraph title. From the keyboard, Tab to it and press Enter or Space. It joins the panel as a quote in the diagram's own words, so the agent can find it in the source it wrote.

```text
> [Diagram 2, stateDiagram-v2] edge: Paid → Refunded "money back"
```

<details>
<summary>How a quote reads</summary>

- It starts with the diagram's position among the page's diagrams and its type, then `node: <label>`, `edge: <from> → <to>` (with the edge's label in quotes), or `group: <title>`.
- A quote names exactly one element. When two elements would read alike, it adds the node's id (`node: Check (B)`), an edge's endpoint ids (`edge: Check → Done (A → C)`), or a number in drawing order (`#2`).
- A state diagram's `[*]` reads `start` or `end`, scoped by its composite state when there are several (`node: start (in Active)`).
- The same element is added to the panel only once.
- Only flowcharts and state diagrams have targets; other diagrams stay plain images.

[The reference](/pi-better-show/reference/the-pi-extension/#diagram-comments) draws how a click becomes a quote.

</details>

## Pages the agent wrote

An HTML or TSX page runs in a sandboxed frame, so the page around it carries the same panel: select text in the frame and comment on it. Diagrams in a frame cannot be clicked; select their text instead. See [Agent pages](/pi-better-show/guide/agent-pages/).

## Next

- [Agent pages](/pi-better-show/guide/agent-pages/): pages with their own script.
- [Block reference](/pi-better-show/reference/blocks/): the blocks you can answer.
