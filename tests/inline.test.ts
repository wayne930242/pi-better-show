import { describe, expect, test } from "bun:test";
import { type InlineToken, inline, inlinePlain } from "../src/core/index.ts";

const t = (text: string): InlineToken => ({ type: "text", text });

describe("inline", () => {
  test("plain text is one token", () => {
    expect(inline("hello 世界")).toEqual([t("hello 世界")]);
    expect(inline("")).toEqual([]);
  });

  test("bold, italic, code", () => {
    expect(inline("a **b** *c* _d_ __e__ `f`")).toEqual([
      t("a "),
      { type: "strong", children: [t("b")] },
      t(" "),
      { type: "em", children: [t("c")] },
      t(" "),
      { type: "em", children: [t("d")] },
      t(" "),
      { type: "strong", children: [t("e")] },
      t(" "),
      { type: "code", text: "f" },
    ]);
  });

  test("emphasis nests, and *** is both", () => {
    expect(inline("**a *b* c**")).toEqual([
      { type: "strong", children: [t("a "), { type: "em", children: [t("b")] }, t(" c")] },
    ]);
    expect(inline("***both***")).toEqual([{ type: "strong", children: [{ type: "em", children: [t("both")] }] }]);
  });

  test("markers that do not pair stay literal", () => {
    expect(inline("2 * 3 * 4")).toEqual([t("2 * 3 * 4")]);
    expect(inline("snake_case_name")).toEqual([t("snake_case_name")]);
    expect(inline("**open")).toEqual([t("**open")]);
    expect(inline("a ` b")).toEqual([t("a ` b")]);
  });

  test("code is verbatim: no emphasis, no links inside", () => {
    expect(inline("`**x** [a](https://b.c)`")).toEqual([{ type: "code", text: "**x** [a](https://b.c)" }]);
    expect(inline("``a ` b``")).toEqual([{ type: "code", text: "a ` b" }]);
  });

  test("links: [text](http(s) url) and bare URLs", () => {
    expect(inline("see [the **docs**](https://example.com/a?b=1) now")).toEqual([
      t("see "),
      {
        type: "link",
        href: "https://example.com/a?b=1",
        children: [t("the "), { type: "strong", children: [t("docs")] }],
      },
      t(" now"),
    ]);
    expect(inline("go to https://example.com/x, then (http://a.b/c).")).toEqual([
      t("go to "),
      { type: "link", href: "https://example.com/x", children: [t("https://example.com/x")] },
      t(", then ("),
      { type: "link", href: "http://a.b/c", children: [t("http://a.b/c")] },
      t(")."),
    ]);
  });

  test("only http and https links are links", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "ftp://a.b/c", "//evil.example", "/relative"]) {
      expect(inline(`[x](${href})`).every((token) => token.type !== "link")).toBe(true);
    }
    expect(inline("[x](javascript:alert(1))")).toEqual([t("[x](javascript:alert(1))")]);
  });

  test("raw HTML is text, never markup", () => {
    expect(inline("<script>alert(1)</script> <b>x</b>")).toEqual([t("<script>alert(1)</script> <b>x</b>")]);
    expect(inline("<img src=x onerror=alert(1)>")).toEqual([t("<img src=x onerror=alert(1)>")]);
  });

  test("line breaks and escapes", () => {
    expect(inline("a\nb")).toEqual([t("a"), { type: "br" }, t("b")]);
    expect(inline("a\r\nb")).toEqual([t("a"), { type: "br" }, t("b")]);
    expect(inline("\\*not em\\* and \\[x\\](foo)")).toEqual([t("*not em* and [x](foo)")]);
    expect(inline("back\\slash")).toEqual([t("back\\slash")]);
  });

  test("a long run of markers finishes quickly", () => {
    const start = performance.now();
    inline("*".repeat(5000));
    inline("[".repeat(5000));
    inline("`".repeat(5000));
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("inlinePlain", () => {
  test("drops markers and writes a link as text (url)", () => {
    expect(inlinePlain("**a** *b* `c` [d](https://e.f) https://g.h\nnext")).toBe(
      "a b c d (https://e.f) https://g.h\nnext",
    );
  });
});
