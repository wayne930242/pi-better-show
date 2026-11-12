---
title: 快速開始
description: 要一個頁面、點一點回答，並在 page 與 edit 兩種檢視之間選擇。
---

1. **請 agent 給你看點東西。** 「把兩個快取方案攤開，讓我挑一個」就夠了。agent 會寫一個帶區塊的 Markdown 檔並呼叫 `show_doc`；呼叫會立刻回傳，所以 agent 不會等你。
2. **讀頁面。** `view: "page"` 在預設瀏覽器開啟它：文章、一個 alert、並排的選項、一份表單。
3. **點一點回答。** 挑選項、填表單、按 Send。選取一段文字就能留言，意見面板會連同整體意見一起收集你的留言。
4. **agent 把你的答案當成訊息讀。** 它會 steer 進進行中的一輪，agent 閒置時則開始新的一輪。

![決策頁：一個 alert、兩個選項與一份表單](/pi-better-show/images/decide.png)

你在上面的表單按下 **Send**，agent 收到：

```text
User submitted a form in the HTML review pane:
- ttl: week
- extras: WAL mode, Nightly backup
- note: The API runs on two hosts next month.
```

## Page 或 edit

`show_doc` 有兩種檢視。用 page 做決定，用編輯器寫東西。

| 檢視 | 開啟 | 適合 | 你的答案 |
| --- | --- | --- | --- |
| `page` | 你的預設瀏覽器 | 閱讀與決定：區塊、圖、要比較的設計 | 點擊、表單與留言，各自以一則訊息送出 |
| `edit`（預設） | 你的編輯器 | 想就地修改的 spec 與草稿 | 你的儲存，每個檔案一份淨 diff |

agent 編輯檔案時，開啟的頁面會重新載入。關掉最後一個分頁，頁面伺服器 30 秒後停止；下一次 `show_doc` 會再啟動它。

<details>
<summary>你可能會看到</summary>

- 一則通知說你的編輯會隨你的下一則訊息送到 agent：在 `edit` 檢視中，agent 會在你的下一輪開始時讀你的儲存，或在它工作時你停止儲存 3 秒後讀。
- agent 的 `write` 或 `edit` 結果裡有一行像 `Block problems in questions.md:` 並帶行號：某個區塊剖析失敗，頁面會顯示它的原始碼與原因，直到修好。
- 一份 `Mini SDD` spec（`docs/specs/<slug>/spec.md` 且帶 `Status: proposed`）自己開啟。`PI_BETTER_SHOW_AUTO_OPEN=off` 可以停用。

</details>

## 接著

- [概念](/pi-better-show/zh-tw/guide/concepts/)：區塊、答案與純文字備援。
- [意見](/pi-better-show/zh-tw/guide/feedback/)：對文字與圖留言。
- [區塊參考](/pi-better-show/zh-tw/reference/blocks/)：每一種區塊。
