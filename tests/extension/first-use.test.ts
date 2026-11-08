import { expect, test } from "bun:test";
import { setup } from "./fixture.ts";

test("two shows at the same moment start one page server", async () => {
  const t = setup();
  await Promise.all([
    t.show.show(t.root, ["a.md"], "first", "page"),
    t.show.show(t.root, ["p.html"], "second", "page"),
  ]);
  expect(t.served.count).toBe(1);
});
