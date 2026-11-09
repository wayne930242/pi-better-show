import { describe, expect, test } from "bun:test";
import { type Answer, type BlockSegment, encodeAnswer, parse, toText, validateAnswer } from "../src/core/index.ts";

const block = (markdown: string): BlockSegment => {
  const segment = parse(markdown).find((s) => s.type === "block");
  if (segment?.type !== "block") throw new Error(`no block in ${markdown}`);
  return segment;
};
const reason = (b: BlockSegment, answer: Answer): string => {
  const result = validateAnswer(b, answer);
  return result.ok ? "ok" : result.reason;
};
const note: [string, string] = ["pi-note", "also fix the title"];

const options = block("```options\n- {title: A}\n- {title: B}\n```");
const suggest = block("```suggest\n- yes\n```");
const form = block("```form\nquestions:\n  - {name: why, type: text}\n```");
const checklist = block("```checklist\nitems:\n  - {name: a, label: A}\n```");
const review = block("```review\npick: true\nitems:\n  - {name: A}\n```");

describe("other comments: validateAnswer", () => {
  test("every interactive kind accepts one note beside its own fields", () => {
    expect(reason(options, { kind: "pick", fields: [["picked", "A"], note] })).toBe("ok");
    expect(reason(suggest, { kind: "suggest", fields: [["text", "yes"], note] })).toBe("ok");
    expect(reason(form, { kind: "form", fields: [["why", "x"], note] })).toBe("ok");
    expect(reason(checklist, { kind: "checklist", fields: [["a", "checked"], note] })).toBe("ok");
    expect(reason(review, { kind: "review", fields: [["title", "t"], ["picked", "A"], note] })).toBe("ok");
  });

  test("an empty note is not needed: answers without it still pass", () => {
    expect(reason(options, { kind: "pick", fields: [["picked", "A"]] })).toBe("ok");
  });

  test("a second note, or one over the length cap, is refused", () => {
    expect(reason(form, { kind: "form", fields: [["why", "x"], note, note] })).toContain("several other comments");
    expect(
      reason(form, {
        kind: "form",
        fields: [
          ["why", "x"],
          ["pi-note", "y".repeat(1025)],
        ],
      }),
    ).toContain("longer than");
  });

  test("a note alone does not stand in for a required answer", () => {
    const required = block("```form\nquestions:\n  - {name: why, type: text, required: true}\n```");
    expect(reason(required, { kind: "form", fields: [note] })).toContain("required");
  });

  test("a hand-built form or checklist with the reserved name is refused", () => {
    const clash = { kind: "form" as const, fields: [] as [string, string][] };
    const bad = {
      ...form,
      data: { questions: [{ name: "pi-note", type: "text", required: false, other: false, choices: [] }] },
    } as unknown as BlockSegment;
    expect(reason(bad, clash)).toContain("reserved");
    const badList = {
      ...checklist,
      data: { items: [{ name: "pi-note", label: "n", checked: false }] },
    } as unknown as BlockSegment;
    expect(reason(badList, { kind: "checklist", fields: [] })).toContain("reserved");
  });
});

describe("other comments: the reserved name in markdown", () => {
  test("a form question or checklist item named pi-note does not parse", () => {
    const f = parse("```form\nquestions:\n  - {name: pi-note, type: text}\n```")[0];
    expect(f?.type).toBe("invalid");
    const c = parse("```checklist\nitems:\n  - {name: pi-note, label: N}\n```")[0];
    expect(c?.type).toBe("invalid");
  });
});

describe("other comments: encodeAnswer", () => {
  test("every kind shows the note after its own text; no note adds nothing", () => {
    expect(encodeAnswer({ kind: "form", fields: [["why", "x"], note] })).toBe(
      "User submitted a form in the HTML review pane:\n- why: x\n\nOther comments: also fix the title",
    );
    expect(encodeAnswer({ kind: "pick", title: "T", fields: [["picked", "A"], note] })).toBe(
      'User picked "A" for "T".\n\nOther comments: also fix the title',
    );
    expect(encodeAnswer({ kind: "checklist", fields: [["a", "checked"], note] })).toContain(
      "☑ a\n\nOther comments: also fix the title",
    );
    expect(encodeAnswer({ kind: "review", fields: [["title", "T"], ["picked", "A"], note] })).toContain(
      "Picked: A\n\nOther comments: also fix the title",
    );
    expect(encodeAnswer({ kind: "suggest", fields: [["text", "yes"], note] })).toBe(
      "yes\n\nOther comments: also fix the title",
    );
    expect(
      encodeAnswer({
        kind: "form",
        fields: [
          ["why", "x"],
          ["pi-note", "  "],
        ],
      }),
    ).toBe("User submitted a form in the HTML review pane:\n- why: x");
  });
});

describe("other comments: pi-note namespace and limits", () => {
  test("a question or item named note still parses", () => {
    expect(parse("```form\nquestions:\n  - {name: note, type: text}\n```")[0]?.type).toBe("block");
    expect(parse("```checklist\nitems:\n  - {name: note, label: N}\n```")[0]?.type).toBe("block");
  });

  test("the note does not count toward the 64-field cap", () => {
    const fields: [string, string][] = Array.from({ length: 64 }, (_, i) => [`q${i}`, "x"]);
    const big = {
      ...form,
      data: {
        questions: fields.map(([name]) => ({ name, type: "text", required: false, other: false, choices: [] })),
      },
    } as unknown as BlockSegment;
    expect(reason(big, { kind: "form", fields: [...fields, note] })).toBe("ok");
  });

  test("a review without pick says other comments are welcome", () => {
    const segments = parse("```review\nitems:\n  - {name: A}\n```");
    expect(toText(segments, { flavor: "plain" } as never)).toContain("Other comments are welcome.");
    expect(toText(segments, { flavor: "plain", lang: "zh-TW" } as never)).toContain("也歡迎補充其他意見。");
  });
});
