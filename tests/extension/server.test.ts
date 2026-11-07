import { afterEach, describe, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { createAllowList } from "../../src/extension/files.ts";
import {
  type AnswerPost,
  createPageServer,
  FRAME_POLICY,
  MAX_ANSWER_BYTES,
  PAGE_POLICY,
  type PageServer,
  RAW_POLICY,
} from "../../src/extension/server.ts";
import { http, link, postJson, postRaw, tree, until, waitForStream } from "./helpers.ts";

const servers: PageServer[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A server over a tree whose `doc/` directory holds the shown pages. */
async function setup(
  files: Record<string, string>,
  shown: string[],
  options: { idleMs?: number; onIdle?: () => void; displayOf?: (path: string) => string } = {},
) {
  const root = tree(files);
  const allow = createAllowList();
  for (const page of shown) allow.add(join(root, page));
  const posts: AnswerPost[] = [];
  const docs = new Map<string, string>();
  const server = await createPageServer({
    canServe: allow.canServe,
    pathOfDoc: (id) => docs.get(id),
    onAnswer: (post) => {
      posts.push(post);
      return { accepted: true };
    },
    ...options,
  });
  servers.push(server);
  return { root, server, posts, docs, url: (path: string) => server.urlOf(join(root, path)) };
}

const BLOCKS = [
  "# Plan",
  "",
  "Prose with <b>raw html</b> and <script>alert(1)</script>.",
  "",
  "```form",
  "title: Decide",
  "questions:",
  "  - {name: a, label: A, choices: [x, y]}",
  "```",
  "",
  "```options",
  "- {title: One}",
  "- {title: Two}",
  "```",
  "",
  "```form",
  "questions: nope",
  "```",
  "",
].join("\n");

describe("the page server's security", () => {
  test("every route needs the random token, and the host must be the loopback address", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    expect((await http(t.url("doc/a.md"))).status).toBe(200);
    const tokenless = t.url("doc/a.md").replace(/\/[0-9a-f-]{36}\//, "/");
    expect((await http(tokenless)).status).toBe(404);
    const wrong = t.url("doc/a.md").replace(/\/[0-9a-f-]{36}\//, "/00000000-0000-0000-0000-000000000000/");
    expect((await http(wrong)).status).toBe(404);
    expect((await http(`${t.server.base}/assets/page.css`)).status).toBe(200);
    expect((await http(`${t.server.base}/assets/page.css`, { headers: { host: "evil.example:80" } })).status).toBe(403);
    expect((await http(t.url("doc/a.md"), { headers: { host: "rebind.example" } })).status).toBe(403);
  });

  test("serves only files below a shown page's directory, never a dotfile or a symlink out", async () => {
    const t = await setup(
      {
        "doc/a.md": "# A",
        "doc/sub/x.svg": "<svg/>",
        "doc/.env": "SECRET=1",
        "doc/.git/config": "[core]",
        "doc/sub/.hidden": "h",
        "other/secret.txt": "outside",
        "top.txt": "above",
      },
      ["doc/a.md"],
    );
    link(t.root, "other/secret.txt", "doc/leak.txt");
    link(t.root, "doc/sub/x.svg", "doc/ok.svg");
    expect((await http(t.url("doc/sub/x.svg"))).status).toBe(200);
    expect((await http(t.url("doc/ok.svg"))).status).toBe(200);
    for (const path of [
      "doc/.env",
      "doc/.git/config",
      "doc/sub/.hidden",
      "other/secret.txt",
      "top.txt",
      "doc/leak.txt",
      "doc/missing.txt",
    ]) {
      expect((await http(t.url(path))).status).toBe(404);
    }
    // `..` and an encoded `..` normalise to a path outside the directory.
    const up = t.url("doc/a.md").replace("/doc/a.md", "/doc/%2e%2e/other/secret.txt");
    expect((await http(up)).status).toBe(404);
    const encodedSlash = t.url("doc/a.md").replace("/doc/a.md", "/doc/..%2fother%2fsecret.txt");
    expect((await http(encodedSlash)).status).toBe(404);
    // The frame route holds the same line.
    expect((await http(t.url("doc/.env").replace("/files/", "/frame/"))).status).toBe(404);
    expect((await http(t.url("doc/leak.txt").replace("/files/", "/frame/"))).status).toBe(404);
    expect((await http(t.url("doc/sub/x.svg").replace("/files/", "/frame/"))).status).toBe(200);
  });

  test("a symlinked page serves by its real path", async () => {
    const t = await setup({ "real/a.md": "# A", "real/b.png": "png" }, []);
    symlinkSync(join(t.root, "real"), join(t.root, "alias"));
    const allow = createAllowList();
    allow.add(join(t.root, "real/a.md"));
    const server = await createPageServer({
      canServe: allow.canServe,
      pathOfDoc: () => undefined,
      onAnswer: () => ({ accepted: true }),
    });
    servers.push(server);
    expect((await http(server.urlOf(join(t.root, "alias/a.md")))).status).toBe(200);
    expect((await http(server.urlOf(join(t.root, "alias/b.png")))).status).toBe(200);
  });

  test("every response carries a CSP: pages without inline script, agent pages in a sandbox, files that never run", async () => {
    const t = await setup(
      {
        "doc/a.md": "# A",
        "doc/p.html": "<head></head><p>hi</p>",
        "doc/i.svg": "<svg/>",
        "doc/c.tsx": "export default () => null",
      },
      ["doc/a.md", "doc/p.html", "doc/c.tsx"],
    );
    const md = await http(t.url("doc/a.md"));
    expect(md.headers["content-security-policy"]).toBe(PAGE_POLICY);
    expect(PAGE_POLICY).toContain("script-src 'self'");
    expect(PAGE_POLICY).not.toContain("unsafe-inline");
    const host = await http(t.url("doc/p.html"));
    expect(host.headers["content-security-policy"]).toBe(PAGE_POLICY);
    const frame = await http(t.url("doc/p.html").replace("/files/", "/frame/"));
    expect(frame.headers["content-security-policy"]).toBe(FRAME_POLICY);
    expect(FRAME_POLICY).toMatch(/^sandbox allow-scripts allow-forms;/);
    expect(FRAME_POLICY).not.toContain("allow-same-origin");
    expect(FRAME_POLICY).toContain("default-src 'self' data: blob:");
    const raw = await http(t.url("doc/i.svg"));
    expect(raw.headers["content-security-policy"]).toBe(RAW_POLICY);
    expect(RAW_POLICY).toContain("sandbox");
    expect(raw.headers["x-content-type-options"]).toBe("nosniff");
    const bundle = await http(`${t.url("doc/c.tsx").replace("/files/", "/frame/")}?bundle`);
    expect(bundle.headers["content-security-policy"]).toBe(FRAME_POLICY);
  });

  test("an answer larger than the cap is refused, whether it says so or not", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const big = "x".repeat(MAX_ANSWER_BYTES + 10);
    const declared = await postRaw(`${t.server.base}/answer`, big);
    expect(declared.status).toBe(413);
    expect(t.posts).toHaveLength(0);
    // Without a declared length the server counts what arrives.
    const chunks = Array.from({ length: 12 }, () => "y".repeat(100_000));
    const streamed = await http(`${t.server.base}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(t.server.base).origin },
      chunks,
    }).catch(() => ({ status: 0 }));
    expect([413, 0]).toContain(streamed.status);
    expect(t.posts).toHaveLength(0);
    const small = await postJson(`${t.server.base}/answer`, {
      answerId: "1",
      answer: { kind: "suggest", fields: [["text", "ok"]] },
    });
    expect(small.status).toBe(200);
    expect(t.posts).toHaveLength(1);
  });

  test("the cap counts bytes, not characters", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    // 400,000 characters of three bytes each: under the cap as characters, 1.2 MB as bytes.
    const chunks = Array.from({ length: 4 }, () => "中".repeat(100_000));
    const streamed = await http(`${t.server.base}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(t.server.base).origin },
      chunks,
    }).catch(() => ({ status: 0 }));
    expect([413, 0]).toContain(streamed.status);
    expect(t.posts).toHaveLength(0);
  });

  test("an answer must be JSON of the shape of an Answer", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const answer = `${t.server.base}/answer`;
    expect((await postRaw(answer, "not json")).status).toBe(400);
    expect((await postJson(answer, { answerId: "1", answer: { kind: "nope", fields: [] } })).status).toBe(400);
    expect((await postJson(answer, { answerId: "", answer: { kind: "form", fields: [] } })).status).toBe(400);
    expect((await postJson(answer, { answer: { kind: "form", fields: [] } })).status).toBe(400);
    expect((await postJson(answer, { answerId: "1", answer: { kind: "form", fields: [["a", 1]] } })).status).toBe(400);
    expect((await http(answer)).status).toBe(405);
  });

  test("only the host page's own origin may post an answer or open the event stream, and only as JSON", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const answer = `${t.server.base}/answer`;
    const good = JSON.stringify({ answerId: "1", answer: { kind: "suggest", fields: [["text", "ok"]] } });
    // A sandboxed frame's own POST carries Origin: null and may be a no-cors text/plain request.
    expect((await postRaw(answer, good, { origin: "null" })).status).toBe(403);
    expect((await postRaw(answer, good, { origin: "http://evil.example" })).status).toBe(403);
    expect(
      (await http(answer, { method: "POST", body: good, headers: { "content-type": "application/json" } })).status,
    ).toBe(403);
    expect((await postRaw(answer, good, { "content-type": "text/plain" })).status).toBe(403);
    expect(t.posts).toHaveLength(0);
    expect((await postRaw(answer, good)).status).toBe(200);
    expect(
      (await postRaw(answer, good.replace('"1"', '"2"'), { origin: "", "sec-fetch-site": "same-origin" })).status,
    ).toBe(200);
    const stream = `${t.server.base}/events?page=${encodeURIComponent(new URL(t.url("doc/a.md")).pathname)}`;
    expect((await http(stream)).status).toBe(403);
    expect((await http(stream, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  });

  test("every response, JSON and empty ones too, carries a content security policy", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const replies = [
      await postJson(`${t.server.base}/answer`, { answerId: "1", answer: { kind: "form", fields: [["a", "b"]] } }),
      await postJson(`${t.server.base}/answer`, null),
      await http(`${t.server.base}/answer`),
      await http(`${t.server.base}/files/nowhere`),
    ];
    for (const reply of replies) expect(reply.headers["content-security-policy"]).toBeTruthy();
  });

  test("the server, not the page, names the document an answer is about", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"], { displayOf: () => "doc/a.md" });
    const page = new URL(t.url("doc/a.md")).pathname;
    await postJson(`${t.server.base}/answer`, {
      answerId: "1",
      page,
      answer: { kind: "pick", fields: [["picked", "x"]], ref: { doc: "somewhere/else.md", block: 2 } },
    });
    expect(t.posts[0]?.answer.ref).toEqual({ doc: "doc/a.md", block: 2 });
  });

  test("a body that is not an object gets a 400 and throws nothing", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const uncaught: unknown[] = [];
    const record = (error: unknown) => void uncaught.push(error);
    process.on("uncaughtException", record);
    try {
      for (const value of [null, [], "x", 1]) {
        expect((await postJson(`${t.server.base}/answer`, value)).status).toBe(400);
      }
      await new Promise((done) => setTimeout(done, 20));
    } finally {
      process.off("uncaughtException", record);
    }
    expect(uncaught).toEqual([]);
    expect((await http(t.url("doc/a.md"), { method: "POST" })).status).toBe(405);
    expect(t.posts).toHaveLength(0);
  });
});

describe("a Markdown page", () => {
  test("renders prose with raw HTML kept as text, and blocks as elements that carry their data", async () => {
    const t = await setup({ "doc/a.md": BLOCKS }, ["doc/a.md"]);
    const page = await http(t.url("doc/a.md"));
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(page.body).toContain("<title>Plan</title>");
    expect(page.body).toContain("&lt;b&gt;raw html&lt;/b&gt;");
    expect(page.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page.body).not.toMatch(/<script>alert/);
    expect(page.body).not.toContain("<b>raw html");
    const form = /<pbs-form data-json="([^"]*)" doc="a\.md" block="0">/.exec(page.body);
    expect(form).not.toBeNull();
    const data = JSON.parse((form?.[1] ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    expect(data.title).toBe("Decide");
    expect(page.body).toContain('doc="a.md" block="1"></pbs-options>');
    // No inline script or style, and the page's scripts are same-origin files.
    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(page.body).not.toMatch(/\sstyle=/);
    expect(page.body).toMatch(/<script src="\/[0-9a-f-]{36}\/assets\/page\.js"><\/script>/);
  });

  test("a block that cannot be drawn shows why and its source, escaped", async () => {
    const t = await setup({ "doc/a.md": BLOCKS }, ["doc/a.md"]);
    const page = await http(t.url("doc/a.md"));
    expect(page.body).toContain("This form block could not be drawn");
    expect(page.body).toContain('<pre class="pbs-invalid"><code>questions: nope</code></pre>');
  });

  test("a link opens in a new tab with no opener, and an unsafe link is not a link", async () => {
    const t = await setup({ "doc/a.md": "[ok](https://example.com) [bad](javascript:alert(1))" }, ["doc/a.md"]);
    const page = await http(t.url("doc/a.md"));
    expect(page.body).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(page.body).not.toContain('href="javascript:');
  });

  test("a pick that was sent shows as sent after the page reloads", async () => {
    const t = await setup({ "doc/a.md": BLOCKS }, ["doc/a.md"]);
    const path = join(t.root, "doc/a.md");
    const reply = await postJson(`${t.server.base}/answer`, {
      answerId: "p1",
      page: new URL(t.url("doc/a.md")).pathname,
      answer: { kind: "pick", fields: [["picked", "One"]], ref: { doc: "a.md", block: 1 } },
    });
    expect(reply.status).toBe(200);
    expect(t.posts[0]?.page).toBe(path);
    const page = await http(t.url("doc/a.md"));
    expect(page.body).toContain('block="1" data-answered="[[&quot;picked&quot;,&quot;One&quot;]]"');
    // A form stays editable: it is not replayed.
    expect(page.body).not.toMatch(/<pbs-form[^>]*data-answered/);
  });

  test("a diagram is drawn on the server, themed, and only from a bounded source", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const diagram = (source: string, scheme = "dark") =>
      http(`${t.server.base}/diagram.svg?scheme=${scheme}&source=${encodeURIComponent(source)}`);
    const dark = await diagram("graph TD\n A-->B");
    expect(dark.status).toBe(200);
    expect(dark.headers["content-type"]).toBe("image/svg+xml");
    expect(dark.body).toContain("--bg:#18181B");
    expect(dark.headers["content-security-policy"]).toContain("sandbox");
    expect((await diagram("graph TD\n A-->B", "light")).body).toContain("--bg:#FFFFFF");
    expect((await diagram("this is not a diagram")).status).toBe(422);
    expect((await diagram("")).status).toBe(400);
    expect((await diagram("x".repeat(7000))).status).toBe(400);
  });
});

describe("agent HTML and TSX pages", () => {
  test("a page opens inside a frame that is sandboxed without allow-same-origin", async () => {
    const t = await setup({ "doc/p.html": "<p>hi</p>", "doc/c.tsx": "export default () => null" }, [
      "doc/p.html",
      "doc/c.tsx",
    ]);
    for (const name of ["p.html", "c.tsx"]) {
      const page = await http(t.url(`doc/${name}`));
      const iframe = /<iframe [^>]*>/.exec(page.body)?.[0] ?? "";
      expect(iframe).toContain('sandbox="allow-scripts allow-forms"');
      expect(iframe).not.toContain("allow-same-origin");
      expect(iframe).toContain(`src="/${new URL(t.server.base).pathname.slice(1)}/frame${join(t.root, "doc", name)}"`);
      expect(page.body).toMatch(/<script src="[^"]*\/assets\/host\.js">/);
    }
  });

  test("the frame gets the answer hook ahead of the page's own scripts", async () => {
    const t = await setup(
      {
        "doc/p.html": "<!doctype html><html><head><title>x</title></head><body><script>run()</script></body></html>",
        "doc/bare.html": "<p>no head</p>",
      },
      ["doc/p.html", "doc/bare.html"],
    );
    const frame = await http(t.url("doc/p.html").replace("/files/", "/frame/"));
    const hook = frame.body.indexOf("/assets/frame.js");
    expect(hook).toBeGreaterThan(0);
    expect(hook).toBeLessThan(frame.body.indexOf("run()"));
    expect(frame.body.indexOf("<head>")).toBeLessThan(hook);
    const bare = await http(t.url("doc/bare.html").replace("/files/", "/frame/"));
    expect(bare.body.startsWith('<script src="')).toBe(true);
  });

  test("a TSX page is built with React and the pi-kit module, and a build error shows on the page", async () => {
    const good = [
      'import { PbsForm, send } from "pi-kit";',
      'import { useState } from "react";',
      "export default function Page() {",
      "  const [n] = useState(41);",
      '  return <PbsForm data={{ questions: [] }} onAnswer={(answer) => void send(answer)} id={"n" + (n + 1)} />;',
      "}",
    ].join("\n");
    const t = await setup({ "doc/c.tsx": good, "doc/bad.tsx": "export default function (" }, [
      "doc/c.tsx",
      "doc/bad.tsx",
    ]);
    const shell = await http(t.url("doc/c.tsx").replace("/files/", "/frame/"));
    expect(shell.body).toContain('<script src="?bundle"></script>');
    expect(shell.body).toContain("/assets/frame.js");
    const bundle = await http(`${t.url("doc/c.tsx").replace("/files/", "/frame/")}?bundle`);
    expect(bundle.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(bundle.body).toContain("pbs-form");
    expect(
      bundle.body.startsWith("(()=>{") || bundle.body.startsWith('"use strict"') || bundle.body.startsWith("("),
    ).toBe(true);
    expect(bundle.body).not.toMatch(/^\s*(import|export)\s/m);
    const bad = await http(`${t.url("doc/bad.tsx").replace("/files/", "/frame/")}?bundle`);
    expect(bad.body).toContain("This page could not be built");
  });
});

describe("TSX bundles read only what the page may read", () => {
  const bundleOf = async (files: Record<string, string>, page = "doc/c.tsx") => {
    const t = await setup(files, [page]);
    const reply = await http(`${t.url(page).replace("/files/", "/frame/")}?bundle`);
    return { t, body: reply.body };
  };

  test("a ../ import, a dot-directory import, and an absolute import each fail the build", async () => {
    const secret = "SECRET-TOKEN-1234";
    const one = await bundleOf({
      "doc/c.tsx": 'import s from "../secret.json"; export default () => <p>{s.token}</p>;',
      "secret.json": JSON.stringify({ token: secret }),
    });
    expect(one.body).toContain("This page could not be built");
    expect(one.body).not.toContain(secret);
    const two = await bundleOf({
      "doc/c.tsx": 'import s from "./.keys/auth.json"; export default () => <p>{s.token}</p>;',
      "doc/.keys/auth.json": JSON.stringify({ token: secret }),
    });
    expect(two.body).toContain("This page could not be built");
    expect(two.body).not.toContain(secret);
    const dir = tree({ "secret.txt": secret });
    const three = await bundleOf({
      "doc/c.tsx": `import s from ${JSON.stringify(join(dir, "secret.txt"))}; export default () => <p>{s}</p>;`,
    });
    expect(three.body).toContain("This page could not be built");
    expect(three.body).not.toContain(secret);
  });

  test("a name the page may import cannot climb out of its package with ..", async () => {
    const secret = "SECRET-TOKEN-5678";
    const dir = tree({ "auth.json": JSON.stringify({ token: secret }) });
    for (const name of ["pi-kit", "react", "react-dom"]) {
      const climb = `${name}/${"../".repeat(24)}${join(dir, "auth.json").slice(1)}`;
      const out = await bundleOf({
        "doc/c.tsx": `import s from ${JSON.stringify(climb)}; export default () => <p>{s.token}</p>;`,
      });
      expect(out.body, name).not.toContain(secret);
    }
  });

  test("a sibling module and a json file below the page's folder still build", async () => {
    const ok = await bundleOf({
      "doc/c.tsx":
        'import { word } from "./util.ts"; import data from "./data.json"; export default () => <p>{word + data.n}</p>;',
      "doc/util.ts": 'export const word = "SIBLING-OK";',
      "doc/data.json": '{"n":"JSON-OK"}',
    });
    expect(ok.body).not.toContain("This page could not be built");
    expect(ok.body).toContain("SIBLING-OK");
    expect(ok.body).toContain("JSON-OK");
  });
});

describe("assets, events, and capabilities", () => {
  test("serves the page scripts and stylesheet, and builds each script once", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    for (const [name, type] of [
      ["page.js", "text/javascript"],
      ["host.js", "text/javascript"],
      ["frame.js", "text/javascript"],
      ["page.css", "text/css"],
    ] as const) {
      const reply = await http(`${t.server.base}/assets/${name}`);
      expect(reply.status).toBe(200);
      expect(reply.headers["content-type"]).toContain(type);
    }
    expect((await http(`${t.server.base}/assets/nope.js`)).status).toBe(404);
    expect((await http(`${t.server.base}/assets/..%2fserver.ts`)).status).toBe(404);
  });

  test("the page holds an event stream, and a reload reaches it", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const path = join(t.root, "doc/a.md");
    const pagePath = new URL(t.url("doc/a.md")).pathname;
    expect(t.server.isOpen(path)).toBe(false);
    const got = await waitForStream(
      `${t.server.base}/events?page=${encodeURIComponent(pagePath)}`,
      "event: reload",
      () => {
        expect(t.server.isOpen(path)).toBe(true);
        t.server.reload(path);
      },
    );
    expect(got).toBe(true);
    expect(
      (await http(`${t.server.base}/events?page=/nowhere`, { headers: { "sec-fetch-site": "same-origin" } })).status,
    ).toBe(400);
  });

  test("goes idle once the last page's stream closes, and a server nobody reaches goes idle too", async () => {
    let idle = 0;
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"], { idleMs: 80, onIdle: () => idle++ });
    await until(() => idle === 1);
    const again = await setup({ "doc/a.md": "# A" }, ["doc/a.md"], { idleMs: 150, onIdle: () => idle++ });
    const pagePath = new URL(again.url("doc/a.md")).pathname;
    await waitForStream(`${again.server.base}/events?page=${encodeURIComponent(pagePath)}`, ": open", () => {});
    // The stream closed; the wait starts again.
    await until(() => idle === 2);
    expect(idle).toBe(2);
    expect(t.server.base).not.toBe(again.server.base);
  });

  test("a framed prototype that changed reloads the page that framed it", async () => {
    const t = await setup({ "doc/a.md": "# A", "doc/proto.html": "<p>v1</p>" }, ["doc/a.md"]);
    const proto = t.url("doc/proto.html").replace("/files/", "/frame/");
    const pagePath = new URL(t.url("doc/a.md")).pathname;
    await http(proto, { headers: { referer: `http://127.0.0.1${pagePath}` } });
    const got = await waitForStream(
      `${t.server.base}/events?page=${encodeURIComponent(pagePath)}`,
      "event: reload",
      () => {
        t.server.refreshFrames();
        const file = join(t.root, "doc/proto.html");
        Bun.write(file, "<p>v2 longer</p>").then(() => {
          const future = new Date(Date.now() + 5000);
          require("node:fs").utimesSync(file, future, future);
          t.server.refreshFrames();
        });
      },
    );
    expect(got).toBe(true);
  });

  test("a capability names a document by id and never by path", async () => {
    const t = await setup(
      {
        "doc/a.md": "# A\n\n```form\nquestions: []\n```",
        "doc/p.html": "<p>hi</p>",
        "doc/pic.svg": "<svg/>",
        "doc/.env": "S=1",
      },
      ["doc/a.md", "doc/p.html"],
    );
    t.docs.set("id-md", join(t.root, "doc/a.md"));
    t.docs.set("id-html", join(t.root, "doc/p.html"));
    const capability = t.server.capabilityOf("id-md", join(t.root, "doc/a.md"));
    expect(capability).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]{36}\/doc\/id-md\/a\.md$/);
    expect(capability).not.toContain(t.root);
    const text = await http(capability);
    expect(text.status).toBe(200);
    expect(text.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(text.body).toContain("```form");
    expect(t.server.assetsOf("id-md")).toBe(`${t.server.base}/doc/id-md/`);
    expect((await http(`${t.server.assetsOf("id-md")}pic.svg`)).status).toBe(200);
    const html = await http(t.server.capabilityOf("id-html", join(t.root, "doc/p.html")));
    expect(html.headers["content-security-policy"]).toBe(FRAME_POLICY);
    expect(html.body).toContain("/assets/frame.js");
    for (const bad of [
      "doc/id-md/.env",
      "doc/nope/a.md",
      "doc/id-md/",
      "doc/id-md/..%2f..%2fother",
      "doc/id-md/%2e%2e/a.md",
    ]) {
      expect((await http(`${t.server.base}/${bad}`)).status).toBe(404);
    }
  });

  test("close stops the server and its streams", async () => {
    const t = await setup({ "doc/a.md": "# A" }, ["doc/a.md"]);
    const base = t.server.base;
    t.server.close();
    await expect(http(`${base}/assets/page.css`)).rejects.toBeDefined();
  });
});
