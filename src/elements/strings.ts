/** The words the elements show themselves: two locales, overridable per key through `configure({strings})`. */

export type Locale = "en" | "zh-Hant";

export interface Strings {
  send: string;
  sent: string;
  submitted: string;
  pick: string;
  picked: string;
  recommended: string;
  required: string;
  unanswered: string;
  other: string;
  feedbackNote: string;
  otherComments: string;
  noFeedback: string;
  reviewFallback: string;
  enlarge: string;
  close: string;
  imageUnavailable: string;
  pageUnavailable: string;
  filter: string;
  rowCount: string;
  noRows: string;
  sortBy: string;
  yes: string;
  no: string;
  statusDone: string;
  statusDoing: string;
  statusTodo: string;
  statusBlocked: string;
  toneNote: string;
  toneOk: string;
  toneWarn: string;
  toneRisk: string;
  diagram: string;
  diagramSource: string;
  diagramFallback: string;
  diff: string;
  table: string;
  mindmap: string;
  tree: string;
  treeExpandAll: string;
  treeCollapseAll: string;
  /** A folder's count of entries; `{n}` is the number. */
  treeEntries: string;
  suggestions: string;
  checklistProgress: string;
  stats: string;
  steps: string;
  options: string;
  cards: string;
  blockError: string;
}

export const STRINGS: Record<Locale, Strings> = {
  en: {
    send: "Send",
    sent: "Sent.",
    submitted: "Sent",
    pick: "Pick this",
    picked: "Picked",
    recommended: "Recommended",
    required: "required",
    unanswered: "Not answered yet: ",
    other: "Other (type your own)",
    feedbackNote: "Feedback (leave blank for none)",
    otherComments: "Other comments",
    noFeedback: "No feedback",
    reviewFallback: "Review",
    enlarge: "Enlarge",
    close: "Close",
    imageUnavailable: "Image not available",
    pageUnavailable: "Prototype page, not shown here: ",
    filter: "Filter rows",
    rowCount: "{n} of {total} rows",
    noRows: "No matching rows",
    sortBy: "Sort by {label}",
    yes: "Yes",
    no: "No",
    statusDone: "Done",
    statusDoing: "In progress",
    statusTodo: "To do",
    statusBlocked: "Blocked",
    toneNote: "Note",
    toneOk: "Tip",
    toneWarn: "Warning",
    toneRisk: "Caution",
    diagram: "Diagram",
    diagramSource: "Source",
    diagramFallback: "The diagram is not available here; its source is shown instead.",
    diff: "Diff",
    table: "Table",
    mindmap: "Mind map",
    tree: "Directory tree",
    treeExpandAll: "Expand all",
    treeCollapseAll: "Collapse all",
    treeEntries: "entries: {n}",
    suggestions: "Suggested replies",
    checklistProgress: "{done} of {total} done",
    stats: "Metrics",
    steps: "Steps",
    options: "Options",
    cards: "Cards",
    blockError: "This block cannot be shown",
  },
  "zh-Hant": {
    send: "送出",
    sent: "已送出。",
    submitted: "已送出",
    pick: "選這個",
    picked: "已選",
    recommended: "推薦",
    required: "必填",
    unanswered: "還沒回答：",
    other: "其他（自行填寫）",
    feedbackNote: "回饋（留白代表沒意見）",
    otherComments: "其他意見",
    noFeedback: "沒有意見",
    reviewFallback: "回饋",
    enlarge: "放大",
    close: "關閉",
    imageUnavailable: "無法顯示圖片",
    pageUnavailable: "原型頁面（此處不顯示）：",
    filter: "篩選列",
    rowCount: "{n} / {total} 列",
    noRows: "沒有符合的列",
    sortBy: "依「{label}」排序",
    yes: "是",
    no: "否",
    statusDone: "完成",
    statusDoing: "進行中",
    statusTodo: "待辦",
    statusBlocked: "受阻",
    toneNote: "備註",
    toneOk: "提示",
    toneWarn: "警告",
    toneRisk: "注意",
    diagram: "圖表",
    diagramSource: "原始碼",
    diagramFallback: "這裡無法顯示圖表，改為顯示原始碼。",
    diff: "差異",
    table: "表格",
    mindmap: "心智圖",
    tree: "目錄樹",
    treeExpandAll: "全部展開",
    treeCollapseAll: "全部收合",
    treeEntries: "{n} 項",
    suggestions: "建議回覆",
    checklistProgress: "已完成 {done} / {total}",
    stats: "指標",
    steps: "步驟",
    options: "選項",
    cards: "卡片",
    blockError: "無法顯示這個區塊",
  },
};

/** `zh`, `zh-TW`, `zh-Hant-HK` and the like choose Traditional Chinese; everything else English. */
export const localeOf = (tag: string | null | undefined): Locale => (/^zh/i.test(tag ?? "") ? "zh-Hant" : "en");

export const format = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
