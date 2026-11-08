import { describe, expect, test } from "bun:test";
import { type Answer, type BlockSegment, encodeAnswer, parse, validateAnswer } from "../src/core/index.ts";

const block = (markdown: string): BlockSegment => {
  const segment = parse(markdown).find((s) => s.type === "block");
  if (segment?.type !== "block") throw new Error("no block");
  return segment;
};
const ok = (b: BlockSegment, answer: Answer) => validateAnswer(b, answer);
const reason = (b: BlockSegment, answer: Answer) => {
  const result = validateAnswer(b, answer);
  return result.ok ? "ok" : result.reason;
};

const form = block(
  [
    "```form",
    "questions:",
    "  - {name: store, required: true, other: false, choices: [sqlite, pg]}",
    "  - {name: extras, type: multi, other: false, choices: [ttl, wal]}",
    "  - {name: why, type: text}",
    "```",
  ].join("\n"),
);

describe("encodeAnswer: multi", () => {
  test("a multi question's several values all reach the agent, as repeated fields or one joined value", () => {
    const repeated = encodeAnswer({
      kind: "form",
      fields: [
        ["extras", "ttl"],
        ["extras", "wal"],
      ],
    });
    expect(repeated).toBe("User submitted a form in the HTML review pane:\n- extras: ttl\n- extras: wal");
    expect(encodeAnswer({ kind: "form", fields: [["extras", "ttl, wal"]] })).toContain("- extras: ttl, wal");
  });
});

describe("validateAnswer: form", () => {
  test("accepts a complete answer, including several values for a multi question", () => {
    expect(
      ok(form, {
        kind: "form",
        fields: [
          ["store", "pg"],
          ["extras", "ttl"],
          ["extras", "wal"],
        ],
      }).ok,
    ).toBe(true);
    expect(
      ok(form, {
        kind: "form",
        fields: [
          ["form", "t"],
          ["store", "pg"],
          ["extras", "ttl, wal"],
          ["why", "x"],
        ],
      }).ok,
    ).toBe(true);
  });
  test("refuses a wrong kind, an unknown question, an unknown choice, and a missing required question", () => {
    expect(reason(form, { kind: "review", fields: [] })).toMatch(/kind/);
    expect(
      reason(form, {
        kind: "form",
        fields: [
          ["store", "pg"],
          ["nope", "x"],
        ],
      }),
    ).toMatch(/nope/);
    expect(reason(form, { kind: "form", fields: [["store", "mysql"]] })).toMatch(/mysql/);
    expect(reason(form, { kind: "form", fields: [["extras", "ttl"]] })).toMatch(/store/);
    expect(reason(form, { kind: "form", fields: [["store", "(no answer)"]] })).toMatch(/store/);
  });
  test("several values only for a multi question", () => {
    expect(
      reason(form, {
        kind: "form",
        fields: [
          ["store", "pg"],
          ["store", "sqlite"],
        ],
      }),
    ).toMatch(/store/);
    expect(
      reason(form, {
        kind: "form",
        fields: [
          ["store", "pg"],
          ["why", "a"],
          ["why", "b"],
        ],
      }),
    ).toMatch(/why/);
  });
  test("at most 64 fields of 1024 characters", () => {
    const many: [string, string][] = [
      ["store", "pg"],
      ...Array.from({ length: 64 }, (): [string, string] => ["extras", "ttl"]),
    ];
    expect(reason(form, { kind: "form", fields: many })).toMatch(/64/);
    expect(
      reason(form, {
        kind: "form",
        fields: [
          ["store", "pg"],
          ["why", "x".repeat(1025)],
        ],
      }),
    ).toMatch(/1024/);
    expect(
      ok(form, {
        kind: "form",
        fields: [
          ["store", "pg"],
          ["why", "x".repeat(1024)],
        ],
      }).ok,
    ).toBe(true);
  });
});

describe("validateAnswer: other kinds", () => {
  test("options and suggest take exactly one known value", () => {
    const options = block("```options\n- title: A\n- {}\n```");
    expect(ok(options, { kind: "pick", fields: [["picked", "A"]] }).ok).toBe(true);
    expect(ok(options, { kind: "pick", fields: [["picked", "2"]] }).ok).toBe(true);
    expect(reason(options, { kind: "pick", fields: [["picked", "C"]] })).toMatch(/C/);
    expect(
      reason(options, {
        kind: "pick",
        fields: [
          ["picked", "A"],
          ["picked", "2"],
        ],
      }),
    ).toMatch(/one/);
    const suggest = block("```suggest\n- 好\n```");
    expect(ok(suggest, { kind: "suggest", fields: [["text", "好"]] }).ok).toBe(true);
    expect(reason(suggest, { kind: "suggest", fields: [["text", "壞"]] })).toMatch(/壞/);
  });
  test("checklist names its items once each with a mark", () => {
    const list = block("```checklist\nitems:\n  - {name: a, label: A}\n  - {name: b, label: B}\n```");
    expect(
      ok(list, {
        kind: "checklist",
        fields: [
          ["a", "checked"],
          ["b", "unchecked"],
        ],
      }).ok,
    ).toBe(true);
    expect(reason(list, { kind: "checklist", fields: [["c", "checked"]] })).toMatch(/c/);
    expect(reason(list, { kind: "checklist", fields: [["a", "maybe"]] })).toMatch(/maybe/);
    expect(
      reason(list, {
        kind: "checklist",
        fields: [
          ["a", "checked"],
          ["a", "checked"],
        ],
      }),
    ).toMatch(/a/);
  });
  test("review names its items; a pick only when the review has one", () => {
    const review = block("```review\npick: true\nitems:\n  - {name: A, label: dark}\n  - {name: B}\n```");
    const sent: Answer = {
      kind: "review",
      fields: [
        ["title", "t"],
        ["picked", "A (dark)"],
        ["item", "A (dark)"],
        ["comment", "ok"],
        ["silent", "B"],
      ],
    };
    expect(ok(review, sent).ok).toBe(true);
    expect(reason(review, { kind: "review", fields: [["picked", "Z"]] })).toMatch(/Z/);
    expect(
      reason(review, {
        kind: "review",
        fields: [
          ["picked", "A (dark)"],
          ["picked", "B"],
        ],
      }),
    ).toMatch(/one/);
    const noPick = block("```review\nitems:\n  - {name: A}\n```");
    expect(reason(noPick, { kind: "review", fields: [["picked", "A"]] })).toMatch(/pick/);
  });
  test("a display block has no answer", () => {
    expect(reason(block("> [!NOTE]\n> x"), { kind: "form", fields: [] })).toMatch(/alert/);
  });
});
