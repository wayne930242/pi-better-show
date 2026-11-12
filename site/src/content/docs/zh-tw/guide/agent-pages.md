---
title: Agent 頁面
description: 區塊不夠用時，agent 自己寫的 HTML 與 TSX 頁面。
---

agent 需要會重新計算的輸入、分頁或自己的版面時，會寫一個頁面，而不是區塊：一個 `.html` 檔，或 `.tsx`、`.jsx` 檔。
`show_doc` 在沙箱 frame 中執行它，頁面透過 frame 外面的頁面向 agent 作答。

## HTML 頁面

action 是 `cgi-bin:pi-answer` 的表單，在送出時把欄位送給 agent。
腳本可以用 `piBetterShow.send` 做同樣的事。

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

agent 會在頁面的名稱底下收到答案，所以它知道這是它自己寫的頁面送的：

```text
Agent page notes.html sent:
User submitted a form in the HTML review pane:
- name: Ada
- colour: red
```

<details>
<summary>`send` 接受什麼</summary>

- 物件或 `[name, value]` 配對的清單會變成 `form` 答案；只送出字串值。
- `Answer`（`{kind, fields}`）原樣送出，所以頁面可以用任何種類作答。
- 它回傳 `{accepted, reason?}`；頁面伺服器沒有回覆時，等一陣子就放棄。

</details>

## TSX 頁面

需要狀態的頁面，把一個 React 元件寫成預設匯出。
伺服器每次載入都用 esbuild 建置它，使用這個套件自帶的 React，`pi-kit` 模組則給它區塊的包裝元件。

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
<summary>`pi-kit` 匯出什麼</summary>

- 每種區塊一個包裝元件（`PbsBlock`、`PbsForm`、`PbsOptions`、`PbsReview`、`PbsChecklist`、`PbsTable`、`PbsCallout`、`PbsCards`、`PbsMindmap`、`PbsSuggest`、`PbsSteps`、`PbsStats`、`PbsDiff`、`PbsDiagram`、`PbsTree`），接受 `data` 與 `onAnswer`；`PbsBlock` 畫出一個剖析好的片段。
- core 的 `parse`、`inline` 與 `encodeAnswer`，以及 `send`。
- 同層的模組可以自由 import；CSS 的 import 會被清空。

</details>

## 沙箱

頁面在 `<iframe sandbox="allow-scripts allow-forms">` 中執行，沒有 `allow-same-origin`：沒有儲存空間、沒有 cookie、不從其他網站載入任何東西，也沒有自己作答的辦法。
伺服器會拒絕 frame 自己發出的請求；frame 透過 `postMessage` 請外面的頁面代為傳遞答案。

<details>
<summary>答案如何離開 frame</summary>

[參考文件](/pi-better-show/zh-tw/reference/the-pi-extension/#agent-頁面)有規則：父頁面信任哪些訊息，以及伺服器檢查什麼。

</details>

## 接著

- [意見](/pi-better-show/zh-tw/guide/feedback/)：frame 外面的面板。
- [區塊參考](/pi-better-show/zh-tw/reference/blocks/)：區塊夠用時，優先用區塊。
