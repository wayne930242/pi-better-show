import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { encodeAnswer } from "../../src/core/index.ts";
import type { FormData, ReviewData } from "../../src/core/types.ts";
import { configure, resetConfiguration } from "../../src/elements/index.ts";
import {
  all,
  answers,
  check,
  cleanup,
  click,
  expectCspSafe,
  expectInert,
  key,
  mount,
  one,
  PROBE_TEXT,
  root,
  text,
  type,
} from "./helpers.ts";

afterEach(() => {
  cleanup();
  resetConfiguration();
});

const form: FormData = {
  title: "Decide",
  questions: [
    {
      name: "store",
      label: "Which store?",
      type: "single",
      required: true,
      other: true,
      hint: "Pick one",
      choices: [
        { value: "sqlite", label: "SQLite" },
        { value: "pg", label: "Postgres", note: "heavier", recommended: true },
      ],
    },
    {
      name: "extras",
      label: "Extras",
      type: "multi",
      required: false,
      other: "Anything else",
      choices: [
        { value: "ttl", label: "TTL" },
        { value: "wal", label: "WAL" },
      ],
    },
    { name: "why", label: "Why?", type: "text", required: false, other: false, choices: [] },
  ],
};

const radios = (el: Element) => all<HTMLInputElement>(el, 'input[type="radio"]');
const boxes = (el: Element) => all<HTMLInputElement>(el, 'input[type="checkbox"]');

describe("pbs-form", () => {
  test("renders title, labelled questions, a required mark, hints, choices, notes, and the other box", () => {
    const el = mount("pbs-form", form);
    expect(one(el, '[part="title"]').textContent).toBe("Decide");
    expect(all(el, '[part="question"]').length).toBe(3);
    expect(one(el, ".req").textContent).toBe("*");
    expect(text(el)).toContain("(required)");
    expect(one(el, '[part="hint"]').textContent).toBe("Pick one");
    expect(one(el, '[part="badge"]').textContent).toBe("Recommended");
    expect(all<HTMLInputElement>(el, '[part="other"]').map((box) => box.placeholder)).toEqual([
      "Other (type your own)",
      "Anything else",
    ]);
    // The third question has no other box (other: false); its textarea is labelled by the legend.
    const area = one(el, "textarea");
    expect(root(el).getElementById(area.getAttribute("aria-labelledby") as string)?.textContent).toContain("Why?");
    expectCspSafe(el);
  });

  test("submits single, multi, other, and text answers as the Answer, which encodes as the agent reads it", () => {
    const got = answers();
    const el = mount("pbs-form", form);
    el.ref = { block: 1 };
    check(radios(el)[1] as HTMLInputElement);
    check(boxes(el)[0] as HTMLInputElement);
    type(all<HTMLInputElement>(el, '[part="other"]')[1] as HTMLInputElement, "retries");
    type(one<HTMLTextAreaElement>(el, "textarea"), "  latency  ");
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details).toEqual([
      {
        kind: "form",
        title: "Decide",
        fields: [
          ["form", "Decide"],
          ["store", "pg"],
          ["extras", "ttl, retries"],
          ["why", "latency"],
        ],
        ref: { block: 1 },
      },
    ]);
    expect(encodeAnswer(got.details[0] as never)).toBe(
      "User submitted a form in the HTML review pane:\n- form: Decide\n- store: pg\n- extras: ttl, retries\n- why: latency",
    );
    expect(one(el, '[part="status"]').textContent).toBe("Sent.");
  });

  test("typing in the single question's other box replaces the ticked choice, and a ticked choice drops the other", () => {
    const got = answers();
    const el = mount("pbs-form", form);
    check(radios(el)[0] as HTMLInputElement);
    type(all<HTMLInputElement>(el, '[part="other"]')[0] as HTMLInputElement, "Redis");
    expect(radios(el).map((radio) => radio.checked)).toEqual([false, false, true]);
    click(one(el, '[part="submit"]'));
    check(radios(el)[1] as HTMLInputElement);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details.map((answer) => answer.fields[1])).toEqual([
      ["store", "Redis"],
      ["store", "pg"],
    ]);
  });

  test("unanswered questions go back as (no answer)", () => {
    const got = answers();
    const el = mount("pbs-form", form);
    check(radios(el)[0] as HTMLInputElement);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details[0]?.fields).toEqual([
      ["form", "Decide"],
      ["store", "sqlite"],
      ["extras", "(no answer)"],
      ["why", "(no answer)"],
    ]);
  });

  test("a missing required answer blocks the send, names the question, marks it invalid, and focuses it", () => {
    const got = answers();
    const el = mount("pbs-form", form);
    click(one(el, '[part="submit"]'));
    expect(got.details).toEqual([]);
    expect(one(el, '[part="error"]').textContent).toBe("Not answered yet: Which store?");
    expect(one(el, '[part="question"]').getAttribute("aria-invalid")).toBe("true");
    expect(root(el).activeElement).toBe(radios(el)[0] as HTMLInputElement);
    check(radios(el)[0] as HTMLInputElement);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details.length).toBe(1);
    expect(one(el, '[part="error"]').textContent).toBe("");
    expect(one(el, '[part="question"]').getAttribute("aria-invalid")).toBeNull();
  });

  test("a multi question sends nothing on a tick, only on Send, and then carries every chosen value", () => {
    const got = answers();
    const el = mount("pbs-form", form);
    check(radios(el)[0] as HTMLInputElement);
    check(boxes(el)[0] as HTMLInputElement);
    check(boxes(el)[1] as HTMLInputElement);
    expect(got.details).toEqual([]);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details.length).toBe(1);
    expect(encodeAnswer(got.details[0] as never)).toContain("- extras: ttl, wal");
  });

  test("a required multi question with nothing chosen is refused at that question", () => {
    const got = answers();
    const el = mount("pbs-form", {
      questions: [
        {
          name: "extras",
          label: "Extras",
          type: "multi",
          required: true,
          other: false,
          choices: [{ value: "ttl", label: "TTL" }],
        },
      ],
    } satisfies FormData);
    click(one(el, '[part="submit"]'));
    expect(got.details).toEqual([]);
    expect(one(el, '[part="error"]').textContent).toBe("Not answered yet: Extras");
    expect(one(el, '[part="question"]').getAttribute("aria-invalid")).toBe("true");
    check(boxes(el)[0] as HTMLInputElement);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details.length).toBe(1);
  });

  test("Ctrl+Enter in a text box submits; a plain Enter does not", () => {
    const got = answers();
    const el = mount("pbs-form", { ...form, questions: [form.questions[2] as FormData["questions"][number]] });
    const area = one<HTMLTextAreaElement>(el, "textarea");
    type(area, "hi");
    key(area, "Enter");
    expect(got.details).toEqual([]);
    key(area, "Enter", { ctrlKey: true });
    key(area, "Enter", { metaKey: true });
    got.stop();
    expect(got.details.map((answer) => answer.fields[1])).toEqual([
      ["why", "hi"],
      ["why", "hi"],
    ]);
  });

  test("focus stays on the send button after a submit, and what was typed survives a density redraw", () => {
    const el = mount("pbs-form", form);
    check(radios(el)[0] as HTMLInputElement);
    type(one<HTMLTextAreaElement>(el, "textarea"), "draft");
    const button = one(el, '[part="submit"]');
    button.focus();
    click(button);
    expect(root(el).activeElement).toBe(button);
    el.setAttribute("density", "compact");
    expect(one<HTMLTextAreaElement>(el, "textarea").value).toBe("draft");
    expect(radios(el)[0]?.checked).toBe(true);
  });

  test("answered locks it and shows the labelled values that were sent", () => {
    const got = answers();
    const el = mount("pbs-form", form);
    el.answered = [
      ["form", "Decide"],
      ["store", "pg"],
      ["why", "latency"],
    ];
    expect(root(el).querySelector("input, textarea, button")).toBeNull();
    expect(all(el, "dt").map((dt) => dt.textContent)).toEqual(["Which store?", "Why?"]);
    expect(all(el, "dd").map((dd) => dd.textContent)).toEqual(["pg", "latency"]);
    expect(text(el)).toContain("Sent");
    got.stop();
    expect(got.details).toEqual([]);
  });

  test("the probe renders as text in every text field", () => {
    const el = mount<FormData>("pbs-form", {
      title: PROBE_TEXT,
      submit: PROBE_TEXT,
      questions: [
        {
          name: PROBE_TEXT,
          label: PROBE_TEXT,
          type: "single",
          required: true,
          other: PROBE_TEXT,
          hint: PROBE_TEXT,
          choices: [{ value: PROBE_TEXT, label: PROBE_TEXT, note: PROBE_TEXT, recommended: PROBE_TEXT }],
        },
      ],
    });
    expectInert(el);
    expect(one(el, '[part="submit"]').textContent).toContain("<img");
  });
});

const review: ReviewData = {
  title: "Landing page",
  pick: true,
  columns: 2,
  items: [
    { name: "A", label: "dark", image: "https://example.com/a.png" },
    { name: "B", body: "Light variant", page: "proto/b.html", height: 300 },
    { name: "C", image: "file:abc123" },
  ],
};

describe("pbs-review", () => {
  test("renders items with names, a pick radio each, a comment box each, and the column count", () => {
    const el = mount("pbs-review", review);
    expect(one(el, '[part="items"]').getAttribute("data-columns")).toBe("2");
    expect(all(el, '[part="item-title"]').map((title) => title.textContent)).toEqual(["A (dark)", "B", "C"]);
    expect(all(el, '[part="pick"]').length).toBe(3);
    expect(all(el, '[part="comment"]').length).toBe(3);
    expectCspSafe(el);
  });

  test("an image shows only through the host's imageUrl; unresolved references and page frames show a note", () => {
    const el = mount("pbs-review", review);
    // Default hook: http(s) URLs pass, anything else does not.
    expect(all<HTMLImageElement>(el, "img").map((img) => img.getAttribute("src"))).toEqual([
      "https://example.com/a.png",
    ]);
    expect(all(el, '[part="unavailable"]').map((note) => note.textContent)).toEqual([
      "Image not available: file:abc123",
    ]);
    expect(root(el).querySelector("iframe")).toBeNull();
    expect(text(el)).toContain("proto/b.html");
    // happy-dom reports that it will not load the frame's page; that is not what this test is about.
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    configure({
      imageUrl: (ref) => (ref.startsWith("file:") ? `/files/${ref.slice(5)}` : undefined),
      pageUrl: (ref) => `/pages/${ref}`,
    });
    expect(all<HTMLImageElement>(el, "img").map((img) => img.getAttribute("src"))).toEqual(["/files/abc123"]);
    const frame = one<HTMLIFrameElement>(el, "iframe");
    expect(frame.getAttribute("src")).toBe("/pages/proto/b.html");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("height")).toBe("300");
    quiet.mockRestore();
  });

  test("an image that fails to load becomes a note", () => {
    const el = mount("pbs-review", { items: [{ name: "A", image: "https://example.com/a.png" }] });
    one(el, "img").dispatchEvent(new Event("error"));
    expect(root(el).querySelector("img")).toBeNull();
    expect(text(el)).toContain("Image not available");
  });

  test("enlarge opens a labelled modal dialog that closes on its button", () => {
    const el = mount("pbs-review", review);
    click(one(el, '[part="enlarge"]'));
    const dialog = one<HTMLDialogElement>(el, "dialog");
    expect(dialog.getAttribute("aria-label")).toBe("A (dark)");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
    click(one(el, '[part="close"]'));
    expect(root(el).querySelector("dialog")).toBeNull();
  });

  test("sends the pick, each comment, and the items left blank as the review Answer", () => {
    const got = answers();
    const el = mount("pbs-review", review);
    check(all<HTMLInputElement>(el, 'input[type="radio"]')[0] as HTMLInputElement);
    type(all<HTMLTextAreaElement>(el, "textarea")[0] as HTMLTextAreaElement, "text too small\nbuttons crowded");
    type(all<HTMLTextAreaElement>(el, "textarea")[1] as HTMLTextAreaElement, "  ");
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details).toEqual([
      {
        kind: "review",
        title: "Landing page",
        fields: [
          ["title", "Landing page"],
          ["picked", "A (dark)"],
          ["item", "A (dark)"],
          ["comment", "text too small\nbuttons crowded"],
          ["silent", "B, C"],
        ],
      },
    ]);
    expect(encodeAnswer(got.details[0] as never)).toBe(
      'User reviewed "Landing page":\nPicked: A (dark)\n- A (dark): text too small\n  buttons crowded\nNo feedback on: B, C',
    );
  });

  test("picking an item and typing a comment send nothing; only Send does", () => {
    const got = answers();
    const el = mount("pbs-review", review);
    check(all<HTMLInputElement>(el, 'input[type="radio"]')[1] as HTMLInputElement);
    type(all<HTMLTextAreaElement>(el, "textarea")[0] as HTMLTextAreaElement, "hi");
    expect(got.details).toEqual([]);
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details.length).toBe(1);
  });

  test("a review with every box blank is still an answer; a title-less one is called Review", () => {
    const got = answers();
    const el = mount("pbs-review", { items: [{ name: "A" }] });
    click(one(el, '[part="submit"]'));
    got.stop();
    expect(got.details[0]?.fields).toEqual([
      ["title", "Review"],
      ["silent", "A"],
    ]);
  });

  test("Ctrl+Enter in a comment box submits", () => {
    const got = answers();
    const el = mount("pbs-review", { items: [{ name: "A" }] });
    key(one(el, "textarea"), "Enter", { ctrlKey: true });
    got.stop();
    expect(got.details.length).toBe(1);
  });

  test("answered locks it and shows the pick, the comments, and who got none", () => {
    const el = mount("pbs-review", review);
    el.answered = [
      ["title", "Landing page"],
      ["picked", "A (dark)"],
      ["item", "A (dark)"],
      ["comment", "too small"],
      ["silent", "B, C"],
    ];
    expect(root(el).querySelector("textarea, button, input")).toBeNull();
    expect(all(el, "dt").map((dt) => dt.textContent)).toEqual(["Picked", "A (dark)", "No feedback"]);
    expect(all(el, "dd").map((dd) => dd.textContent)).toEqual(["A (dark)", "too small", "B, C"]);
  });

  test("the probe renders as text", () => {
    expectInert(
      mount<ReviewData>("pbs-review", {
        title: PROBE_TEXT,
        submit: PROBE_TEXT,
        pick: PROBE_TEXT,
        items: [{ name: PROBE_TEXT, label: PROBE_TEXT, body: PROBE_TEXT }],
      }),
    );
  });
});
