import { afterEach, describe, expect, test } from "bun:test";
import { encodeAnswer } from "../../src/core/index.ts";
import type { ChecklistData, FormData, OptionsData, ReviewData } from "../../src/core/types.ts";
import { answers, cleanup, click, mount, one, type } from "./helpers.ts";

afterEach(cleanup);

const form: FormData = {
  questions: [{ name: "why", type: "text", required: false, other: false, choices: [] }],
};
const review: ReviewData = { items: [{ name: "A" }, { name: "B" }] };
const checklist: ChecklistData = { items: [{ name: "a", label: "A", checked: false }] };
const options: OptionsData = { options: [{ title: "A", pros: [], cons: [] }] };

const NOTE = '[part="note"]';

describe("the other-comments box", () => {
  test("form: the typed text goes out as the note field, in English or Traditional Chinese", () => {
    const el = mount("pbs-form", form);
    expect(one(el, '[part="note-field"]').textContent).toContain("Other comments");
    const seen = answers();
    type(one(el, NOTE), "  one more thing ");
    click(one(el, '[part="submit"]'));
    expect(seen.details[0]?.fields).toContainEqual(["note", "one more thing"]);
    expect(encodeAnswer(seen.details[0] as never)).toContain("Other comments: one more thing");
    seen.stop();
    const zh = mount("pbs-form", form, { lang: "zh-Hant" });
    expect(one(zh, '[part="note-field"]').textContent).toContain("其他意見");
  });

  test("form: a blank box sends no note field", () => {
    const el = mount("pbs-form", form);
    const seen = answers();
    click(one(el, '[part="submit"]'));
    expect(seen.details[0]?.fields.some(([name]) => name === "note")).toBe(false);
    seen.stop();
  });

  test("review and checklist carry the note", () => {
    const seen = answers();
    const r = mount("pbs-review", review);
    type(one(r, NOTE), "overall fine");
    click(one(r, '[part="submit"]'));
    const c = mount("pbs-checklist", checklist);
    type(one(c, NOTE), "check later");
    click(one(c, '[part="submit"]'));
    expect(seen.details[0]?.fields).toContainEqual(["note", "overall fine"]);
    expect(seen.details[1]?.fields).toContainEqual(["note", "check later"]);
    seen.stop();
  });

  test("options: the box is read when an option is picked", () => {
    const seen = answers();
    const el = mount("pbs-options", options);
    type(one(el, NOTE), "but cheaper");
    click(one(el, '[part="pick"]'));
    expect(seen.details[0]?.fields).toEqual([
      ["picked", "A"],
      ["note", "but cheaper"],
    ]);
    seen.stop();
  });

  test("a locked element shows the note that was sent", () => {
    const el = mount("pbs-review", review);
    el.answered = [
      ["title", "R"],
      ["note", "sent words"],
    ];
    expect(el.shadowRoot?.textContent).toContain("Other comments");
    expect(el.shadowRoot?.textContent).toContain("sent words");
  });
});
