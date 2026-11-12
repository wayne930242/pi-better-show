---
title: Hosts
description: Use the block vocabulary outside pi, through core, elements, React, and the server entry.
---

The pi extension is one host of the vocabulary. A GUI, a web app, or a chat bridge can be another, because the parser, the text fallback, and the answer encoding are a library.

| Entry | Use it for |
| --- | --- |
| `pi-better-show` | `parse`, `toText` (a plain-text or Discord fallback), `encodeAnswer`, `validateAnswer`, `checkBlocks` |
| `pi-better-show/elements` | Framework-free custom elements, one per block kind |
| `pi-better-show/react` | React wrappers over the elements |
| `pi-better-show/server` | Mermaid to SVG and to Unicode text |
| `pi-better-show/extension` | The `show_doc` extension and its event bus |

## A web host

Parse the Markdown, give each block's data to its element, and listen for the answer.

```ts
import { encodeAnswer, parse } from "pi-better-show";
import { TAGS } from "pi-better-show/elements";

for (const segment of parse(markdown)) {
  if (segment.type !== "block") continue;
  const element = document.createElement(TAGS[segment.kind]);
  element.ref = { doc: "chat-7", block: segment.index };
  element.data = segment.data;
  element.addEventListener("pbs-answer", (event) => send(encodeAnswer(event.detail)));
  stage.append(element);
}
```

<details>
<summary>What the host still owns</summary>

- Prose between blocks: there is no whole-document element, so the host renders the `markdown` segments itself.
- Diagram images, review images, and prototypes: `configure({ diagramUrl, imageUrl, pageUrl })`, with Mermaid drawn by `pi-better-show/server`.
- Locking an element after delivery: set `answered` to the submitted fields.
- Trust: `validateAnswer` checks an answer from an untrusted client.
- The look: `--pbs-*` custom properties on an element or any ancestor.

[The elements reference](/pi-better-show/reference/elements/) covers each of these.

</details>

## A chat host

A surface that cannot draw blocks asks `toText` for the same document as text, with reply instructions the reader can follow.

```ts
import { mermaidText } from "pi-better-show/server";
import { parse, toText } from "pi-better-show";

toText(parse(reply), { flavor: "discord", mermaid: mermaidText, lang: "zh-TW" });
```

Flavors are `discord`, `line`, and `plain`. `keep` lists the kinds the surface draws itself, emitted as their original text.

## A viewer beside pi

A viewer that wants the documents `show_doc` shows (the pi-straw-boss GUI does) reads them from the `better-show:documents` event, and sends answers back on `better-show:answer`. [The event bus](/pi-better-show/reference/the-pi-extension/#event-bus) lists the four events and their payloads; every payload carries `version: 2`.

## Next

- [Core API](/pi-better-show/reference/core-api/) and [Elements](/pi-better-show/reference/elements/): the contracts.
- [Develop](/pi-better-show/guide/develop/): run the demo that draws every element.
