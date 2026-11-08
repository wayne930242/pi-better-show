import { TREE_LIMITS, TREE_TAGS, type TreeData, type TreeNode, type TreeTag } from "./types.ts";

const MORE = /^… (\d+) more$/;
const NOTE = " # ";
const TAGS = /^(?:(.*?) )?\{([^{}]*)\}$/;
const KNOWN = new Set<string>(TREE_TAGS);

/** The tags written between braces: names separated by commas or spaces, each once, all known. */
function tagsOf(list: string, line: number): TreeTag[] {
  const tags: TreeTag[] = [];
  for (const word of list.split(/[\s,]+/).filter(Boolean)) {
    if (!KNOWN.has(word)) throw new Error(`line ${line}: unknown tag "${word}" (use ${TREE_TAGS.join(", ")})`);
    if (!tags.includes(word as TreeTag)) tags.push(word as TreeTag);
  }
  return tags;
}

/** One line's content (indentation already removed): `name[/] [{tags}] [# note]`. */
function nodeOf(content: string, line: number): TreeNode {
  const cut = content.indexOf(NOTE);
  const head = (cut < 0 ? content : content.slice(0, cut)).trimEnd();
  const note = cut < 0 ? "" : content.slice(cut + NOTE.length).trim();
  const tagged = TAGS.exec(head);
  const text = tagged ? (tagged[1] ?? "") : head;
  const dir = text.endsWith("/");
  const name = (dir ? text.slice(0, -1) : text).trim();
  if (name === "") throw new Error(`line ${line}: a line has no name`);
  // Tags are read last, so a bad name is reported before a bad tag.
  const tags = tagged ? tagsOf(tagged[2] as string, line) : [];
  const more = dir ? null : MORE.exec(name);
  return {
    name,
    dir,
    tags,
    ...(note === "" ? {} : { note }),
    children: [],
    ...(more ? { more: Number(more[1]) } : {}),
  };
}

/**
 * An indented tree, two spaces per level: the first line is the root, a folder's name ends with `/`, then optional
 * `{tags}` and a note after ` # `. A `… N more` line stands for entries a limit cut. At most 2,000 lines and 32 levels.
 */
export function tree(source: string): TreeData {
  const stack: TreeNode[] = [];
  let root: TreeNode | undefined;
  let count = 0;
  for (const [at, raw] of source.split("\n").entries()) {
    const line = raw.trimEnd();
    if (line.trim() === "") continue;
    const number = at + 1;
    const space = /^[ \t]*/.exec(line)?.[0] as string;
    if (space.includes("\t")) throw new Error(`line ${number}: indent with two spaces, not tabs`);
    if (space.length % 2 !== 0) throw new Error(`line ${number}: indent by two spaces per level`);
    const level = space.length / 2;
    if (root === undefined && level > 0) throw new Error(`line ${number}: the root line is not indented`);
    if (level > stack.length) throw new Error(`line ${number}: indented more than one level below the line above`);
    if (++count > TREE_LIMITS.nodes) throw new Error(`a tree holds at most ${TREE_LIMITS.nodes} nodes`);
    if (level + 1 > TREE_LIMITS.depth) throw new Error(`a tree is at most ${TREE_LIMITS.depth} levels deep`);
    if (level === 0 && root !== undefined) {
      throw new Error("a tree has one root: indent the other top-level lines under it");
    }
    const node = nodeOf(line.slice(space.length), number);
    stack.length = level;
    const parent = stack[level - 1];
    if (parent) {
      if (!parent.dir) {
        throw new Error(
          `line ${number}: "${parent.name}" is a file and cannot hold entries (end a folder's name with /)`,
        );
      }
      parent.children.push(node);
    } else {
      root = node;
    }
    stack.push(node);
  }
  if (root === undefined) throw new Error("a tree needs a root line");
  return { root };
}
