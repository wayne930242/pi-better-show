import { describe, expect, test } from "bun:test";
import { type Answer, encodeAnswer } from "../src/core/index.ts";

// Golden strings come from pi-herdr-doc-review's own tests (tests/markdown.test.ts, tests/review.test.ts): each one is the
// exact text its formMessage, reviewMessage, or pageFeedbackMessage produced for the same fields.

describe("encodeAnswer is byte-compatible with pi-herdr-doc-review", () => {
  test("form", () => {
    const fields: [string, string][] = [
      ["q1", "新 skill"],
      ["note", "a&b c"],
    ];
    expect(encodeAnswer({ kind: "form", fields })).toBe(
      "User submitted a form in the HTML review pane:\n- q1: 新 skill\n- note: a&b c",
    );
    expect(encodeAnswer({ kind: "form", fields: [["q2", "yes"]] })).toBe(
      "User submitted a form in the HTML review pane:\n- q2: yes",
    );
    expect(encodeAnswer({ kind: "form", fields: [["q", "新 skill"]] })).toBe(
      "User submitted a form in the HTML review pane:\n- q: 新 skill",
    );
    expect(encodeAnswer({ kind: "form", fields: [] })).toBe(
      "User submitted a form in the HTML review pane:\n(no fields)",
    );
  });

  test("review", () => {
    const answer: Answer = {
      kind: "review",
      fields: [
        ["title", "首頁"],
        ["picked", "B (深色)"],
        ["item", "A"],
        ["comment", "字太小\n按鈕太擠"],
        ["item", "B (深色)"],
        ["comment", "好"],
        ["silent", "C, D"],
      ],
    };
    expect(encodeAnswer(answer)).toBe(
      'User reviewed "首頁":\nPicked: B (深色)\n- A: 字太小\n  按鈕太擠\n- B (深色): 好\nNo feedback on: C, D',
    );
    expect(
      encodeAnswer({
        kind: "review",
        fields: [
          ["title", "t"],
          ["picked", "A"],
        ],
      }),
    ).toBe('User reviewed "t":\nPicked: A');
    expect(
      encodeAnswer({
        kind: "review",
        fields: [
          ["title", "t"],
          ["silent", "A, B"],
        ],
      }),
    ).toBe('User reviewed "t":\nNo feedback on: A, B');
    // The event-bus fixture: a review whose fields carry only the title and the pick.
    expect(
      encodeAnswer({
        kind: "review",
        fields: [
          ["title", "頁首"],
          ["picked", "B"],
        ],
      }),
    ).toBe('User reviewed "頁首":\nPicked: B');
  });

  test("feedback", () => {
    const answer: Answer = {
      kind: "feedback",
      fields: [
        ["page", "快取"],
        ["quote", "第一行\n第二行"],
        ["comment", "為什麼？"],
        ["quote", "另一段"],
        ["comment", ""],
        ["overall", "方向 OK"],
      ],
    };
    expect(encodeAnswer(answer)).toBe(
      'User feedback on the page "快取":\n\n> 第一行\n> 第二行\n為什麼？\n\n> 另一段\n(no comment)\n\nOverall: 方向 OK',
    );
    expect(
      encodeAnswer({
        kind: "feedback",
        fields: [
          ["page", "p"],
          ["overall", "only"],
        ],
      }),
    ).toBe('User feedback on the page "p":\n\nOverall: only');
  });

  test("the legacy pi-kind field is ignored, because the kind carries it", () => {
    expect(
      encodeAnswer({
        kind: "review",
        fields: [
          ["pi-kind", "review"],
          ["title", "t"],
          ["picked", "A"],
        ],
      }),
    ).toBe('User reviewed "t":\nPicked: A');
  });
});

describe("encodeAnswer for the new kinds", () => {
  test("pick names the option the user chose", () => {
    expect(
      encodeAnswer({
        kind: "pick",
        title: "Storage",
        fields: [["picked", "SQLite"]],
      }),
    ).toBe('User picked "SQLite" for "Storage".');
    expect(encodeAnswer({ kind: "pick", fields: [["picked", "SQLite"]] })).toBe('User picked "SQLite".');
  });

  test("suggest is the text the chip sends, and nothing else", () => {
    expect(encodeAnswer({ kind: "suggest", fields: [["text", "Yes, go ahead"]] })).toBe("Yes, go ahead");
  });

  test("checklist lists every item with its mark", () => {
    expect(
      encodeAnswer({
        kind: "checklist",
        title: "Before release",
        fields: [
          ["Run tests", "checked"],
          ["Bump version", "unchecked"],
        ],
      }),
    ).toBe('User updated the checklist "Before release":\n☑ Run tests\n☐ Bump version');
    expect(encodeAnswer({ kind: "checklist", fields: [["a", "checked"]] })).toBe("User updated the checklist:\n☑ a");
  });

  test("ref does not change the text", () => {
    const fields: [string, string][] = [["q", "a"]];
    expect(encodeAnswer({ kind: "form", fields, ref: { doc: "x.md", block: 2 } })).toBe(
      encodeAnswer({ kind: "form", fields }),
    );
  });
});
