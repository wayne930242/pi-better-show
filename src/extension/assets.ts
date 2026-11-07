import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** The scripts and stylesheet the page server hands to pages, by the name they are served under `<base>/assets/`. */
const CLIENT = fileURLToPath(new URL("./client/", import.meta.url));

const SCRIPT_SOURCES: Record<string, string> = {
  "page.js": "page.ts",
  "host.js": "host.ts",
  "frame.js": "frame.ts",
};

const built = new Map<string, Promise<string>>();

/** The names `<base>/assets/` serves. */
export const ASSET_NAMES = [...Object.keys(SCRIPT_SOURCES), "page.css"];

/** Builds a client script once per process. A script is a classic bundle: it loads in sandboxed frames and under `script-src 'self'`. */
function script(name: string, source: string): Promise<string> {
  let bundle = built.get(name);
  if (!bundle) {
    bundle = build({
      entryPoints: [`${CLIENT}${source}`],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: true,
      logLevel: "silent",
    }).then((result) => result.outputFiles[0]?.text ?? "");
    built.set(name, bundle);
    // A failed build is tried again on the next request rather than remembered.
    bundle.catch(() => built.delete(name));
  }
  return bundle;
}

export async function asset(name: string): Promise<{ type: string; body: string } | undefined> {
  if (name === "page.css") {
    return { type: "text/css; charset=utf-8", body: readFileSync(`${CLIENT}page.css`, "utf8") };
  }
  const source = SCRIPT_SOURCES[name];
  return source ? { type: "text/javascript; charset=utf-8", body: await script(name, source) } : undefined;
}
