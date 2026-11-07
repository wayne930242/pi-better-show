import { join } from "node:path";
import { mermaidSvg } from "../src/server/index.ts";

/** A dev server for examples/elements.html. Loopback only; the page runs under `default-src 'self'`, so the elements prove they need no inline style. */

const here = import.meta.dir;
const port = Number(process.env.PORT ?? 4177);
const csp = "default-src 'self'; img-src 'self'; frame-src 'self'";

const file = (path: string, type: string) =>
  new Response(Bun.file(join(here, path)), { headers: { "content-type": type, "content-security-policy": csp } });

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/":
        return file("elements.html", "text/html; charset=utf-8");
      case "/demo.css":
        return file("demo.css", "text/css; charset=utf-8");
      case "/blocks.md":
        return file("blocks.md", "text/markdown; charset=utf-8");
      case "/proto.css":
        return file("proto.css", "text/css; charset=utf-8");
      case "/pages/proto.html":
        return file("proto.html", "text/html; charset=utf-8");
      case "/demo.js": {
        const build = await Bun.build({ entrypoints: [join(here, "demo.ts")], target: "browser", minify: false });
        if (!build.success) return new Response(build.logs.join("\n"), { status: 500 });
        return new Response(await (build.outputs[0] as Blob).text(), {
          headers: { "content-type": "text/javascript; charset=utf-8", "content-security-policy": csp },
        });
      }
      case "/diagram.svg": {
        const scheme = url.searchParams.get("scheme") === "dark" ? "dark" : "light";
        try {
          const svg = mermaidSvg(url.searchParams.get("source") ?? "", { scheme, transparent: true });
          return new Response(svg, {
            headers: {
              "content-type": "image/svg+xml",
              "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
            },
          });
        } catch (error) {
          return new Response(String(error), { status: 422 });
        }
      }
    }
    const image = /^\/img\/([\w.-]+\.svg)$/.exec(url.pathname);
    if (image) return file(`assets/${image[1]}`, "image/svg+xml");
    return new Response("not found", { status: 404 });
  },
});

console.log(`pi-better-show demo on http://127.0.0.1:${server.port}/ (pid ${process.pid})`);
