import { BLOCK_KINDS } from "../core/types.ts";

/**
 * The block check for the agent: what is wrong with the blocks of a Markdown file, as the text `show_doc` and the
 * write hook hand back. Nothing here loads at import: the checker (and with it the YAML parser) loads on the first
 * file that holds a block fence, and Mermaid on the first file that holds a diagram.
 */

const KINDS = BLOCK_KINDS.filter((kind) => kind !== "alert");
const BLOCK_FENCE = new RegExp(`^ {0,3}(?:\`{3,}|~{3,})[ \\t]*(?:${KINDS.join("|")})\\b`, "im");
const MERMAID_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid\b/im;

export const hasBlockFence = (markdown: string): boolean => BLOCK_FENCE.test(markdown);

/** The problems of `markdown` worded for the agent, or undefined when there are none or the file holds no block fence. */
export async function checkText(name: string, markdown: string): Promise<string | undefined> {
  if (!hasBlockFence(markdown)) return undefined;
  const { checkBlocks, formatProblems } = await import("../core/check.ts");
  const mermaid = MERMAID_FENCE.test(markdown) ? (await import("../server/index.ts")).mermaidSvg : undefined;
  const problems = checkBlocks(markdown, {
    ...(mermaid
      ? {
          mermaid: (source: string) => {
            try {
              mermaid(source);
              return undefined;
            } catch (error) {
              return ((error as Error).message.split("\n")[0] as string).trim();
            }
          },
        }
      : {}),
  });
  return problems.length === 0 ? undefined : formatProblems(name, problems);
}
