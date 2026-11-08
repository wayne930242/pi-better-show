import { afterEach, describe, expect, test } from "bun:test";
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { parse } from "../../src/core/index.ts";
import type { Answer, BlockSegment, OptionsData } from "../../src/core/types.ts";
import type { PbsElement } from "../../src/elements/index.ts";
import { PbsBlock, PbsCallout, PbsForm, PbsOptions, PbsSuggest } from "../../src/react/index.ts";
import { all, click, one, PROBE_TEXT, root as shadow, type } from "../elements/helpers.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let react: Root;

const render = async (node: Parameters<Root["render"]>[0]) => {
  host = document.createElement("div");
  document.body.append(host);
  react = createRoot(host);
  await act(async () => react.render(node));
};

afterEach(async () => {
  await act(async () => react.unmount());
  document.body.replaceChildren();
});

const options: OptionsData = {
  options: [
    { title: "A", pros: [], cons: [] },
    { title: "B", pros: [], cons: [] },
  ],
};
const first = <T extends Element>(selector: string) => host.querySelector(selector) as T;

describe("react wrappers", () => {
  test("data becomes the element's data, and class, id, density, lang reach the tag", async () => {
    await render(
      createElement(PbsCallout, {
        data: { tone: "ok", title: "Hi", body: "b" },
        className: "bubble",
        id: "c1",
        density: "compact",
        lang: "zh-Hant",
      }),
    );
    const el = first<PbsElement>("pbs-callout");
    expect(el.className).toBe("bubble");
    expect(el.id).toBe("c1");
    expect(el.density).toBe("compact");
    expect(one(el, '[part="title"]').textContent).toBe("Hi");
  });

  test("onAnswer receives the pbs-answer detail with the block's ref", async () => {
    const got: Answer[] = [];
    await render(
      createElement(PbsOptions, {
        data: options,
        blockRef: { doc: "x.md", block: 2 },
        onAnswer: (answer) => void got.push(answer),
      }),
    );
    await act(async () => click(all(first("pbs-options"), '[part="pick"]')[1] as HTMLElement));
    expect(got).toEqual([{ kind: "pick", fields: [["picked", "B"]], ref: { doc: "x.md", block: 2 } }]);
  });

  test("returning false from onAnswer refuses the answer and the element stays open", async () => {
    let calls = 0;
    await render(
      createElement(PbsSuggest, {
        data: { items: [{ label: "Yes", text: "Yes" }] },
        onAnswer: () => {
          calls++;
          return false;
        },
      }),
    );
    await act(async () => click(one(first("pbs-suggest"), '[part="chip"]')));
    await act(async () => click(one(first("pbs-suggest"), '[part="chip"]')));
    expect(calls).toBe(2);
  });

  test("answered locks the element; clearing it reopens", async () => {
    const view = (answered: [string, string][] | undefined) => createElement(PbsOptions, { data: options, answered });
    await render(view([["picked", "A"]]));
    expect(first("pbs-options").shadowRoot?.querySelector("[data-selected]")).not.toBeNull();
    await act(async () => react.render(view(undefined)));
    expect(first("pbs-options").shadowRoot?.querySelector("[data-selected]")).toBeNull();
  });

  test("a parent render with equal data does not wipe what the user typed; new content does", async () => {
    const view = (title: string) =>
      createElement(PbsForm, {
        data: { title, questions: [{ name: "q", type: "text", required: false, other: false, choices: [] }] },
      });
    await render(view("Ask"));
    const el = first<PbsElement>("pbs-form");
    type(one<HTMLTextAreaElement>(el, "textarea"), "draft");
    await act(async () => react.render(view("Ask")));
    expect(one<HTMLTextAreaElement>(el, "textarea").value).toBe("draft");
    await act(async () => react.render(view("Ask again")));
    expect(one<HTMLTextAreaElement>(el, "textarea").value).toBe("");
  });

  test("the ref is the element, and an unmounted component stops listening", async () => {
    const ref = createRef<PbsElement<OptionsData>>();
    const got: Answer[] = [];
    await render(createElement(PbsOptions, { data: options, ref, onAnswer: (answer) => void got.push(answer) }));
    const el = ref.current as PbsElement<OptionsData>;
    expect(el.localName).toBe("pbs-options");
    await act(async () => react.render(createElement("div")));
    el.dispatchEvent(new CustomEvent("pbs-answer", { detail: { kind: "pick", fields: [] } }));
    expect(got).toEqual([]);
  });

  test("PbsBlock draws a parsed segment with the element for its kind and addresses it by index and doc", async () => {
    const blocks = parse("```suggest\n- Yes\n```\n").filter((part): part is BlockSegment => part.type === "block");
    const got: Answer[] = [];
    await render(
      createElement(PbsBlock, {
        segment: blocks[0] as BlockSegment,
        doc: "chat-7",
        onAnswer: (answer) => void got.push(answer),
      }),
    );
    await act(async () => click(one(first("pbs-suggest"), '[part="chip"]')));
    expect(got).toEqual([{ kind: "suggest", fields: [["text", "Yes"]], ref: { doc: "chat-7", block: 0 } }]);
  });

  test("every block kind of the fixture draws without an error panel", async () => {
    const { readFileSync } = await import("node:fs");
    const segments = parse(readFileSync(new URL("../fixtures/all-blocks.md", import.meta.url), "utf8")).filter(
      (part): part is BlockSegment => part.type === "block",
    );
    expect(segments.length).toBe(14);
    await render(
      createElement(
        "div",
        null,
        segments.map((segment) => createElement(PbsBlock, { key: segment.index, segment })),
      ),
    );
    const drawn = [...(host.children[0]?.children ?? [])] as PbsElement[];
    expect(drawn.length).toBe(14);
    for (const el of drawn) {
      expect(el.shadowRoot?.childNodes.length, el.localName).toBeGreaterThan(0);
      expect(el.shadowRoot?.querySelector('div[part="error"]'), el.localName).toBeNull();
    }
  });

  test("server rendering gives empty tags and does not throw", () => {
    const html = renderToString(
      createElement(PbsCallout, { data: { tone: "note", title: PROBE_TEXT, body: "" }, className: "c" }),
    );
    expect(html).toContain("<pbs-callout");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
  });

  test("the probe through a wrapper is still text", async () => {
    await render(createElement(PbsCallout, { data: { tone: "note", title: PROBE_TEXT, body: PROBE_TEXT } }));
    expect(shadow(first("pbs-callout")).querySelectorAll("img").length).toBe(0);
  });
});
