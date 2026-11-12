---
title: 意見
description: 對一段文字或圖上的節點留言，並一次全部送出。
---

每個頁面都有意見面板：選取一段文字留言，或點圖上的節點或邊，再把所有留言連同整體意見在一則訊息中送出。
它是給沒有區塊會問的事用的：「這一步不對」、「為什麼這條箭頭？」。

![意見面板與對選取段落的留言](/pi-better-show/images/feedback.png)

## 對一段文字留言

1. 在頁面上選取文字。旁邊會出現 **Comment** 按鈕。
2. 按下它，在面板裡寫你的留言。
3. 想的話再加別的段落，寫下整體意見，然後按 **Send to agent**。

你的草稿會留在分頁裡，所以能撐過 agent 修改造成的重新載入。agent 收到：

```text
User feedback on the page "Cache store: pick one":

> Either choice needs one restart of the API.
Can we do it on Sunday?

Overall: Go with SQLite.
```

## 對圖留言

在流程圖或狀態圖裡，點節點、邊（它的線或標籤）或 subgraph 標題。用鍵盤時，Tab 到它再按 Enter 或空白鍵。它會以圖自己的用語，作為 quote 加進面板，agent 才能在它寫的原始碼中找到它。

```text
> [Diagram 2, stateDiagram-v2] edge: Paid → Refunded "money back"
```

<details>
<summary>quote 怎麼讀</summary>

- 它以圖在頁面所有圖中的位置與它的種類開頭，接著是 `node: <label>`、`edge: <from> → <to>`（邊的標籤用引號括起來）或 `group: <title>`。
- quote 只指一個元素。兩個元素讀起來一樣時，會加上節點的 id（`node: Check (B)`）、邊兩端的 id（`edge: Check → Done (A → C)`），或依繪製順序的編號（`#2`）。
- 狀態圖的 `[*]` 讀成 `start` 或 `end`，有多個時會以它所在的複合狀態限定（`node: start (in Active)`）。
- 同一個元素只會加進面板一次。
- 只有流程圖與狀態圖有目標；其他圖種維持純圖片。

[參考文件](/pi-better-show/zh-tw/reference/the-pi-extension/#圖的留言)畫出一次點擊如何變成 quote。

</details>

## agent 寫的頁面

HTML 或 TSX 頁面在沙箱 frame 中執行，所以外面的頁面帶著同一個面板：在 frame 裡選取文字就能留言。frame 裡的圖不能點；請改選取圖裡的文字。見 [Agent 頁面](/pi-better-show/zh-tw/guide/agent-pages/)。

## 接著

- [Agent 頁面](/pi-better-show/zh-tw/guide/agent-pages/)：帶自己腳本的頁面。
- [區塊參考](/pi-better-show/zh-tw/reference/blocks/)：你可以回答的區塊。
