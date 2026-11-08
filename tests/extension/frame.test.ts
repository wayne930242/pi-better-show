import { describe, expect, test } from "bun:test";
import { MAX_SELECTION } from "../../src/extension/client/bridge.ts";

/** The frame hook reports the user's selection to the parent; under happy-dom the top window is its own parent. */
describe("the frame hook's selection report", () => {
  test("posts the selected text to the parent, bounded, and says so once when it is cleared", async () => {
    const sent: unknown[] = [];
    const real = window.postMessage.bind(window);
    window.postMessage = ((message: unknown) => void sent.push(message)) as typeof window.postMessage;
    try {
      await import("../../src/extension/client/frame.ts");
      document.body.innerHTML = `<p id="p">${"z".repeat(MAX_SELECTION + 50)}</p><input id="i" value="secret">`;
      const text = document.getElementById("p")?.firstChild as Node;
      const select = (): void => {
        const range = document.createRange();
        range.selectNodeContents(text);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      };
      select();
      const [first] = sent as { source: string; type: string; text: string }[];
      expect(first?.source).toBe("pbs-frame");
      expect(first?.type).toBe("selection");
      expect(first?.text).toHaveLength(MAX_SELECTION);
      getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
      document.dispatchEvent(new Event("selectionchange"));
      expect(sent).toHaveLength(2);
      expect((sent[1] as { text: string }).text).toBe("");
    } finally {
      window.postMessage = real;
    }
  });
});
