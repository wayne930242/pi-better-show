import { expect, test } from "bun:test";
import { type Answer, checkBlocks, encodeAnswer, parse, toText, validateAnswer } from "../src/core/index.ts";

const source = (body: string) => `intro\n\n\`\`\`review\n${body}\n\`\`\``;
const grouped = source(
  "pickMode: grouped\nitems:\n  - {group: Card, name: A}\n  - {group: 'UI: state', name: B}\n  - {group: Card, name: C}",
);
const multi = source("pickMode: multi\nitems: [a.png, b.png]");
function review(markdown: string) {
  const block = parse(markdown)[1];
  if (block?.type !== "block" || block.kind !== "review") throw new Error("expected parsed review");
  return block;
}
const answer = (...fields: [string, string][]): Answer => ({ kind: "review", fields });

test("grouped review retains the item groups and renders sections in first appearance order", () => {
  expect(checkBlocks(grouped)).toEqual([]);
  expect(review(grouped).data.items[1]?.group).toBe("UI: state");
  expect(toText(parse(grouped), { flavor: "plain" })).toMatch(
    /Card\n1\. A\n3\. C\nUI: state\n2\. B[\s\S]*one item per group/,
  );
  expect(toText(parse(multi), { flavor: "line", lang: "zh-TW" })).toContain("可複選");
});

test("line-numbered schema problems identify the mode or the offending group", () => {
  for (const [body, line] of [
    ["pickMode: many\nitems: [a]", 4],
    ["pickMode: grouped\nitems:\n  - {name: A}", 6],
    ["pickMode: multi\nitems:\n  - name: A\n    group: Card", 7],
  ] as const)
    expect(checkBlocks(source(body))).toMatchObject([{ severity: "error", line }]);
  expect(checkBlocks(source("pickMode: grouped\nitems:\n  - {group: Card, grop: X}"))).toMatchObject([
    { severity: "warning", line: 6 },
  ]);
});

test("grouped answers carry exactly one known pick in each group and encode without block context", () => {
  const a = answer(["picked:Card", "C"], ["picked:UI: state", "B"]);
  expect(validateAnswer(review(grouped), a)).toEqual({ ok: true });
  expect(encodeAnswer(a)).toContain("Picked (Card): C\nPicked (UI: state): B");
  for (const bad of [
    answer(),
    answer(["picked:Card", "A"]),
    answer(["picked", "B"]),
    answer(["picked:Card", "A"], ...a.fields),
    answer(["picked:Card", "B"], ["picked:UI: state", "C"]),
    answer(...a.fields, ["picked:Unknown", "B"]),
  ])
    expect(validateAnswer(review(grouped), bad).ok).toBe(false);
});

test("multi accepts zero or more distinct known items; old string labels still mean single", () => {
  const both = answer(["picked", "A"], ["picked", "B"]);
  expect(validateAnswer(review(multi), answer()).ok).toBe(true);
  expect(validateAnswer(review(multi), both).ok).toBe(true);
  expect(encodeAnswer(both)).toContain("Picked: A\nPicked: B");
  const commas = review(source('pickMode: multi\nitems: [{name: "Slow, steady"}, {name: Blink}]'));
  expect(validateAnswer(commas, answer(["picked", "Slow, steady"], ["silent", "Slow, steady, Blink"])).ok).toBe(true);
  for (const bad of [answer(["picked", "Z"]), answer(["picked", "A"], ["picked", "A"]), answer(["picked:x", "A"])])
    expect(validateAnswer(review(multi), bad).ok).toBe(false);
  expect(validateAnswer(review(multi.replace("pickMode: multi", "pick: multi")), both).ok).toBe(false);
});
