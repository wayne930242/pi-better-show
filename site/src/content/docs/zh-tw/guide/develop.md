---
title: 開發
description: 執行測試與 demo、編輯文件，並讓網站與它的 zh-TW 對照版同步。
---

這個儲存庫就是 `pi-better-show` 套件：core、元素、React 包裝、server 進入點與 `show_doc` extension，全是 TypeScript 原始碼。
套件自己的程式碼用 Bun。

## 檢查

```bash
bun install
bun test
bun run check    # tsc, tsc for core without node types, biome
bun run demo     # examples/elements.html on http://127.0.0.1:4177/
bun run show     # the show_doc page server on examples/, with a fake pi that prints each message
```

宣稱一項修改已驗證之前，請跑 `bun test` 與 `bun run check`。`bun run demo` 畫出每個元素並附答案紀錄；`bun run show` 提供真正的頁面伺服器，並印出 agent 會收到的每則訊息。

## 文件

- `README.md` 與 `README.zh-TW.md` 保持精簡：一句話介紹、安裝、快速開始，以及每種區塊一行的表格。
- 這個網站就是參考文件。`site/` 是 Starlight 專案，由 `.github/workflows/pages.yml` 發布在 https://wayne930242.github.io/pi-better-show/；它和其他文件網站一樣用 npm，而套件本身用 Bun。
- `docs/reference.md` 是「參考」各頁的來源；`site/scripts/sync.mjs` 依 H2 把它切開，所以請保持它的標題穩定。`CHANGELOG.md` 會變成更新紀錄頁，`docs/images` 會複製到網站。
- `docs/reference.zh-TW.md` 逐行對照它，且第一行寫明它對應的英文 commit。
- `cd site && npm ci && npm run check && npm run build` 會檢查對照版、手寫頁面的 zh-TW 對照版，以及每個內部連結與錨點。

<details>
<summary>發版</summary>

- 在 `package.json` 升版本，並同時把該版寫進 `CHANGELOG.md`；只改文件不需要升版。
- `Publish` workflow 由 `v*` tag 發布。

</details>
