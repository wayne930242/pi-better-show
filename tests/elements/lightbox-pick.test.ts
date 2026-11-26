import { afterEach, expect, test } from "bun:test";
import type { ReviewData } from "../../src/core/types.ts";
import { all, answers, check, cleanup, click, key, mount, one } from "./helpers.ts";

afterEach(cleanup);

const items = ["A", "B", "C"].map((name, i) => ({
  name,
  image: `https://example.com/${name}.png`,
  group: i < 2 ? "Color" : "Shape",
}));

for (const mode of ["single", "grouped", "multi"] as const) {
  test(`${mode} picks follow the picture and update the page and submitted answer`, () => {
    const data: ReviewData = mode === "single" ? { items, pick: "Favorite" } : { items, pickMode: mode };
    const el = mount("pbs-review", data);
    const page = all<HTMLInputElement>(el, '[part="pick"] input');
    const pick = () => one<HTMLInputElement>(el, "dialog input");
    const next = () => click(one(el, '[part="next"]'));
    click(one(el, '[part="enlarge"]'));
    expect(pick().type).toBe(mode === "multi" ? "checkbox" : "radio");
    const label = one(el, '[part="lightbox-pick"]');
    expect(label.textContent).toContain(mode === "single" ? "Favorite" : "Pick");
    if (mode === "grouped") expect(label.textContent).toContain("Color");
    check(one<HTMLInputElement>(el, '[part="pick"] input'));
    expect(pick().checked).toBe(true);
    next();
    expect(pick().checked).toBe(false);
    key(pick(), "ArrowRight");
    expect(one(el, "dialog").getAttribute("aria-label")).toBe("B");
    key(pick(), "Enter");
    expect(page[1]?.checked).toBe(true);
    next();
    if (mode === "grouped") expect(label.textContent).toContain("Shape");
    expect(pick().checked).toBe(false);
    pick().click();
    if (mode === "multi") {
      pick().click();
      expect(page[2]?.checked).toBe(false);
    }
    next();
    expect(pick().checked).toBe(mode === "multi");
    click(one(el, '[part="close"]'));
    const got = answers();
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details[0]?.fields.filter(([name]) => name.startsWith("picked"))).toEqual(
      mode === "multi"
        ? [
            ["picked", "A"],
            ["picked", "B"],
          ]
        : mode === "grouped"
          ? [
              ["picked:Color", "B"],
              ["picked:Shape", "C"],
            ]
          : [["picked", "C"]],
    );
  });
}

test("a comment-only review has no lightbox pick", () => {
  const el = mount("pbs-review", { items });
  click(one(el, '[part="enlarge"]'));
  expect(all(el, 'dialog input, [part="lightbox-pick"]')).toHaveLength(0);
});
