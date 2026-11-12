---
title: 宿主
description: 在 pi 之外使用區塊詞彙，透過 core、元素、React 與 server 進入點。
---

pi extension 是詞彙的一個宿主。GUI、網頁應用程式或聊天橋接可以是另一個，因為剖析器、純文字備援與答案編碼都是函式庫。

| 進入點 | 用途 |
| --- | --- |
| `pi-better-show` | `parse`、`toText`（純文字或 Discord 備援）、`encodeAnswer`、`validateAnswer`、`checkBlocks` |
| `pi-better-show/elements` | 不依賴框架的自訂元素，每種區塊一個 |
| `pi-better-show/react` | 元素的 React 包裝 |
| `pi-better-show/server` | Mermaid 轉 SVG 與 Unicode 文字 |
| `pi-better-show/extension` | `show_doc` extension 與它的事件匯流排 |

## 網頁宿主

剖析 Markdown，把每個區塊的資料交給它的元素，並監聽答案。

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
<summary>宿主仍要負責什麼</summary>

- 區塊之間的文章：沒有整份文件的元素，所以宿主自己渲染 `markdown` 片段。
- 圖片、review 圖片與原型：`configure({ diagramUrl, imageUrl, pageUrl })`，Mermaid 由 `pi-better-show/server` 繪製。
- 送出後鎖定元素：把 `answered` 設成已送出的欄位。
- 信任：`validateAnswer` 檢查來自不受信任用戶端的答案。
- 外觀：元素或任何祖先上的 `--pbs-*` 自訂屬性。

[元素參考](/pi-better-show/zh-tw/reference/elements/)涵蓋這些項目的每一項。

</details>

## 聊天宿主

畫不了區塊的介面，向 `toText` 要同一份文件的文字版，附上使用者可以照著做的回覆指示。

```ts
import { mermaidText } from "pi-better-show/server";
import { parse, toText } from "pi-better-show";

toText(parse(reply), { flavor: "discord", mermaid: mermaidText, lang: "zh-TW" });
```

flavor 有 `discord`、`line` 與 `plain`。`keep` 列出介面自己會畫的種類，以原文輸出。

## pi 旁邊的檢視器

想要 `show_doc` 所顯示文件的檢視器（pi-straw-boss 的 GUI 就是），從 `better-show:documents` 事件讀取，並在 `better-show:answer` 上送回答案。[事件匯流排](/pi-better-show/zh-tw/reference/the-pi-extension/#事件匯流排)列出四個事件與它們的 payload；每個 payload 都帶 `version: 2`。

## 接著

- [Core API](/pi-better-show/zh-tw/reference/core-api/) 與[元素](/pi-better-show/zh-tw/reference/elements/)：契約。
- [開發](/pi-better-show/zh-tw/guide/develop/)：執行畫出每個元素的 demo。
