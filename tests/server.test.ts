import { describe, expect, test } from "bun:test";
import { parse, toText } from "../src/core/index.ts";
import { mermaidSvg, mermaidText } from "../src/server/index.ts";

const FLOW = "graph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]";

describe("mermaidSvg", () => {
  test("draws an SVG with no web-font import, no script, and nothing loaded from another site", () => {
    const svg = mermaidSvg(FLOW);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).not.toContain("@import");
    expect(svg).not.toMatch(/<script/i);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:\/\//);
  });

  test("is themed by the scheme it is given", () => {
    expect(mermaidSvg(FLOW, { scheme: "light" })).toContain("--bg:#FFFFFF");
    expect(mermaidSvg(FLOW, { scheme: "dark" })).toContain("--bg:#18181B");
    const custom = mermaidSvg(FLOW, { scheme: { bg: "#102030", fg: "#f0e0d0", accent: "#ff8800" } });
    expect(custom).toContain("--bg:#102030");
    expect(custom).toContain("--fg:#f0e0d0");
    expect(custom).toContain("--accent:#ff8800");
  });

  test("transparent leaves the background out", () => {
    expect(mermaidSvg(FLOW)).toContain("background:var(--bg)");
    expect(mermaidSvg(FLOW, { transparent: true })).not.toContain("background:var(--bg)");
  });

  test("a font is a family name that replaces the default", () => {
    expect(mermaidSvg(FLOW)).toContain("font-family: 'system-ui'");
    expect(mermaidSvg(FLOW, { font: "Noto Sans TC" })).toContain("font-family: 'Noto Sans TC'");
  });

  test("label text cannot inject markup", () => {
    const svg = mermaidSvg('graph TD\n  A["<script>alert(1)</script><img src=x onerror=alert(1)>"] --> B');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<img/i);
  });

  test("throws on a source it cannot draw", () => {
    expect(() => mermaidSvg("not a diagram")).toThrow();
  });
});

describe("mermaidText", () => {
  test("draws Unicode box drawing, trimmed, with no ANSI colour", () => {
    expect(mermaidText("graph LR\n  A --> B")).toBe(
      ["┌───┐     ┌───┐", "│   │     │   │", "│ A ├────►│ B │", "│   │     │   │", "└───┘     └───┘"].join("\n"),
    );
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the absence of escape codes
    expect(mermaidText(FLOW)).not.toMatch(/\u001b/);
  });

  test("draws every diagram type beautiful-mermaid supports", () => {
    const samples = [
      "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run: start\n  Run --> [*]",
      "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi",
      "classDiagram\n  Animal <|-- Duck\n  Animal: +int age",
      "erDiagram\n  CUSTOMER ||--o{ ORDER : places",
    ];
    for (const sample of samples) expect(mermaidText(sample, 80)).toBeString();
  });

  test("returns undefined when a line is wider than the width (D3: the caller falls back to the source)", () => {
    const chain = "graph LR\n  A --> B --> C --> D --> E --> F --> G";
    const drawn = mermaidText(chain, 200) as string;
    const widest = Math.max(...drawn.split("\n").map((line) => line.length));
    expect(widest).toBeGreaterThan(60);
    expect(mermaidText(chain)).toBeUndefined();
    expect(mermaidText(chain, widest)).toBe(drawn);
    expect(mermaidText(chain, widest - 1)).toBeUndefined();
  });

  test("returns undefined for a source it cannot draw", () => {
    expect(mermaidText("not a diagram")).toBeUndefined();
    expect(mermaidText("")).toBeUndefined();
  });

  test("returns undefined when wide characters would misalign the boxes", () => {
    expect(mermaidText("graph TD\n  A[開始] --> B[結束]")).toBeUndefined();
  });
});

describe("mermaidText as the toText hook", () => {
  const document = (source: string) => parse(`\`\`\`mermaid\n${source}\n\`\`\`\n`);

  test("a diagram that fits is drawn in a code block", () => {
    const text = toText(document("graph LR\n  A --> B"), { flavor: "discord", mermaid: mermaidText });
    expect(text).toBe("```\n┌───┐     ┌───┐\n│   │     │   │\n│ A ├────►│ B │\n│   │     │   │\n└───┘     └───┘\n```");
  });

  test("a diagram that is too wide falls back to its source and the pointer", () => {
    const source = "graph LR\n  A --> B --> C --> D --> E --> F --> G";
    const text = toText(document(source), { flavor: "discord", mermaid: mermaidText });
    expect(text).toBe(`\`\`\`\n${source}\n\`\`\`\n(The web view shows this diagram drawn.)`);
  });

  test("the width in the profile reaches the hook", () => {
    const source = "graph LR\n  A --> B --> C --> D --> E --> F --> G";
    const text = toText(document(source), { flavor: "discord", width: 80, mermaid: mermaidText });
    expect(text).toContain("┌───┐");
  });

  test("an invalid diagram falls back to its source", () => {
    const text = toText(document("not a diagram"), { flavor: "plain", mermaid: mermaidText });
    expect(text).toBe("  not a diagram\n(The web view shows this diagram drawn.)");
  });
});
