import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AlertData, FormData } from "../../src/core/types.ts";
import { configure, defineAll, resetConfiguration, TAGS } from "../../src/elements/index.ts";
import { all, answers, cleanup, click, expectCspSafe, mount, one, root, text } from "./helpers.ts";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("lang");
  resetConfiguration();
});

const callout: AlertData = { tone: "note", title: "", body: "x" };

describe("shell", () => {
  test("every block kind has a defined element, and importing twice leaves the first definition", () => {
    const before = customElements.get("pbs-form");
    defineAll();
    expect(customElements.get("pbs-form")).toBe(before);
    expect(Object.keys(TAGS).length).toBe(13);
    for (const tag of Object.values(TAGS)) expect(customElements.get(tag)).toBeDefined();
  });

  test("data-json sets the data; bad JSON shows an error panel and fires pbs-error", () => {
    const el = document.createElement("pbs-callout");
    el.setAttribute("data-json", JSON.stringify({ tone: "ok", title: "From JSON", body: "b" }));
    document.body.append(el);
    expect(one(el, '[part="title"]').textContent).toBe("From JSON");
    const errors: unknown[] = [];
    el.addEventListener("pbs-error", (event) => errors.push((event as CustomEvent).detail));
    el.setAttribute("data-json", "{nope");
    expect(one(el, '[part="error"]').getAttribute("role")).toBe("alert");
    expect(errors.length).toBe(1);
  });

  test("a block that throws while drawing becomes an error panel, not an exception in the host", () => {
    const el = mount("pbs-cards", { cards: "not a list" });
    expect(one(el, '[part="error"]').textContent).toContain("cannot be shown");
  });

  test("data-answered locks like the property does", () => {
    const el = document.createElement("pbs-options");
    el.setAttribute("data-json", JSON.stringify({ options: [{ title: "A", pros: [], cons: [] }] }));
    el.setAttribute("data-answered", JSON.stringify([["picked", "A"]]));
    document.body.append(el);
    expect(one(el, "[data-selected]")).toBeDefined();
  });

  test("the block address comes from the doc and block attributes when no ref is set", () => {
    const got = answers();
    const el = mount("pbs-suggest", { items: [{ label: "Yes", text: "Yes" }] }, { doc: "a.md", block: "4" });
    click(one(el, '[part="chip"]'));
    got.stop();
    expect(got.details[0]?.ref).toEqual({ doc: "a.md", block: 4 });
  });

  test("a disconnected element draws nothing until it is attached", () => {
    const el = document.createElement("pbs-callout") as ReturnType<typeof mount<AlertData>>;
    el.data = callout;
    expect(root(el).childNodes.length).toBe(0);
    document.body.append(el);
    expect(root(el).childNodes.length).toBeGreaterThan(0);
  });
});

describe("language and strings", () => {
  const form: FormData = { questions: [{ name: "q", type: "text", required: true, other: false, choices: [] }] };

  test("lang on the element, an ancestor, or the document chooses zh-Hant; others are English", () => {
    const own = mount("pbs-callout", callout, { lang: "zh-TW" });
    expect(one(own, '[part="title"]').textContent).toBe("備註");
    const parent = document.createElement("div");
    parent.lang = "zh-Hant";
    document.body.append(parent);
    const inner = document.createElement("pbs-callout") as typeof own;
    parent.append(inner);
    inner.data = callout;
    expect(one(inner, '[part="title"]').textContent).toBe("備註");
    expect(one(mount("pbs-callout", callout, { lang: "fr" }), '[part="title"]').textContent).toBe("Note");
    document.documentElement.lang = "zh";
    expect(one(mount("pbs-callout", callout), '[part="title"]').textContent).toBe("備註");
  });

  test("a lang change redraws; the form's own words follow the locale", () => {
    const el = mount("pbs-form", form);
    expect(one(el, '[part="submit"]').textContent).toBe("Send");
    el.setAttribute("lang", "zh-Hant");
    expect(one(el, '[part="submit"]').textContent).toBe("送出");
  });

  test("configure({strings}) overrides single words per locale, redraws what is on the page, and merges", () => {
    const el = mount("pbs-form", form);
    configure({ strings: { en: { send: "Ship it" } } });
    expect(one(el, '[part="submit"]').textContent).toBe("Ship it");
    configure({ strings: { en: { sent: "Delivered." }, "zh-Hant": { send: "發送" } } });
    expect(one(el, '[part="submit"]').textContent).toBe("Ship it");
    el.setAttribute("lang", "zh-Hant");
    expect(one(el, '[part="submit"]').textContent).toBe("發送");
    expect(text(el)).not.toContain("undefined");
  });

  test("density is a reflected attribute with comfortable as the default", () => {
    const el = mount("pbs-callout", callout);
    expect(el.density).toBe("comfortable");
    el.density = "compact";
    expect(el.getAttribute("density")).toBe("compact");
  });

  test("the scheme attribute wins over the computed color-scheme and the system's", () => {
    const el = mount("pbs-callout", callout);
    el.scheme = "dark";
    expect(el.scheme).toBe("dark");
    el.removeAttribute("scheme");
    expect(["light", "dark"]).toContain(el.scheme);
  });
});

const read = (path: string) => readFileSync(join(import.meta.dir, "../..", path), "utf8");
const sources = readdirSync(join(import.meta.dir, "../../src/elements")).map((file) => ({
  file: `src/elements/${file}`,
  code: read(`src/elements/${file}`),
}));
const stripped = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the sources keep the elements' promises", () => {
  test("no source can turn a string into markup, and none creates a <style> element or sets a style attribute", () => {
    for (const { file, code } of sources) {
      const body = stripped(code);
      for (const banned of [
        /\binnerHTML\b/,
        /\bouterHTML\b/,
        /\binsertAdjacentHTML\b/,
        /\bdocument\.write\b/,
        /\bcreateContextualFragment\b/,
        /\bDOMParser\b/,
        /\bsetHTMLUnsafe\b/,
        /\beval\s*\(/,
        /\bnew Function\b/,
        /createElement\(\s*["']style["']/,
        /["']style["']\s*[:,]/,
        /setAttribute\(\s*["']style["']/,
        /\.style\./,
        /\.style\s*=/,
      ]) {
        if (banned.test(body)) throw new Error(`${file} matches ${banned}`);
      }
    }
  });

  test("elements import only core's inline, types, and blocks modules: no yaml, no node", () => {
    for (const { file, code } of sources) {
      for (const match of code.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
        const specifier = match[1] as string;
        const allowed =
          specifier.startsWith("./") ||
          ["../core/inline.ts", "../core/types.ts", "../core/blocks.ts"].includes(specifier);
        if (!allowed) throw new Error(`${file} imports ${specifier}`);
      }
    }
  });

  test("no source file passes 500 lines", () => {
    for (const { file, code } of sources) expect(code.split("\n").length, file).toBeLessThanOrEqual(500);
  });

  test("a tone or status never colours or thickens one side of a border", () => {
    for (const { file, code } of sources) {
      for (const match of code.matchAll(/border-(left|right|top|bottom)[a-z-]*\s*:\s*([^;]+);/g)) {
        // Allowed: removing one, and a table row's neutral 1px hairline.
        const value = (match[2] as string).trim();
        const neutral =
          value === "0" || value === "none" || (match[1] === "bottom" && value === "1px solid var(--_line)");
        if (!neutral) throw new Error(`${file}: ${match[0]}`);
      }
    }
  });

  test("every public token the spec lists is read in the shared sheet, with a light-dark() default for the colours", () => {
    const css = read("src/elements/styles.ts");
    for (const token of [
      "bg",
      "fg",
      "muted",
      "line",
      "accent",
      "note",
      "ok",
      "warn",
      "risk",
      "radius",
      "font",
      "mono",
      "gap",
    ]) {
      expect(css).toContain(`var(--pbs-${token},`);
    }
    for (const token of ["bg", "fg", "muted", "line", "accent", "note", "ok", "warn", "risk"]) {
      expect(css).toMatch(new RegExp(`var\\(--pbs-${token}, light-dark\\(`));
    }
  });

  test("every element is a shadow root with a constructed stylesheet and no <style>", () => {
    for (const tag of Object.values(TAGS)) {
      const el = document.createElement(tag);
      document.body.append(el);
      expect(all(el, "*").length).toBe(0);
      expectCspSafe(el);
    }
  });
});
