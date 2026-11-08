import { afterEach, describe, expect, test } from "bun:test";
import { encodeAnswer } from "../../src/core/index.ts";
import type { ChecklistData, OptionsData, SuggestData } from "../../src/core/types.ts";
import {
  all,
  answers,
  check,
  cleanup,
  click,
  expectCspSafe,
  expectInert,
  mount,
  one,
  PROBE_TEXT,
  root,
  text,
} from "./helpers.ts";

afterEach(cleanup);

const options: OptionsData = {
  options: [
    { title: "SQLite", recommended: true, body: "Embedded", pros: ["simple", "fast"], cons: ["single writer"] },
    { title: "Postgres", body: "Server", pros: [], cons: [] },
  ],
};

describe("pbs-options", () => {
  test("renders each option with its badge, body, pros and cons", () => {
    const el = mount("pbs-options", options);
    expect(all(el, '[part="option"]').length).toBe(2);
    expect(one(el, '[part="badge"]').textContent).toBe("Recommended");
    expect(all(el, '[part="pros"] li').map((li) => li.textContent)).toEqual(["simple", "fast"]);
    expect(all(el, '[part="cons"] li').map((li) => li.textContent)).toEqual(["single writer"]);
    expectCspSafe(el);
  });

  test("a pick dispatches one bubbling, composed pbs-answer with the block's ref, then the element locks", () => {
    const got = answers();
    const el = mount("pbs-options", options);
    el.ref = { doc: "plan.md", block: 3 };
    const button = one(el, '[part="option"]:nth-child(2) button');
    click(button);
    click(one(el, '[part="pick"]'));
    got.stop();
    expect(got.details).toEqual([
      { kind: "pick", fields: [["picked", "Postgres"]], ref: { doc: "plan.md", block: 3 } },
    ]);
    expect(encodeAnswer(got.details[0] as never)).toBe('User picked "Postgres".');
    expect(one(el, "[data-selected] button").textContent).toBe("✓ Picked");
    expect(all(el, "button").every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(one(el, '[part="status"]').textContent).toBe("Sent.");
  });

  test("a listener that cancels the event keeps the element open", () => {
    const got = answers();
    got.cancel = true;
    const el = mount("pbs-options", options);
    click(one(el, '[part="pick"]'));
    click(one(el, '[part="pick"]'));
    got.stop();
    expect(got.details.length).toBe(2);
    expect(all(el, "button")[0]?.getAttribute("aria-disabled")).toBeNull();
  });

  test("answered locks it and marks the picked option; clearing answered reopens it", () => {
    const got = answers();
    const el = mount("pbs-options", options);
    el.answered = [["picked", "SQLite"]];
    expect(one(el, "[data-selected]").textContent).toContain("SQLite");
    click(all(el, '[part="pick"]')[1] as HTMLElement);
    expect(got.details).toEqual([]);
    el.answered = undefined;
    click(all(el, '[part="pick"]')[1] as HTMLElement);
    got.stop();
    expect(got.details.length).toBe(1);
  });

  test("keeps focus on the chosen button after the lock redraws", () => {
    const el = mount("pbs-options", options);
    const first = one(el, '[part="pick"]');
    first.focus();
    click(first);
    expect(root(el).activeElement).toBe(one(el, "[data-selected] button"));
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<OptionsData>("pbs-options", {
        options: [
          { title: PROBE_TEXT, recommended: PROBE_TEXT, body: PROBE_TEXT, pros: [PROBE_TEXT], cons: [PROBE_TEXT] },
        ],
      }),
    );
  });
});

const suggest: SuggestData = {
  items: [
    { label: "Go ahead", text: "Go ahead" },
    { label: "Not now", text: "Not now, ask me tomorrow" },
  ],
};

describe("pbs-suggest", () => {
  test("a chip sends its text as the user's message", () => {
    const got = answers();
    const el = mount("pbs-suggest", suggest);
    click(all(el, '[part="chip"]')[1] as HTMLElement);
    click(all(el, '[part="chip"]')[0] as HTMLElement);
    got.stop();
    expect(got.details).toEqual([{ kind: "suggest", fields: [["text", "Not now, ask me tomorrow"]] }]);
    expect(encodeAnswer(got.details[0] as never)).toBe("Not now, ask me tomorrow");
    expect(all(el, '[part="chip"]').map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    expectCspSafe(el);
  });

  test("answered marks the matching chip, and shows free text that matches none", () => {
    const el = mount("pbs-suggest", suggest);
    el.answered = [["text", "Go ahead"]];
    expect(one(el, '[aria-pressed="true"]').textContent).toBe("Go ahead");
    el.answered = [["text", "something typed"]];
    expect(all(el, '[aria-pressed="true"]').length).toBe(0);
    expect(text(el)).toContain("something typed");
  });

  test("the probe renders as text", () => {
    expectInert(mount<SuggestData>("pbs-suggest", { items: [{ label: PROBE_TEXT, text: PROBE_TEXT }] }));
  });
});

const checklist: ChecklistData = {
  title: "Before release",
  items: [
    { name: "tests", label: "Run tests", checked: true },
    { name: "version", label: "Bump version", checked: false, note: "semver" },
  ],
};

describe("pbs-checklist", () => {
  test("sends every item's mark; progress follows the ticks; the form stays open for a resend", () => {
    const got = answers();
    const el = mount("pbs-checklist", checklist);
    expect(one(el, '[part="progress"]').textContent).toBe("1 of 2 done");
    check(all<HTMLInputElement>(el, "input")[1] as HTMLInputElement);
    expect(one(el, '[part="progress"]').textContent).toBe("2 of 2 done");
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details).toEqual([
      {
        kind: "checklist",
        title: "Before release",
        fields: [
          ["tests", "checked"],
          ["version", "checked"],
        ],
      },
    ]);
    expect(encodeAnswer(got.details[0] as never)).toBe(
      'User updated the checklist "Before release":\n☑ tests\n☑ version',
    );
    expect(one(el, '[part="status"]').textContent).toBe("Sent.");
    expectCspSafe(el);
  });

  test("a tick sends nothing; only Send does", () => {
    const got = answers();
    const el = mount("pbs-checklist", checklist);
    check(all<HTMLInputElement>(el, "input")[1] as HTMLInputElement);
    expect(got.details).toEqual([]);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details.length).toBe(1);
  });

  test("ticks survive a redraw (density change), and a new data object resets them", () => {
    const el = mount("pbs-checklist", checklist);
    check(all<HTMLInputElement>(el, "input")[1] as HTMLInputElement);
    el.setAttribute("density", "compact");
    expect(all<HTMLInputElement>(el, "input").map((box) => box.checked)).toEqual([true, true]);
    el.data = { ...checklist };
    expect(all<HTMLInputElement>(el, "input").map((box) => box.checked)).toEqual([true, false]);
  });

  test("answered locks the boxes to what was sent", () => {
    const got = answers();
    const el = mount("pbs-checklist", checklist);
    el.answered = [
      ["tests", "unchecked"],
      ["version", "checked"],
    ];
    expect(all<HTMLInputElement>(el, "input").map((box) => [box.checked, box.disabled])).toEqual([
      [false, true],
      [true, true],
    ]);
    expect(root(el).querySelector('[part="submit"]')).toBeNull();
    expect(text(el)).toContain("Sent");
    got.stop();
    expect(got.details).toEqual([]);
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<ChecklistData>("pbs-checklist", {
        title: PROBE_TEXT,
        submit: PROBE_TEXT,
        items: [{ name: "a", label: PROBE_TEXT, checked: false, note: PROBE_TEXT }],
      }),
    );
  });
});
