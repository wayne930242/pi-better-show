---
title: 安裝
description: 為 pi 安裝 pi-better-show，或把它當函式庫用。
---

pi-better-show 是一個 pi 套件。一行指令就加入 `show_doc` 工具。

```bash
pi install npm:pi-better-show
```

接著在執行中的 session 裡 `/reload`。

## 需求

- [pi](https://github.com/earendil-works/pi)，載入這個套件的 coding agent。
- `view: "page"` 需要預設瀏覽器，`view: "edit"` 需要編輯器（VS Code，或 `PI_BETTER_SHOW_EDITOR` 指定的那個）。

<details>
<summary>取代 pi-herdr-doc-review</summary>

如果你用 `pi-herdr-doc-review`，請先移除它（`pi uninstall npm:pi-herdr-doc-review`）：兩者都註冊 `show_doc`，只能載入一個。`show_doc` 保留名稱與參數；Herdr pane、終端機編輯器與 `<pi-*>` page-kit 標籤都沒有了。[參考文件](/pi-better-show/zh-tw/reference/the-pi-extension/#從-pi-herdr-doc-review-遷移)列出了改變的地方。

</details>

<details>
<summary>不用 pi</summary>

區塊詞彙也是一個函式庫：`npm install pi-better-show` 會給宿主 core（`pi-better-show`）、自訂元素（`pi-better-show/elements`）、React 包裝（`pi-better-show/react`）與 Mermaid 繪圖（`pi-better-show/server`）。[宿主](/pi-better-show/zh-tw/guide/hosts/)說明宿主怎麼把它們組起來。

這個套件發布的是 TypeScript 原始碼，沒有建置步驟，所以能在 Node 的型別剝除、Bun 與打包工具的流程中載入。

</details>

## 接著

- [快速開始](/pi-better-show/zh-tw/guide/quick-start/)：第一個頁面與它的答案。
- [概念](/pi-better-show/zh-tw/guide/concepts/)：區塊是什麼，答案怎麼傳。
