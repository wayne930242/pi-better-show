import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANSWER_EVENT,
  ANSWER_RESULT_EVENT,
  CONTRACT_VERSION,
  DOCUMENTS_EVENT,
  DOCUMENTS_REQUEST_EVENT,
} from "../../src/extension/contract.ts";
import { createBetterShow, defaultDeps, PAGE_OPEN_WAIT_MS } from "../../src/extension/controller.ts";
import { windowsTextEditor } from "../../src/extension/system.ts";
import { setup, shows } from "./fixture.ts";
import { fakePi, http, postJson, tree, until, waitForStream } from "./helpers.ts";

const lists = (t: ReturnType<typeof setup>) =>
  t.on(DOCUMENTS_EVENT) as { version: number; documents: Record<string, unknown>[] }[];
const results = (t: ReturnType<typeof setup>) => t.on(ANSWER_RESULT_EVENT) as Record<string, unknown>[];
const answerOf = (fields: [string, string][], kind = "form") => ({ kind, fields });

describe("show_doc page view", () => {
  test("opens each page in the default browser once, and lists it for other viewers without its path", async () => {
    const t = setup();
    const result = await t.show.show(t.root, ["a.md", "p.html"], "Read this", "page");
    expect(result.opened).toEqual(["a.md", "p.html"]);
    expect(result.text).toContain("in the default browser");
    expect(t.opened).toHaveLength(2);
    expect(t.opened[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]{36}\/files\//);
    expect((await http(t.opened[0] as string)).status).toBe(200);
    const list = lists(t).at(-1);
    expect(list?.version).toBe(CONTRACT_VERSION);
    expect(list?.documents.map((d) => [d.id, d.kind, d.display, d.reason, d.revision, d.onScreen])).toEqual([
      ["doc-1", "blocks", "a.md", "Read this", 1, true],
      ["doc-2", "html", "p.html", "Read this", 1, true],
    ]);
    for (const document of list?.documents ?? []) {
      expect(Object.keys(document).sort()).toEqual([
        "assets",
        "capability",
        "display",
        "id",
        "kind",
        "onScreen",
        "reason",
        "revision",
      ]);
      expect(JSON.stringify(document)).not.toContain(t.root);
    }
    // The capability serves the Markdown text of a blocks document.
    const capability = list?.documents[0]?.capability as string;
    expect((await http(capability)).body).toContain("```options");
  });

  test("showing a page that is open reloads it instead of opening it again, and a closed tab opens again", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    await t.show.show(t.root, ["a.md"], "r", "page");
    expect(t.opened).toHaveLength(1);
    // No stream ever connected, and the wait for the tab is over: the user closed it.
    t.state.now = PAGE_OPEN_WAIT_MS + 1;
    await t.show.show(t.root, ["a.md"], "r", "page");
    expect(t.opened).toHaveLength(2);
  });

  test("the agent's edit bumps the revision once per real change, and reloads open pages", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    t.show.agentWrote("w", t.path("a.md"));
    expect(lists(t).at(-1)?.documents[0]?.revision).toBe(1);
    writeFileSync(t.path("a.md"), "# A2");
    t.show.agentWrote("w", t.path("a.md"));
    expect(lists(t).at(-1)?.documents[0]?.revision).toBe(2);
    t.show.agentWrote("w", t.path("a.md"));
    expect(
      lists(t)
        .filter((list) => list.documents.length > 0)
        .at(-1)?.documents[0]?.revision,
    ).toBe(2);
    // The page shows the new text.
    expect((await http(t.opened[0] as string)).body).toContain("<h1>A2</h1>");
  });

  test("an open tab reloads when the agent edits the document", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    const url = new URL(t.opened[0] as string);
    const stream = `${url.origin}${url.pathname.replace(/\/files\/.*$/, "")}/events?page=${encodeURIComponent(url.pathname)}`;
    const reloaded = await waitForStream(stream, "event: reload", () => {
      t.show.agentWrote("w", t.path("a.md"));
      writeFileSync(t.path("a.md"), "# A edited");
      t.show.agentWrote("w", t.path("a.md"));
    });
    expect(reloaded).toBe(true);
  });

  test("view page refuses a file it cannot render, and an editor never gets an image or a binary", async () => {
    const t = setup({ files: { "n.txt": "plain", "x.bin": "a\0b", "i.png": "png" } });
    await expect(t.show.show(t.root, ["n.txt"], "r", "page")).rejects.toThrow(/open n\.txt with view "edit"/);
    await expect(t.show.show(t.root, ["x.bin"], "r", "edit")).rejects.toThrow(/cannot show binary files: x\.bin/);
    await expect(t.show.show(t.root, ["missing.md"], "r", "page")).rejects.toThrow(/cannot read/);
    await expect(t.show.show(t.root, ["a\nb.md"], "r", "page")).rejects.toThrow(/line break/);
    // An image opens in the browser whatever the view, and stays off the bus.
    await t.show.show(t.root, ["i.png"], "r");
    expect(t.opened).toHaveLength(1);
    expect(lists(t).at(-1)?.documents ?? []).toEqual([]);
    expect(t.launched).toHaveLength(0);
  });

  test("tells the agent when the browser cannot be opened", async () => {
    const t = setup();
    const failing = createBetterShow(fakePi().pi, {
      ...defaultDeps(),
      openUrl: () => {
        throw new Error("open failed: no browser");
      },
    });
    shows.push(failing);
    await expect(failing.show(t.root, ["a.md"], "r", "page")).rejects.toThrow(/no browser/);
  });
});

describe("answers from the page", () => {
  const post = (t: ReturnType<typeof setup>, body: unknown) => {
    const base = (t.opened[0] as string).replace(/\/files\/.*$/, "");
    return postJson(`${base}/answer`, body);
  };
  const pagePath = (t: ReturnType<typeof setup>) => new URL(t.opened[0] as string).pathname;

  test("an answer reaches the agent as its encoded message: steered while busy, starting a turn when idle", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    const answer = { kind: "pick", title: "Store", fields: [["picked", "One"]], ref: { doc: "a.md", block: 0 } };
    expect((await post(t, { answerId: "1", page: pagePath(t), answer })).body).toBe('{"accepted":true}');
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.message).toEqual({
      customType: "better-show",
      content: 'User picked "One" for "Store".',
      display: true,
    });
    expect(t.sent[0]?.options).toEqual({ triggerTurn: true });
    t.state.idle = false;
    await post(t, { answerId: "2", page: pagePath(t), answer: answerOf([["a", "b"]]) });
    expect(t.sent[1]?.options).toEqual({ deliverAs: "steer" });
    expect(t.sent[1]?.message.content).toBe("User submitted a form in the HTML review pane:\n- a: b");
  });

  test("an answer from an agent's HTML page is labeled as the page's, and a Markdown page's answer is not", async () => {
    const t = setup({ files: { "a.md": "# A", "p.html": "<p>hi</p>" } });
    await t.show.show(t.root, ["a.md", "p.html"], "r", "page");
    const pathOf = (index: number) => new URL(t.opened[index] as string).pathname;
    const base = (t.opened[0] as string).replace(/\/files\/.*$/, "");
    const answer = { kind: "pick", title: "Store", fields: [["picked", "One"]], ref: { doc: "a.md", block: 0 } };
    await postJson(`${base}/answer`, { answerId: "m", page: pathOf(0), answer });
    await postJson(`${base}/answer`, { answerId: "h", page: pathOf(1), answer });
    expect(t.sent[0]?.message.content).toBe('User picked "One" for "Store".');
    expect(t.sent[1]?.message.content).toBe('Agent page p.html sent:\nUser picked "One" for "Store".');
  });

  test("a repeated answer id is delivered once and gets its first result", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    const body = { answerId: "same", page: pagePath(t), answer: answerOf([["a", "b"]]) };
    expect((await post(t, body)).body).toBe('{"accepted":true}');
    expect((await post(t, body)).body).toBe('{"accepted":true}');
    expect(t.sent).toHaveLength(1);
  });

  test("an answer without fields never reaches the agent", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    const reply = await post(t, { answerId: "e", page: pagePath(t), answer: answerOf([]) });
    expect(JSON.parse(reply.body)).toEqual({ accepted: false, reason: "empty" });
    expect(t.sent).toHaveLength(0);
  });

  test("a passage comment is a feedback answer", async () => {
    const t = setup();
    await t.show.show(t.root, ["a.md"], "r", "page");
    await post(t, {
      answerId: "f",
      page: pagePath(t),
      answer: answerOf(
        [
          ["page", "Plan"],
          ["quote", "the cache"],
          ["comment", "say more"],
          ["overall", "ok"],
        ],
        "feedback",
      ),
    });
    expect(t.sent[0]?.message.content).toBe(
      'User feedback on the page "Plan":\n\n> the cache\nsay more\n\nOverall: ok',
    );
  });
});

describe("event bus contract version 2", () => {
  async function shown() {
    const t = setup({ files: { "a.md": "# A", "p.html": "<p>hi</p>", "n.txt": "text" }, installed: ["code"] });
    await t.show.show(t.root, ["a.md", "p.html"], "r", "page");
    await t.show.show(t.root, ["n.txt"], "edit me", "edit");
    return t;
  }
  const send = (t: ReturnType<typeof setup>, payload: unknown) => t.bus.emit(ANSWER_EVENT, payload);
  const valid = { kind: "pick", title: "T", fields: [["picked", "One"]] };

  test("lists documents on every change with the v2 shape, and again on request", async () => {
    const t = await shown();
    const list = lists(t).at(-1);
    expect(list?.documents.map((d) => [d.kind, d.display])).toEqual([
      ["blocks", "a.md"],
      ["html", "p.html"],
      ["text", "n.txt"],
    ]);
    const before = lists(t).length;
    t.bus.emit(DOCUMENTS_REQUEST_EVENT, { version: CONTRACT_VERSION });
    expect(lists(t)).toHaveLength(before + 1);
    expect(lists(t).at(-1)).toEqual(list as never);
    t.bus.emit(DOCUMENTS_REQUEST_EVENT, { version: 1 });
    t.bus.emit(DOCUMENTS_REQUEST_EVENT, null);
    expect(lists(t)).toHaveLength(before + 1);
  });

  test("an answer for a blocks or html document is delivered as an Answer, and the result is sent back", async () => {
    const t = await shown();
    send(t, { version: 2, id: "doc-1", answerId: "x1", answer: valid });
    expect(results(t).at(-1)).toEqual({ version: 2, id: "doc-1", answerId: "x1", accepted: true });
    expect(t.sent.at(-1)?.message.content).toBe('User picked "One" for "T".');
    expect(t.sent.at(-1)?.options).toEqual({ triggerTurn: true });
    send(t, { version: 2, id: "doc-2", answerId: "x2", answer: answerOf([["name", "Ada"]]) });
    expect(results(t).at(-1)).toEqual({ version: 2, id: "doc-2", answerId: "x2", accepted: true });
    expect(t.sent).toHaveLength(2);
  });

  test("replies closed, invalid, or empty, and delivers nothing", async () => {
    const t = await shown();
    const cases: [unknown, string][] = [
      [{ version: 2, id: "nope", answerId: "c1", answer: valid }, "closed"],
      [{ version: 1, id: "doc-1", answerId: "c2", answer: valid }, "invalid"],
      [{ version: 2, id: "doc-1", answerId: "c3", answer: { kind: "bogus", fields: [] } }, "invalid"],
      [{ version: 2, id: "doc-1", answerId: "c4", fields: [["a", "b"]] }, "invalid"],
      [{ version: 2, id: "doc-3", answerId: "c5", answer: valid }, "invalid"],
      [{ version: 2, id: "doc-1", answerId: "c6", answer: answerOf([]) }, "empty"],
    ];
    for (const [payload, reason] of cases) {
      send(t, payload);
      expect(results(t).at(-1)).toMatchObject({ accepted: false, reason });
    }
    expect(t.sent).toHaveLength(0);
    // Without a string id and answerId there is nobody to reply to.
    const count = results(t).length;
    send(t, { version: 2, answerId: "z", answer: valid });
    send(t, { version: 2, id: "doc-1", answer: valid });
    send(t, "text");
    expect(results(t)).toHaveLength(count);
  });

  test("a repeated answerId gets its first result back and delivers nothing again", async () => {
    const t = await shown();
    send(t, { version: 2, id: "doc-1", answerId: "r1", answer: valid });
    send(t, { version: 2, id: "doc-1", answerId: "r1", answer: valid });
    expect(t.sent).toHaveLength(1);
    expect(results(t).slice(-2)).toEqual([
      { version: 2, id: "doc-1", answerId: "r1", accepted: true },
      { version: 2, id: "doc-1", answerId: "r1", accepted: true },
    ]);
    // The same answerId for another document is not a repeat.
    send(t, { version: 2, id: "doc-2", answerId: "r1", answer: valid });
    expect(results(t).at(-1)).toMatchObject({ accepted: false, reason: "invalid" });
    expect(t.sent).toHaveLength(1);
    // A refused answer is remembered too.
    send(t, { version: 2, id: "nope", answerId: "r2", answer: valid });
    send(t, { version: 2, id: "nope", answerId: "r2", answer: valid });
    expect(
      results(t)
        .slice(-2)
        .map((r) => r.reason),
    ).toEqual(["closed", "closed"]);
  });

  test("the session end lists nothing and stops listening", async () => {
    const t = await shown();
    t.show.shutdown();
    expect(lists(t).at(-1)).toEqual({ version: 2, documents: [] });
    expect(t.show.server).toBeUndefined();
  });

  test("the last tab closing takes pages off the screen and withdraws their capability, unless an editor document still lists one", async () => {
    const pages = setup({ files: { "a.md": "# A" }, idleMs: 60 });
    await pages.show.show(pages.root, ["a.md"], "r", "page");
    expect(lists(pages).at(-1)?.documents[0]).toMatchObject({ onScreen: true, capability: expect.any(String) });
    await until(() => pages.show.server === undefined);
    const gone = lists(pages).at(-1)?.documents[0];
    expect(gone).toMatchObject({ id: "doc-1", onScreen: false });
    expect(gone?.capability).toBeUndefined();
    expect(pages.show.server).toBeUndefined();
    // Showing it again starts a new server and opens a new tab.
    await pages.show.show(pages.root, ["a.md"], "r", "page");
    expect(pages.opened).toHaveLength(2);
    expect(lists(pages).at(-1)?.documents[0]).toMatchObject({
      id: "doc-1",
      onScreen: true,
      capability: expect.any(String),
    });

    const both = setup({ files: { "a.md": "# A", "n.txt": "t" }, idleMs: 300, installed: ["code"] });
    await both.show.show(both.root, ["a.md"], "r", "page");
    await both.show.show(both.root, ["n.txt"], "r", "edit");
    await until(() => lists(both).at(-1)?.documents[0]?.onScreen === false);
    const [page, text] = lists(both).at(-1)?.documents ?? [];
    expect(page).toMatchObject({ kind: "blocks", onScreen: false });
    expect(text).toMatchObject({ kind: "text", onScreen: true, capability: expect.any(String) });
    expect(both.show.server).toBeDefined();
  });
});

describe("what the list publishes", () => {
  test("a file outside the working directory is named by its base name, not its path", async () => {
    const t = setup({ files: { "a.md": "# A" } });
    const other = tree({ "outside.md": "# O" });
    await t.show.show(t.root, [join(other, "outside.md")], "r", "page");
    const doc = lists(t).at(-1)?.documents[0];
    expect(doc?.display).toBe("outside.md");
    expect(JSON.stringify(lists(t))).not.toContain(other);
  });

  test("a document off the screen has no capability, while another still keeps the server up", async () => {
    const both = setup({ files: { "a.md": "# A", "n.txt": "t" }, idleMs: 300, installed: ["code"] });
    await both.show.show(both.root, ["a.md"], "r", "page");
    await both.show.show(both.root, ["n.txt"], "r", "edit");
    await until(() => lists(both).at(-1)?.documents[0]?.onScreen === false);
    const [page, text] = lists(both).at(-1)?.documents ?? [];
    expect(page).toMatchObject({ kind: "blocks", onScreen: false });
    expect(page?.capability).toBeUndefined();
    expect(page?.assets).toBeUndefined();
    expect(text?.capability).toEqual(expect.any(String));
  });
});

describe("show_doc edit view", () => {
  const FILES = { "n.md": "one\ntwo\nthree\n" };

  test("opens the user's editor without a terminal pane: PI_BETTER_SHOW_EDITOR, then VS Code, then the system's", async () => {
    const own = setup({ files: FILES, editor: "my-editor --wait=no 'a b'", installed: ["my-editor", "code"] });
    const result = await own.show.show(own.root, ["n.md"], "Edit this", "edit");
    expect(own.launched).toEqual([["my-editor", ["--wait=no", "a b", own.path("n.md")]]]);
    expect(result.text).toContain("Their saved edits will reach you as review feedback");
    expect(own.opened).toHaveLength(0);

    const code = setup({ files: FILES, installed: ["code"] });
    await code.show.show(code.root, ["n.md"], "r");
    expect(code.launched).toEqual([["code", [code.path("n.md")]]]);

    const mac = setup({ files: FILES, installed: ["open"] });
    await mac.show.show(mac.root, ["n.md"], "r");
    expect(mac.ran).toEqual([["open", ["-t", mac.path("n.md")]]]);

    const linux = setup({ files: FILES, installed: ["xdg-open"], platform: "linux" });
    await linux.show.show(linux.root, ["n.md"], "r");
    expect(linux.ran).toEqual([["xdg-open", [linux.path("n.md")]]]);

    const windows = setup({ files: FILES, platform: "win32" });
    await windows.show.show(windows.root, ["n.md"], "r");
    expect(windows.launched).toEqual([[windowsTextEditor(), [windows.path("n.md")]]]);
    expect(windows.ran).toHaveLength(0);
  });

  test("says so when no editor can be opened", async () => {
    const none = setup({ files: FILES });
    await expect(none.show.show(none.root, ["n.md"], "r")).rejects.toThrow(/PI_BETTER_SHOW_EDITOR/);
    const missing = setup({ files: FILES, editor: "nope-editor" });
    await expect(missing.show.show(missing.root, ["n.md"], "r")).rejects.toThrow(/nope-editor is not on PATH/);
  });

  test("saves while idle wait for the next run, which gets one net diff; the user hears of it once", async () => {
    const t = setup({ files: FILES, installed: ["code"] });
    await t.show.show(t.root, ["n.md"], "r");
    expect(lists(t).at(-1)?.documents[0]).toMatchObject({ kind: "text", display: "n.md", onScreen: true });
    t.save("n.md", "one\nT\nthree\n");
    t.save("n.md", "one\nTW\nthree\n");
    t.save("n.md", "one\nTWO\nthree\n");
    t.settle();
    expect(t.sent).toHaveLength(0);
    expect(t.notices).toEqual([["Your edits to n.md go to the agent with your next message.", "info"]]);
    expect(await t.startRun()).toBe("User edited n.md:\n```diff\n@@ -2 +2 @@\n-two\n+TWO\n```");
    // Reported: the next run gets nothing, and saving what the agent already saw sends nothing.
    t.save("n.md", "one\nTWO\nthree\n");
    expect(await t.startRun()).toBeUndefined();
    expect(t.sent).toHaveLength(0);
  });

  test("saves while the agent works are steered in once they settle, as one net diff", async () => {
    const t = setup({ files: FILES, installed: ["code"] });
    await t.show.show(t.root, ["n.md"], "r");
    t.state.idle = false;
    t.save("n.md", "one\ntwo\nthree\nf\n");
    t.save("n.md", "one\ntwo\nthree\nfour\n");
    expect(t.sent).toHaveLength(0);
    // Each save restarts the wait: one timer is due.
    expect(t.timers.size).toBe(1);
    t.settle();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.options).toEqual({ deliverAs: "steer" });
    expect(t.sent[0]?.message.content).toBe("User edited n.md:\n```diff\n@@ -3,0 +4 @@\n+four\n```");
    // A change and its undo before the wait ends send nothing.
    t.save("n.md", "one\ntwo\nthree\nfour\nfive\n");
    t.save("n.md", "one\ntwo\nthree\nfour\n");
    t.settle();
    expect(t.sent).toHaveLength(1);
    expect(t.notices).toEqual([]);
  });

  test("what the agent wrote itself is not the user's edit", async () => {
    const t = setup({ files: FILES, installed: ["code"] });
    await t.show.show(t.root, ["n.md"], "r");
    // The edit tool starts, the file changes, the watcher notices before the tool result arrives.
    t.show.agentWillWrite("e1", t.path("n.md"));
    t.save("n.md", "one\ntwo\nthree\nagent line\n");
    t.show.agentWrote("e1", t.path("n.md"));
    t.save("n.md", "one\ntwo\nthree\nagent line\n");
    expect(await t.startRun()).toBeUndefined();
    // The next user save diffs against the agent's version.
    t.save("n.md", "one\ntwo\nthree\nagent line\nuser line\n");
    const user = await t.startRun();
    expect(user).toContain("+user line");
    expect(user).not.toContain("agent line\n+");
    // A shell command may touch any shown file; its change waits and is labeled as possibly the command's own.
    t.show.agentWillWrite("s1", undefined);
    t.save("n.md", "from the shell\n");
    t.show.agentWrote("s1", undefined);
    expect(await t.startRun()).toContain("changed while a shell command ran");
    t.save("n.md", "from the shell\n");
    expect(await t.startRun()).toBeUndefined();
    expect(t.sent).toHaveLength(0);
  });

  test("a long diff is cut with a count of the lines left out, and the shutdown stops watching", async () => {
    const t = setup({ files: FILES, installed: ["code"] });
    await t.show.show(t.root, ["n.md"], "r");
    t.save("n.md", `${Array.from({ length: 300 }, (_, line) => `line ${line}`).join("\n")}\n`);
    const report = await t.startRun();
    expect(report).toContain("… (truncated: 104 more diff lines; read n.md)");
    t.show.shutdown();
    expect(t.watchers.size).toBe(0);
  });
});

describe("Mini SDD", () => {
  const SPEC = "docs/specs/2026-11-07-x/spec.md";
  const files = {
    [SPEC]: "# Spec\n\nStatus: proposed\n",
    "docs/specs/2026-11-07-x/decision.md": "# D",
    "docs/specs/2026-11-07-x/design.md": "# G",
    "docs/specs/2026-11-07-y/spec.md": "# Spec\n\nStatus: approved\n",
    "docs/specs/2026-11-07-y/design.md": "# G",
  };

  test("a proposed spec brings the folder's phase files in order, a later phase file joins, and other specs do not", async () => {
    const t = setup({ files });
    expect(t.show.miniSddFollowUp(t.path(SPEC)).map((path) => path.split("/").pop())).toEqual([
      "decision.md",
      "spec.md",
      "design.md",
    ]);
    expect(t.show.miniSddFollowUp(t.path("docs/specs/2026-11-07-y/spec.md"))).toEqual([]);
    expect(t.show.miniSddFollowUp(t.path("docs/specs/2026-11-07-y/design.md"))).toEqual([]);
    expect(t.show.miniSddFollowUp(t.path("a.md"))).toEqual([]);
    await t.show.show(t.root, t.show.miniSddFollowUp(t.path(SPEC)), "Spec proposed for approval", "page");
    expect(t.opened).toHaveLength(3);
    // The folder is on screen: a phase file written later joins; one already shown does not repeat.
    writeFileSync(t.path("docs/specs/2026-11-07-x/verification.md"), "# V");
    expect(t.show.miniSddFollowUp(t.path("docs/specs/2026-11-07-x/verification.md"))).toEqual([
      t.path("docs/specs/2026-11-07-x/verification.md"),
    ]);
    expect(t.show.miniSddFollowUp(t.path(SPEC))).toEqual([]);
  });
});
