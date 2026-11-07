import type { InlineToken } from "./types.ts";

/**
 * The restricted inline Markdown of block text fields: **bold**, *italic*, `code`, [text](http(s) url),
 * bare http(s) URLs, backslash escapes, and line breaks. It is tokenized, never turned into HTML, so a host
 * builds DOM from the tokens and no input string reaches `innerHTML`. Anything else stays literal text.
 */
export function inline(text: string): InlineToken[] {
  return scan(text.replace(/\r\n?/g, "\n"));
}

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;
const URL_AT = /^https?:\/\/[^\s<>]+/i;
const SAFE_URL = /^https?:\/\/[^\s<>]+$/i;

const isWord = (char: string | undefined): boolean => char !== undefined && WORD.test(char);

function scan(src: string): InlineToken[] {
  const out: InlineToken[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  const push = (token: InlineToken) => {
    flush();
    out.push(token);
  };

  let i = 0;
  while (i < src.length) {
    const char = src[i] as string;

    if (char === "\\" && PUNCTUATION.test(src[i + 1] ?? "")) {
      buffer += src[i + 1];
      i += 2;
    } else if (char === "\n") {
      push({ type: "br" });
      i++;
    } else if (char === "`") {
      const end = codeEnd(src, i);
      if (end === undefined) {
        const run = /^`+/.exec(src.slice(i))?.[0] ?? "`";
        buffer += run;
        i += run.length;
      } else {
        push({ type: "code", text: end.text });
        i = end.next;
      }
    } else if (char === "[") {
      const link = linkAt(src, i);
      if (link) {
        push({ type: "link", href: link.href, children: scan(link.label) });
        i = link.next;
      } else {
        buffer += char;
        i++;
      }
    } else if (char === "*" || char === "_") {
      const emphasis = emphasisAt(src, i);
      if (emphasis) {
        push({ type: emphasis.strong ? "strong" : "em", children: scan(emphasis.inner) });
        i = emphasis.next;
      } else {
        buffer += char;
        i++;
      }
    } else if ((char === "h" || char === "H") && !isWord(src[i - 1])) {
      const url = bareUrl(src, i);
      if (url) {
        push({ type: "link", href: url, children: [{ type: "text", text: url }] });
        i += url.length;
      } else {
        buffer += char;
        i++;
      }
    } else {
      buffer += char;
      i++;
    }
  }
  flush();
  return out;
}

/** A code span opened by a backtick run closes at the next run of the same length. */
function codeEnd(src: string, start: number): { text: string; next: number } | undefined {
  const run = /^`+/.exec(src.slice(start))?.[0] as string;
  let from = start + run.length;
  while (from < src.length) {
    const found = src.indexOf(run, from);
    if (found < 0) return undefined;
    // A longer run is not this span's closer.
    if (src[found + run.length] === "`" || src[found - 1] === "`") {
      from = found + 1;
      while (src[from] === "`") from++;
      continue;
    }
    const raw = src.slice(start + run.length, found).replace(/\n/g, " ");
    const text =
      raw.length > 2 && raw.startsWith(" ") && raw.endsWith(" ") && raw.trim() !== "" ? raw.slice(1, -1) : raw;
    return { text, next: found + run.length };
  }
  return undefined;
}

function linkAt(src: string, start: number): { label: string; href: string; next: number } | undefined {
  let depth = 0;
  let close = -1;
  for (let i = start; i < src.length; i++) {
    const char = src[i];
    if (char === "\\") i++;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0 || src[close + 1] !== "(") return undefined;
  const end = src.indexOf(")", close + 2);
  if (end < 0) return undefined;
  const href = src.slice(close + 2, end).trim();
  const label = src.slice(start + 1, close);
  if (!SAFE_URL.test(href) || label.trim() === "") return undefined;
  return { label, href, next: end + 1 };
}

function bareUrl(src: string, start: number): string | undefined {
  const found = URL_AT.exec(src.slice(start))?.[0];
  if (!found) return undefined;
  // Trailing sentence punctuation, and an unmatched closing bracket, belong to the text around the link.
  let url = found;
  for (;;) {
    const last = url[url.length - 1] as string;
    const unmatchedParen = last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0);
    if (/[.,;:!?'"\]}]/.test(last) || unmatchedParen) url = url.slice(0, -1);
    else break;
  }
  return /^https?:\/\/[^/\s]+/i.test(url) && url.length > "https://".length ? url : undefined;
}

function emphasisAt(src: string, start: number): { inner: string; strong: boolean; next: number } | undefined {
  const mark = src[start] as string;
  const strong = src[start + 1] === mark;
  const size = strong ? 2 : 1;
  const delimiter = mark.repeat(size);
  // `_` inside a word is literal (snake_case).
  if (mark === "_" && isWord(src[start - 1])) return undefined;
  const open = start + size;
  if (open >= src.length || /\s/.test(src[open] as string)) return undefined;

  let from = open;
  while (from < src.length) {
    let close = src.indexOf(delimiter, from);
    if (close < 0) return undefined;
    if (src[close - 1] === "\\") {
      from = close + 1;
      continue;
    }
    // A run longer than the delimiter closes with its last characters (`***both***`).
    if (strong) while (src[close + size] === mark) close++;
    // A single mark inside `**` is part of the strong opener or closer, not a closer.
    if (!strong && (src[close + 1] === mark || src[close - 1] === mark)) {
      from = close + 2;
      continue;
    }
    const inner = src.slice(open, close);
    const tooEarly = inner === "" || /\s$/.test(inner);
    const afterWord = mark === "_" && isWord(src[close + size]);
    if (tooEarly || afterWord) {
      from = close + size;
      continue;
    }
    return { inner, strong, next: close + size };
  }
  return undefined;
}

function plainToken(token: InlineToken): string {
  switch (token.type) {
    case "text":
    case "code":
      return token.text;
    case "br":
      return "\n";
    case "strong":
    case "em":
      return plainTokens(token.children);
    case "link": {
      const label = plainTokens(token.children);
      return label === token.href ? label : `${label} (${token.href})`;
    }
  }
}

const plainTokens = (tokens: InlineToken[]): string => tokens.map(plainToken).join("");

/** The text as plain text: markers dropped, a link as `text (url)`. */
export function inlinePlain(text: string): string {
  return plainTokens(inline(text));
}
