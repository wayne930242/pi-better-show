import { encodeAnswer, parse } from "../src/core/index.ts";
import type { Answer } from "../src/core/types.ts";
import { configure, type PbsElement, TAGS } from "../src/elements/index.ts";

/** The demo host: parses blocks.md, draws every block with its element, and plays the host's part (delivering answers, locking). */

configure({
  diagramUrl: (source, scheme) => `/diagram.svg?scheme=${scheme}&source=${encodeURIComponent(source)}`,
  imageUrl: (ref) => (/^[\w.-]+\.svg$/.test(ref) ? `/img/${ref}` : undefined),
  pageUrl: (ref) => (/^[\w.-]+\.html$/.test(ref) ? `/pages/${ref}` : undefined),
});

const stage = document.getElementById("stage") as HTMLElement;
const answerLog = document.getElementById("answer") as HTMLElement;
const lock = document.getElementById("lock") as HTMLInputElement;
const root = document.documentElement;
const elements = (): PbsElement[] =>
  [...stage.querySelectorAll<PbsElement>("*")].filter((el) => el.localName.startsWith("pbs-"));

function element(tag: string): PbsElement {
  return document.createElement(tag) as PbsElement;
}

function draw(markdown: string): void {
  for (const segment of parse(markdown)) {
    if (segment.type === "markdown") {
      for (const line of segment.text.split("\n")) {
        const text = line.trim();
        if (text.startsWith("# "))
          stage.append(Object.assign(document.createElement("h2"), { textContent: text.slice(2) }));
        else if (text) stage.append(Object.assign(document.createElement("p"), { className: "md", textContent: text }));
      }
    } else if (segment.type === "invalid") {
      stage.append(
        Object.assign(document.createElement("pre"), {
          textContent: `${segment.kind}: ${segment.error}\n${segment.source}`,
        }),
      );
    } else {
      const tag = TAGS[segment.kind];
      const block = element(tag);
      block.ref = { doc: "blocks.md", block: segment.index };
      block.density = root.dataset.density === "compact" ? "compact" : "comfortable";
      block.data = segment.data;
      const figure = document.createElement("figure");
      figure.className = "demo-block";
      const caption = document.createElement("figcaption");
      const kind = Object.assign(document.createElement("code"), { textContent: segment.kind });
      const name = Object.assign(document.createElement("code"), { textContent: tag });
      caption.append(kind, " → ", name);
      figure.append(caption, block);
      stage.append(figure);
    }
  }
}

// The host's part: take the answer, show what the agent will read, and lock the element with the submitted fields.
document.addEventListener("pbs-answer", (event) => {
  const answer = (event as CustomEvent<Answer>).detail;
  answerLog.textContent = encodeAnswer(answer);
  const target = event.target as PbsElement;
  if (lock.checked && (answer.kind === "form" || answer.kind === "review" || answer.kind === "checklist")) {
    setTimeout(() => {
      target.answered = answer.fields;
    }, 400);
  } else if (lock.checked) {
    target.answered = answer.fields;
  }
});

function press(control: string, value: string): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(`[data-control="${control}"] button`)) {
    button.setAttribute("aria-pressed", String(button.dataset.value === value));
  }
  if (control === "scheme") root.dataset.scheme = value;
  if (control === "host") root.dataset.host = value;
  if (control === "lang") root.lang = value;
  if (control === "density") {
    root.dataset.density = value;
    for (const el of elements()) el.setAttribute("density", value);
  }
  // The colour scheme and the document language are read from the page, which has no way to tell an element that they changed.
  for (const el of elements()) el.refresh();
}

for (const button of document.querySelectorAll<HTMLButtonElement>(".bar button")) {
  button.addEventListener("click", () =>
    press((button.closest("fieldset") as HTMLElement).dataset.control as string, button.dataset.value as string),
  );
}

// Deep links for the screenshot run: ?scheme=dark&density=compact&host=straw&lang=zh-Hant
const params = new URLSearchParams(location.search);
if (params.has("shoot")) root.dataset.shoot = "";
const wanted: [string, string | null][] = [
  ["scheme", params.get("scheme")],
  ["host", params.get("host")],
  ["lang", params.get("lang")],
];
for (const [control, value] of wanted) if (value) press(control, value);

const response = await fetch("/blocks.md");
draw(await response.text());
const density = params.get("density");
if (density) press("density", density);
else for (const el of elements()) el.refresh();
document.body.dataset.ready = "true";
