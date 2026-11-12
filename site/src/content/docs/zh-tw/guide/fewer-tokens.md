---
title: 更少的 token
description: 與為同樣內容寫 HTML 頁面相比，區塊省下多少，實測結果。
---

agent 寫的是資料，不是網頁：版面、樣式、控制項，以及把答案送回去的程式碼，都由套件負責。
下面四個範例頁面，寫區塊花了 **1,253 個輸出 token**；請同一個模型為同樣內容寫一頁自成一體、控制項能運作的 HTML，花了 **12,364 個**，大約是 **10 倍**（省下 90%）。

| 頁面 | 區塊 | HTML 頁面（中位數） | HTML 各次 | 省下 |
| --- | ---: | ---: | --- | ---: |
| [決策](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-decide.md)：alert、options、form | 347 | 2,770 | 1,651 – 2,917 | 87% |
| [狀態](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-status.md)：stats、steps、table | 412 | 3,726 | 2,145 – 3,895 | 89% |
| [結構](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-structure.md)：tree、mermaid、diff | 338 | 3,719 | 3,514 – 4,064 | 91% |
| [Review](https://github.com/wayne930242/pi-better-show/blob/main/examples/readme-review.md)：review、suggest | 156 | 2,149 | 2,008 – 2,478 | 93% |
| 合計 | 1,253 | 12,364 | | 90% |

每次修改，這個節省都會再發生一次：agent 改幾行 YAML，而不是重寫標記與腳本。

<details>
<summary>怎麼量的</summary>

數字是 `claude -p --model claude-sonnet-5-5` 的 Claude 輸出 token（每頁 3 到 5 次 HTML；區塊數是把檔案逐字回述出來的結果），2026-11-10 用 `scripts/token-bench.sh` 量測。
這些 HTML 頁面都沒有讓人對選取段落留言的意見面板，而 `show_doc` 會替每個頁面加上它。

</details>

## 四個頁面

![決策頁：一個 alert、兩個選項與一份表單](/pi-better-show/images/decide.png)

![統計方塊、steps 時間軸與可排序的表格](/pi-better-show/images/status.png)

![帶標籤的目錄樹、流程圖與 diff](/pi-better-show/images/structure.png)

![兩種標題設計供比較，下方是快速回覆的 chip](/pi-better-show/images/review.png)
