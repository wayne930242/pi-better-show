import { describe, expect, test } from "bun:test";
import { describeDiagram } from "../src/elements/diagram-alt.ts";
import { STRINGS } from "../src/elements/strings.ts";

const FLOW = "graph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]";

describe("describeDiagram", () => {
  test("names the type, the node count and the first edges", () => {
    const d = describeDiagram(FLOW, STRINGS.en);
    expect(d.title).toBe("Flowchart");
    expect(d.desc).toBe("3 nodes: Start → Ok? → Done");
    expect(d.alt).toBe("Flowchart, 3 nodes: Start → Ok? → Done");
  });

  test("speaks Traditional Chinese with the zh-Hant strings", () => {
    const d = describeDiagram("graph LR\n  A[開始] --> B[結束]", STRINGS["zh-Hant"]);
    expect(d.title).toBe("流程圖");
    expect(d.alt).toBe("流程圖，2 個節點：開始 → 結束");
  });

  test("a frontmatter or chart title joins the type", () => {
    expect(describeDiagram(`---\ntitle: Cache path\n---\n${FLOW}`, STRINGS.en).title).toBe("Flowchart “Cache path”");
    expect(describeDiagram('xychart-beta\n  title "Sales"\n  x-axis [a, b]\n  bar [1, 2]', STRINGS.en).alt).toBe(
      "Chart “Sales”",
    );
  });

  test("keeps only the first edges of a long diagram", () => {
    const long = `graph TD\n${"ABCDEFGH"
      .split("")
      .map((c, i, a) => (i ? `  ${a[i - 1]} --> ${c}` : ""))
      .join("\n")}`;
    expect(describeDiagram(long, STRINGS.en).desc).toBe("8 nodes: A → B → C → D …");
  });

  test("other diagram types get the type name alone", () => {
    expect(describeDiagram("sequenceDiagram\n  Alice->>Bob: Hi", STRINGS.en).alt).toBe("Sequence diagram");
    expect(describeDiagram("erDiagram\n  A ||--o{ B : has", STRINGS["zh-Hant"]).alt).toBe("實體關聯圖");
  });
});
