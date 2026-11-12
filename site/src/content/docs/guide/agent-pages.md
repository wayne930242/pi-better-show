---
title: Agent pages
description: HTML and TSX pages the agent writes when blocks are not enough.
---

When an agent needs inputs that recompute, tabs, or a layout of its own, it writes a page instead of blocks: an `.html` file, or a `.tsx` or `.jsx` file.
`show_doc` runs it in a sandboxed frame, and the page answers the agent through the page around the frame.

## An HTML page

A form whose action is `cgi-bin:pi-answer` sends its fields to the agent when submitted.
A script can do the same with `piBetterShow.send`.

```html
<form action="cgi-bin:pi-answer">
  <label>Name <input name="name" value="Ada"></label>
  <label>Colour
    <select name="colour"><option>red</option><option>blue</option></select>
  </label>
  <button type="submit">Send to the agent</button>
</form>
<script>
  document.querySelector("button").addEventListener("click", () => {
    window.piBetterShow.send({ source: "script", clicked: "yes" });
  });
</script>
```

The agent receives the answer under the page's name, so it knows a page it wrote sent it:

```text
Agent page notes.html sent:
User submitted a form in the HTML review pane:
- name: Ada
- colour: red
```

<details>
<summary>What `send` takes</summary>

- An object or a list of `[name, value]` pairs becomes a `form` answer; only string values are sent.
- An `Answer` (`{kind, fields}`) is sent as it is, so a page may answer as any kind.
- It resolves with `{accepted, reason?}`; with no reply from the page server it gives up after a wait.

</details>

## A TSX page

A page that needs state writes a React component as its default export.
The server builds it with esbuild on each load, with the React this package ships, and the `pi-kit` module gives it the block wrappers.

```tsx
import { PbsBlock, PbsChecklist, parse, send } from "pi-kit";
import { useState } from "react";

const blocks = parse("```options\n- {title: Small, body: Fewer parts}\n- {title: Large, body: More room}\n```");

export default function Page() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <button type="button" onClick={() => setCount(count + 1)}>Clicked {count} times</button>
      <button type="button" onClick={() => void send({ clicks: String(count) })}>Send the count</button>
      {blocks.map((segment) =>
        segment.type === "block" ? (
          <PbsBlock key={segment.index} segment={segment} onAnswer={(answer) => void send(answer)} />
        ) : null,
      )}
      <PbsChecklist
        data={{ title: "Ready?", items: [{ name: "tests", label: "Tests pass" }] }}
        onAnswer={(answer) => void send(answer)}
      />
    </main>
  );
}
```

<details>
<summary>What `pi-kit` exports</summary>

- A wrapper per block (`PbsBlock`, `PbsForm`, `PbsOptions`, `PbsReview`, `PbsChecklist`, `PbsTable`, `PbsCallout`, `PbsCards`, `PbsMindmap`, `PbsSuggest`, `PbsSteps`, `PbsStats`, `PbsDiff`, `PbsDiagram`, `PbsTree`) taking `data` and `onAnswer`; `PbsBlock` draws a parsed segment.
- `parse`, `inline`, and `encodeAnswer` from core, and `send`.
- Sibling modules import freely; CSS imports are emptied.

</details>

## The sandbox

A page runs in `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`: no storage, no cookies, nothing loaded from other sites, and no way to answer on its own.
The server refuses a request from the frame itself; the frame asks the page around it, by `postMessage`, to carry the answer.

<details>
<summary>How an answer leaves the frame</summary>

[The reference](/pi-better-show/reference/the-pi-extension/#agent-pages) has the rules: which messages the parent trusts, and what the server checks.

</details>

## Next

- [Feedback](/pi-better-show/guide/feedback/): the panel around the frame.
- [Block reference](/pi-better-show/reference/blocks/): prefer blocks when they are enough.
