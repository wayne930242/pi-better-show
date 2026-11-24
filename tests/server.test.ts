import { describe, expect, test } from "bun:test";
import { renderMermaidSVG } from "beautiful-mermaid";
import { parse, toText } from "../src/core/index.ts";
import { diagramNotes, mermaidSvg, mermaidText } from "../src/server/index.ts";

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
    expect(mermaidSvg(FLOW, { scheme: "light" })).toContain("--bg:#ffffff");
    expect(mermaidSvg(FLOW, { scheme: "dark" })).toContain("--bg:#151b23");
    const custom = mermaidSvg(FLOW, { scheme: { bg: "#102030", fg: "#f0e0d0", accent: "#ff8800" } });
    expect(custom).toContain("--bg:#102030");
    expect(custom).toContain("--fg:#f0e0d0");
    expect(custom).toContain("--accent:#ff8800");
  });

  test("the built-in schemes carry the element tokens, accent and muted included", () => {
    const light = mermaidSvg(FLOW, { scheme: "light" });
    for (const token of ["--fg:#1f2328", "--accent:#0969da", "--muted:#59636e", "--surface:#f6f8fa"]) {
      expect(light).toContain(token);
    }
    const dark = mermaidSvg(FLOW, { scheme: "dark" });
    for (const token of ["--fg:#e6edf3", "--accent:#4493f8", "--muted:#9ba3ad", "--surface:#1d252f"]) {
      expect(dark).toContain(token);
    }
  });

  test("edges stay at least 3:1 against the background in both schemes", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => {
        const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
    };
    const mix = (a: string, b: string) =>
      `#${[1, 3, 5]
        .map((i) =>
          Math.round((Number.parseInt(a.slice(i, i + 2), 16) + Number.parseInt(b.slice(i, i + 2), 16)) / 2)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    for (const scheme of ["light", "dark"] as const) {
      const svg = mermaidSvg(FLOW, { scheme });
      // With no --line the library draws edges in a 50% fg/bg mix.
      expect(svg).not.toContain("--line:");
      const bg = /--bg:(#\w+)/.exec(svg)?.[1] as string;
      const fg = /--fg:(#\w+)/.exec(svg)?.[1] as string;
      const [hi, lo] = [lum(mix(fg, bg)), lum(bg)].sort((x, y) => y - x) as [number, number];
      expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(3);
    }
  });

  test("transparent leaves the background out", () => {
    expect(mermaidSvg(FLOW)).toContain("background:var(--bg)");
    expect(mermaidSvg(FLOW, { transparent: true })).not.toContain("background:var(--bg)");
  });

  test("a font is a family name that replaces the default", () => {
    expect(mermaidSvg(FLOW)).toContain("font-family: 'system-ui'");
    expect(mermaidSvg(FLOW, { font: "Noto Sans TC" })).toContain("font-family: 'Noto Sans TC'");
  });

  test("pads the drawing by 20, not the library's 40", () => {
    const width = (svg: string) => Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
    expect(width(mermaidSvg(FLOW))).toBe(width(renderMermaidSVG(FLOW, { padding: 20 })));
    expect(width(mermaidSvg(FLOW))).toBeLessThan(width(renderMermaidSVG(FLOW)));
  });

  test("the font stack ends in Traditional Chinese faces", () => {
    const svg = mermaidSvg(FLOW, { font: "Inter" });
    expect(svg).toMatch(
      /font-family: 'Inter', [^;]*'PingFang TC'[^;]*'Noto Sans TC'[^;]*'Microsoft JhengHei'[^;]*sans-serif;/,
    );
  });

  test("a source with Han characters marks the drawing zh-Hant, others stay unmarked", () => {
    expect(mermaidSvg("graph TD\n  A[開始] --> B")).toMatch(/^<svg [^>]*xml:lang="zh-Hant"/);
    expect(mermaidSvg(FLOW)).not.toContain("xml:lang");
  });

  test("the drawing starts with a title and a desc of what it shows, in the source's language", () => {
    expect(mermaidSvg(FLOW)).toMatch(
      /^<svg [^>]*role="img"[^>]*>\s*<title>Flowchart<\/title>\s*<desc>3 nodes: Start → Ok\? → Done<\/desc>/,
    );
    expect(mermaidSvg("graph TD\n  A[開始] --> B")).toContain("<title>流程圖</title>");
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

describe("diagramNotes", () => {
  /** The notes that are about how much the diagram holds, not how wide it draws. */
  const crowd = (source: string) => diagramNotes(source).filter((note) => !note.includes("wide"));
  const chain = (n: number) =>
    `graph TD\n${Array.from({ length: n - 1 }, (_, i) => `  N${i} --> N${i + 1}`).join("\n")}`;

  test("a readable diagram has no notes", () => {
    expect(diagramNotes(FLOW)).toEqual([]);
    expect(diagramNotes(chain(9))).toEqual([]);
  });

  test("a flowchart with more than 9 nodes or 12 edges is told to split", () => {
    expect(diagramNotes(chain(10))).toEqual([expect.stringContaining("10 nodes")]);
    const dense = `graph TD\n${Array.from({ length: 13 }, () => "  A --> B").join("\n")}`;
    expect(diagramNotes(dense).join(" ")).toContain("13 edges");
  });

  test("each diagram type has its own limit", () => {
    const lanes = (n: number) =>
      `sequenceDiagram\n${Array.from({ length: n - 1 }, (_, i) => `  P${i}->>P${i + 1}: hi`).join("\n")}`;
    expect(crowd(lanes(5))).toEqual([]);
    expect(diagramNotes(lanes(6)).join(" ")).toContain("6 lifelines");
    const entities = (n: number) =>
      `erDiagram\n${Array.from({ length: n - 1 }, (_, i) => `  E${i} ||--o{ E${i + 1} : has`).join("\n")}`;
    expect(crowd(entities(8))).toEqual([]);
    expect(diagramNotes(entities(9)).join(" ")).toContain("9 entities");
  });

  test("a drawing wider than 900px is said to shrink in a narrow page", () => {
    const wide = `graph LR\n${Array.from({ length: 9 }, (_, i) => `  W${i}[A fairly long node label ${i}] --> W${i + 1}`).join("\n")}`;
    expect(diagramNotes(wide).join(" ")).toContain("wide");
  });

  test("a source that cannot be drawn has no notes (the error is reported elsewhere)", () => {
    expect(diagramNotes("not a diagram")).toEqual([]);
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
