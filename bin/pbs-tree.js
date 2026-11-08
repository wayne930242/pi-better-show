#!/usr/bin/env node
// pbs-tree: prints a folder as a ```tree block for pi-better-show. Flags follow Linux `tree` where they exist.
// Plain JavaScript on node built-ins only: it runs from node_modules, where node does not strip types, under node and bun.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

// The limits of the tree block (TREE_LIMITS in src/core/types.ts; a test keeps the two in step).
const MAX_NODES = 2000;
const MAX_DEPTH = 32;

const USAGE = `Usage: pbs-tree [options] [dir]

Prints dir (default .) as a \`\`\`tree block, sorted by name in byte order.

  -L n                  list n levels
  -d                    folders only
  -a                    include dot files (.git is always skipped)
  -I pattern            leave out names matching the glob (* ? [..]); | separates several; repeatable
  -P pattern            list only files matching the glob; folders are kept when they hold a match
  --gitignore           honour .gitignore files
  --dirsfirst           folders before files
  --filelimit n         do not open a folder holding more than n entries; write "… N more" instead
  --prune               leave out folders that hold nothing
  --changed-since rev   tag files new, changed or removed since rev (git diff --name-status rev; removed files are listed)
  -h, --help            this text
`;

class Usage extends Error {}
class Failure extends Error {}

/** @param {string} message */
const usage = (message) => new Usage(message);

function options(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        L: { type: "string", short: "L" },
        d: { type: "boolean", short: "d" },
        a: { type: "boolean", short: "a" },
        I: { type: "string", short: "I", multiple: true },
        P: { type: "string", short: "P", multiple: true },
        gitignore: { type: "boolean" },
        dirsfirst: { type: "boolean" },
        filelimit: { type: "string" },
        prune: { type: "boolean" },
        "changed-since": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw usage(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { help: true };
  if (positionals.length > 1) throw usage(`one folder at most, got ${positionals.length}`);
  const count = (name, text, least) => {
    if (text === undefined) return undefined;
    if (!/^\d+$/.test(text) || Number(text) < least)
      throw usage(`${name} needs a whole number of at least ${least}, got "${text}"`);
    return Number(text);
  };
  const since = values["changed-since"];
  if (since !== undefined && (since === "" || since.startsWith("-")))
    throw usage(`--changed-since needs a revision, got "${since}"`);
  return {
    help: false,
    dir: positionals[0] ?? ".",
    depth: count("-L", values.L, 1),
    dirsOnly: values.d === true,
    dotFiles: values.a === true,
    exclude: (values.I ?? []).flatMap(globs),
    include: (values.P ?? []).flatMap(globs),
    gitignore: values.gitignore === true,
    dirsFirst: values.dirsfirst === true,
    fileLimit: count("--filelimit", values.filelimit, 1),
    prune: values.prune === true,
    since,
  };
}

// ---- globs ---------------------------------------------------------------------------------------------------

/** A bracket expression at `glob[at]` (`[abc]`, `[a-z]`, `[!abc]`) as a regex class and the index after it; undefined when it is not closed. */
function bracket(glob, at) {
  const end = glob.indexOf("]", at + 2);
  if (end < 0) return undefined;
  let set = glob.slice(at + 1, end);
  const negate = set.startsWith("!") || set.startsWith("^");
  if (negate) set = set.slice(1);
  return { source: `[${negate ? "^" : ""}${set.replace(/[\\\]^]/g, "\\$&")}]`, end };
}
const literal = (char) => char.replace(/[\\^$.|+(){}[\]*?/]/g, "\\$&");

/** A shell glob (`*`, `?`, `[..]`, `[!..]`) as a regex over a whole name. */
function globRegex(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else if (char === "[") {
      const set = bracket(glob, i);
      if (set) {
        source += set.source;
        i = set.end;
      } else source += "\\[";
    } else source += literal(char);
  }
  return new RegExp(`^${source}$`, "s");
}
/** `a|b` as two regexes. */
const globs = (list) => list.split("|").filter(Boolean).map(globRegex);
const matches = (list, name) => list.some((regex) => regex.test(name));

// ---- .gitignore ------------------------------------------------------------------------------------------------

/** A gitignore pattern's glob as a regex over a `/`-separated path (`*` and `?` stop at `/`, `**` does not). */
function ignoreRegex(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const whole = (i === 0 || glob[i - 1] === "/") && (glob[i + 2] === "/" || glob[i + 2] === undefined);
      if (whole && glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += whole ? ".*" : "[^/]*";
        i += 1;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "[") {
      const set = bracket(glob, i);
      if (set) {
        source += set.source;
        i = set.end;
      } else source += "\\[";
    } else if (char === "\\" && i + 1 < glob.length) {
      i++;
      source += literal(glob[i] ?? "");
    } else source += literal(char);
  }
  return new RegExp(`^${source}$`, "s");
}

/** The rules of one .gitignore file. */
function ignoreRules(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/(?<!\\)[ \t]+$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    if (line === "") continue;
    // A pattern with a slash inside it (or in front) is relative to the .gitignore's folder; the others match a name at any depth.
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    rules.push({ negate, dirOnly, anchored, regex: ignoreRegex(line) });
  }
  return rules;
}

/** Whether the .gitignore files in `files` (outermost first) ignore `path`; the last rule that matches decides. */
function ignored(files, path, isDir) {
  let verdict = false;
  for (const file of files) {
    if (!path.startsWith(file.base + sep)) continue;
    const relative = path
      .slice(file.base.length + 1)
      .split(sep)
      .join("/");
    const name = relative.slice(relative.lastIndexOf("/") + 1);
    for (const rule of file.rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(rule.anchored ? relative : name)) verdict = !rule.negate;
    }
  }
  return verdict;
}

/** The .gitignore files from the repository's top (the first folder above with a .git) down to `dir`. */
function ancestorIgnores(dir) {
  const chain = [];
  for (let at = dir; ; at = dirname(at)) {
    chain.unshift(at);
    if (existsSync(join(at, ".git")) || dirname(at) === at) break;
  }
  // Without a repository above, only the folder itself counts.
  if (!existsSync(join(chain[0], ".git"))) return ignoreFiles([dir]);
  return ignoreFiles(chain);
}
function ignoreFiles(folders) {
  const files = [];
  for (const base of folders) files.push(...ignoreFile(base));
  return files;
}
function ignoreFile(base) {
  try {
    return [{ base, rules: ignoreRules(readFileSync(join(base, ".gitignore"), "utf8")) }];
  } catch {
    return [];
  }
}

// ---- git ---------------------------------------------------------------------------------------------------------

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1 << 28,
    });
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim() : String(error);
    throw new Failure(`git ${args[0]} failed: ${detail}`);
  }
}

/** `path -> "new" | "changed" | "removed"` for the working tree against `rev`; untracked files count as new. */
function changes(dir, rev) {
  const status = new Map();
  const diff = git(dir, ["diff", "--name-status", "--no-renames", "-z", "--relative", rev, "--"]).split("\0");
  for (let i = 0; i + 1 < diff.length; i += 2) {
    const letter = (diff[i] ?? "")[0];
    const path = diff[i + 1];
    if (!path) continue;
    status.set(path, letter === "A" || letter === "C" ? "new" : letter === "D" ? "removed" : "changed");
  }
  for (const path of git(dir, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")) {
    if (path && !status.has(path)) status.set(path, "new");
  }
  return status;
}

/** The removed files as a trie, so a folder listing can add the names the disk no longer has. */
function removedTrie(status) {
  const root = { children: new Map(), file: false };
  for (const [path, tag] of status) {
    if (tag !== "removed") continue;
    let at = root;
    for (const part of path.split("/")) {
      const next = at.children.get(part) ?? { children: new Map(), file: false };
      at.children.set(part, next);
      at = next;
    }
    at.file = true;
  }
  return root;
}

// ---- the walk -------------------------------------------------------------------------------------------------------

const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

function snapshot(settings) {
  const root = resolve(settings.dir);
  let stat;
  try {
    stat = statSync(root);
  } catch {
    throw new Failure(`${settings.dir}: no such folder`);
  }
  if (!stat.isDirectory()) throw new Failure(`${settings.dir}: not a folder`);

  const status = settings.since === undefined ? new Map() : changes(root, settings.since);
  const removed = settings.since === undefined || settings.dirsOnly ? undefined : removedTrie(status);
  const outer = settings.gitignore ? ancestorIgnores(root) : [];
  // What -L hides still decides whether a folder is empty or holds a match.
  const needsAll = settings.prune || settings.include.length > 0;
  const filtering = !settings.dirsOnly;
  const pruning = filtering && (settings.prune || settings.include.length > 0);

  /** The entries of a folder that survive -a, -I, .gitignore, and -d, in listing order. */
  function entries(abs, parts, trie, files) {
    const found = new Map();
    if (abs !== undefined) {
      let listing = [];
      try {
        listing = readdirSync(abs, { withFileTypes: true });
      } catch (error) {
        process.stderr.write(`pbs-tree: cannot read ${abs}: ${error instanceof Error ? error.message : error}\n`);
      }
      for (const entry of listing)
        found.set(entry.name, { name: entry.name, dir: entry.isDirectory(), virtual: false });
    }
    if (trie) {
      for (const [name, child] of trie.children) {
        if (!found.has(name)) found.set(name, { name, dir: !child.file, virtual: true });
      }
    }
    const kept = [...found.values()].filter((entry) => {
      if (entry.name === ".git") return false;
      if (!settings.dotFiles && entry.name.startsWith(".")) return false;
      if (matches(settings.exclude, entry.name)) return false;
      if (settings.dirsOnly && !entry.dir) return false;
      // A removed path has no file to look at, but its name still meets the same rules.
      const where = join(abs ?? join(root, ...parts), entry.name);
      if (files.length > 0 && ignored(files, where, entry.dir)) return false;
      return true;
    });
    kept.sort((a, b) => (settings.dirsFirst && a.dir !== b.dir ? (a.dir ? -1 : 1) : compare(a.name, b.name)));
    return kept;
  }

  /**
   * The nodes of a folder and whether it holds anything that survives -P and --prune.
   * `emit` is false below the -L cut: nothing is returned, but `holds` is still worked out.
   */
  function walk(abs, parts, trie, level, emit, files) {
    const list = entries(abs, parts, trie, files);
    if (settings.fileLimit !== undefined && list.length > settings.fileLimit) {
      return {
        nodes: emit ? [{ name: `… ${list.length} more`, dir: false, tags: [], children: [], more: list.length }] : [],
        holds: true,
      };
    }
    const nodes = [];
    let holds = false;
    for (const entry of list) {
      const path = [...parts, entry.name];
      if (!entry.dir) {
        if (filtering && settings.include.length > 0 && !matches(settings.include, entry.name)) continue;
        holds = true;
        if (emit) {
          const tag = status.get(path.join("/"));
          nodes.push({
            name: entry.name,
            dir: false,
            tags: entry.virtual ? ["removed"] : tag ? [tag] : [],
            children: [],
          });
        }
        continue;
      }
      const below = trie?.children.get(entry.name);
      const deeper = level < (settings.depth ?? Number.POSITIVE_INFINITY);
      const inside = entry.virtual ? undefined : join(abs ?? "", entry.name);
      let result = { nodes: [], holds: false };
      if (deeper || needsAll || entry.virtual) {
        const nested = inside !== undefined && settings.gitignore ? [...files, ...ignoreFile(inside)] : files;
        result = walk(inside, path, below, level + 1, emit && deeper, nested);
      }
      // A folder that only exists as the home of removed files is shown only while one of them is.
      if (entry.virtual && !result.holds) continue;
      if (pruning && !result.holds) continue;
      holds = true;
      if (emit) nodes.push({ name: entry.name, dir: true, tags: [], children: result.nodes });
    }
    return { nodes, holds };
  }

  const name = basename(root) || root;
  return { name, dir: true, tags: [], children: walk(root, [], removed, 1, true, outer).nodes };
}

// ---- output ------------------------------------------------------------------------------------------------------------

const NBSP = "\u00a0";
/** A name as one line of the block: control characters become `?`, and what would read as markup is kept apart by a no-break space. */
function safe(name) {
  return [...name]
    .map((char) => (char < " " || char === "\u007f" ? "?" : char))
    .join("")
    .replace(/^ +| +$/g, (spaces) => NBSP.repeat(spaces.length))
    .replace(/ # /g, ` #${NBSP}`)
    .replace(/(^| )(\{[^{}]*\})$/, `${NBSP}$2`)
    .replace(/^… (\d+) more$/, `…${NBSP}$1 more`);
}

function render(tree) {
  let count = 0;
  let deepest = 0;
  const out = [];
  const longest = { backticks: 0 };
  const walk = (node, level) => {
    count++;
    deepest = Math.max(deepest, level + 1);
    const name = node.more === undefined ? safe(node.name) : node.name;
    for (const run of name.match(/`+/g) ?? []) longest.backticks = Math.max(longest.backticks, run.length);
    const tags = node.tags.length > 0 ? ` {${node.tags.join(", ")}}` : "";
    out.push(`${"  ".repeat(level)}${name}${node.dir ? "/" : ""}${tags}`);
    for (const child of node.children) walk(child, level + 1);
  };
  walk(tree, 0);
  if (count > MAX_NODES) {
    throw new Failure(
      `${count} nodes; a tree block holds at most ${MAX_NODES}. Narrow it with -L, -I, -P, --gitignore, --prune or --filelimit.`,
    );
  }
  if (deepest > MAX_DEPTH) {
    throw new Failure(`${deepest} levels; a tree block holds at most ${MAX_DEPTH}. Narrow it with -L.`);
  }
  const fence = "`".repeat(Math.max(3, longest.backticks + 1));
  return `${fence}tree\n${out.join("\n")}\n${fence}\n`;
}

try {
  const settings = options(process.argv.slice(2));
  if (settings.help) process.stdout.write(USAGE);
  else process.stdout.write(render(snapshot(settings)));
} catch (error) {
  if (error instanceof Usage) {
    process.stderr.write(`pbs-tree: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else if (error instanceof Failure) {
    process.stderr.write(`pbs-tree: ${error.message}\n`);
    process.exitCode = 1;
  } else throw error;
}
