import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { escapeHtml } from "./render.ts";

/**
 * TSX and JSX pages: a file whose default export is a React component. The page server answers its path with a
 * shell, and the shell loads `?bundle`, which esbuild builds from the file with this package's React and the
 * `pi-kit` module (client/kit.tsx). The bundle is a classic script (not a module), since the page runs in a
 * sandboxed frame whose opaque origin could not load a module without CORS. A build or render error shows on the page.
 */

const require = createRequire(import.meta.url);
/** The node_modules holding the React this package ships (under its own names, so a host's React is never touched). */
const REACT_MODULES = dirname(dirname(require.resolve("pbs-page-react/package.json")));
const PI_KIT = fileURLToPath(new URL("./client/kit.tsx", import.meta.url));

/** The package's own sources and React: what a page imports by name, and what those import in turn. */
const PACKAGE_SRC = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const TRUSTED_ROOTS = [PACKAGE_SRC, realpathSync(REACT_MODULES)];
/** The names a page may import that live outside its folder. */
const ALLOWED_BARE = /^(pi-kit|react|react-dom)(\/|$)/;
/** What a bundle may load from disk. `.json` is read only after the path check; `.css` is emptied. */
const LOADED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".css"]);

const within = (root: string, path: string): boolean => {
  const inside = relative(root, path);
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
};
const real = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * A page is untrusted: esbuild would inline any file its imports reach (`../../.pi/agent/auth.json`). Besides the
 * names above, an import must land on a real path that the server would serve for this page, with no dot part.
 */
function confine(page: string, canServe: (path: string) => boolean): Plugin {
  const folder = real(dirname(page));
  const mayRead = (path: string): boolean =>
    within(folder, path) &&
    relative(folder, path)
      .split(sep)
      .every((part) => !part.startsWith(".")) &&
    canServe(path);
  const trusted = (path: string): boolean => TRUSTED_ROOTS.some((root) => path === root || within(root, path));
  return {
    name: "pbs-confine",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === "pbs") return undefined;
        const found = await build.resolve(args.path, {
          kind: args.kind,
          importer: args.importer,
          resolveDir: args.resolveDir,
          namespace: args.namespace,
          pluginData: "pbs",
        });
        if (found.errors.length > 0) return { errors: found.errors };
        if (found.external) return found;
        const path = real(found.path);
        const importer = args.importer ? real(args.importer) : "";
        // A name counts only where it lands: `pi-kit/../../x` resolves outside the package and is refused.
        const allowed =
          (ALLOWED_BARE.test(args.path) && trusted(path)) || (importer !== "" && trusted(importer)) || mayRead(path);
        if (!allowed) {
          return { errors: [{ text: `cannot import ${args.path}: a page may read only files below its own folder` }] };
        }
        return { path: found.path, namespace: found.namespace, sideEffects: found.sideEffects };
      });
      build.onLoad({ filter: /.*/, namespace: "file" }, (args) => {
        if (LOADED_EXTENSIONS.has(extname(args.path).toLowerCase())) return undefined;
        return {
          errors: [{ text: `cannot bundle ${basename(args.path)}: only script, JSON, and CSS files are bundled` }],
        };
      });
    },
  };
}

/** The page a React file is served as; the frame hook loads before the bundle, which loads from the same URL with `?bundle`. */
export function reactShell(path: string, prefix: string, source: string): string {
  const lang = /[\u3400-\u9fff]/.test(source) ? ' lang="zh-Hant"' : "";
  return [
    "<!doctype html>",
    `<html${lang}>`,
    '<meta charset="utf-8">',
    `<script src="${prefix}/assets/frame.js"></script>`,
    `<title>${escapeHtml(basename(path))}</title>`,
    '<body><div id="pbs-root"></div>',
    '<script src="?bundle"></script>',
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

const entry = (path: string): string => `
import { Component, createElement } from "react";
import { createRoot } from "react-dom/client";
import Page from ${JSON.stringify(path)};

class Boundary extends Component {
  state = { error: undefined };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return createElement("pre", { style: { color: "#b00020", whiteSpace: "pre-wrap" } }, "This page failed to render\\n" + String(this.state.error.stack ?? this.state.error));
  }
}

if (typeof Page !== "function") throw new Error(${JSON.stringify(`${basename(path)} must export a React component as its default export`)});
createRoot(document.getElementById("pbs-root")).render(createElement(Boundary, null, createElement(Page)));
`;

const failure = (message: string): string => `
const pre = document.createElement("pre");
pre.setAttribute("style", "color:#b00020;white-space:pre-wrap");
pre.textContent = ${JSON.stringify(`This page could not be built\n${message}`)};
document.getElementById("pbs-root").replaceChildren(pre);
`;

/** Builds the page's bundle on each load, so an edit shows on the next reload. */
export async function bundleReactPage(path: string, canServe: (path: string) => boolean): Promise<string> {
  try {
    const result = await build({
      stdin: { contents: entry(path), resolveDir: dirname(path), loader: "jsx", sourcefile: "pbs-page-entry.jsx" },
      absWorkingDir: dirname(path),
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      nodePaths: [REACT_MODULES],
      plugins: [confine(path, canServe)],
      alias: {
        "pi-kit": PI_KIT,
        react: "pbs-page-react",
        "react-dom": "pbs-page-react-dom",
      },
      define: { "process.env.NODE_ENV": '"production"' },
      loader: { ".css": "empty" },
      logLevel: "silent",
    });
    return result.outputFiles[0]?.text ?? failure("esbuild produced no output");
  } catch (error) {
    const errors = (
      error as { errors?: { text: string; location?: { file: string; line: number; column: number } | null }[] }
    ).errors;
    const message = errors?.length
      ? errors
          .map(({ text, location }) =>
            location ? `${location.file}:${location.line}:${location.column}: ${text}` : text,
          )
          .join("\n")
      : String((error as Error).message ?? error);
    return `${failure(message)}`;
  }
}
