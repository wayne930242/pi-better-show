import type { AlertData, CardsData, DiffData, MermaidData, StatsData, StepStatus, StepsData } from "../core/types.ts";
import { define, PbsElement } from "./base.ts";
import { configuration, type DiagramMap, type DiagramTarget } from "./config.ts";
import { h, inlineNodes, prose, svg } from "./dom.ts";
import type { Strings } from "./strings.ts";

/** The blocks that only show: callout, cards, steps, stats, diff, diagram. */

const displayCss = `

.callout > .callout-head { display: flex; align-items: baseline; color: color-mix(in srgb, var(--_t) 78%, var(--_fg)); }

.stat { display: flex; flex-direction: column; gap: 0.15rem; }
.stat .value { font-size: 1.7em; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
.stat .label { color: var(--_muted); font-size: 0.92em; }

.steps { list-style: none; padding: 0; margin: 0; }
.steps > li { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); gap: 0 0.7rem; }
.steps .rail { display: flex; flex-direction: column; align-items: center; }
.steps .marker {
  display: grid; place-items: center; width: 1.6rem; height: 1.6rem; flex: none;
  border: 1px solid color-mix(in srgb, var(--_t, var(--_muted)) 55%, var(--_line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--_t, var(--_muted)) 14%, var(--_bg));
  color: color-mix(in srgb, var(--_t, var(--_muted)) 80%, var(--_fg));
  font-size: 0.8em; font-weight: 700;
}
.steps .line { flex: 1; width: 2px; min-height: 0.5rem; margin: 0.2rem 0; background: var(--_line); border-radius: 1px; }
.steps > li:last-child .line { display: none; }
.steps .content { padding-bottom: var(--_gap); min-width: 0; }
.steps > li:last-child .content { padding-bottom: 0; }
.steps .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.1rem 0.6rem; }
.steps .when { color: var(--_muted); font-size: 0.9em; }
.steps .body { margin-top: 0.2em; color: var(--_muted); }
.steps > li[data-status="todo"] .heading { font-weight: 550; }

.diff { margin: 0; border: 1px solid var(--_line); border-radius: var(--_radius); background: var(--_bg); overflow: hidden; }
.diff .scroll { overflow: auto; max-height: 32rem; }
.diff code { display: block; min-width: max-content; padding: var(--_pad-s) 0; }
.diff .line { display: block; padding: 0 var(--_pad); white-space: pre; min-height: 1.5em; }
.diff .line[data-kind="add"] { background: color-mix(in srgb, var(--_ok) 15%, var(--_bg)); }
.diff .line[data-kind="del"] { background: color-mix(in srgb, var(--_risk) 14%, var(--_bg)); }
.diff .line[data-kind="hunk"] { color: var(--_accent); background: color-mix(in srgb, var(--_accent) 8%, var(--_bg)); }
.diff .line[data-kind="meta"] { color: var(--_muted); font-weight: 600; }

.diagram { margin: 0; text-align: center; overflow: auto; }
.diagram img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.diagram .frame { position: relative; width: fit-content; max-width: 100%; margin: 0 auto; }
.diagram .targets { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.targets .hit { cursor: pointer; outline: none; }
.targets .hit > * {
  fill: transparent; stroke: transparent; stroke-width: 1px; vector-effect: non-scaling-stroke; pointer-events: all;
}
.targets .hit > polyline { fill: none; stroke-width: 8px; stroke-linecap: round; stroke-linejoin: round; }
.targets .hit:hover > *, .targets .hit:focus-visible > * {
  fill: color-mix(in srgb, var(--_accent) 14%, transparent);
  stroke: color-mix(in srgb, var(--_accent) 60%, transparent);
  stroke-width: 2px;
}
.targets .hit:hover > polyline, .targets .hit:focus-visible > polyline { fill: none; stroke-width: 8px; }
.diagram details { margin-top: 0.6rem; text-align: left; }
.diagram summary { cursor: pointer; color: var(--_muted); font-size: 0.9em; }
.diagram pre { margin-top: 0.4rem; padding: var(--_pad); background: var(--_surface); border-radius: var(--_radius); }
.diagram .note { margin-bottom: 0.5rem; text-align: left; }
`;

const TONES = ["note", "ok", "warn", "risk"] as const;
const ICONS: Record<(typeof TONES)[number], string> = { note: "ⓘ", ok: "✓", warn: "⚠", risk: "✕" };
const TONE_LABELS: Record<(typeof TONES)[number], keyof Strings> = {
  note: "toneNote",
  ok: "toneOk",
  warn: "toneWarn",
  risk: "toneRisk",
};
const knownTone = (tone: string | undefined): (typeof TONES)[number] | undefined =>
  TONES.find((known) => known === tone);

export class PbsCallout extends PbsElement<AlertData> {
  static override css = displayCss;

  protected view(data: AlertData): Node {
    const tone = knownTone(data.tone) ?? "note";
    const label = this.t(TONE_LABELS[tone]);
    return h(
      "section",
      { part: "callout", class: "panel callout", "data-tone": tone, role: "note" },
      h(
        "div",
        { part: "header", class: "heading callout-head" },
        h("span", { part: "icon", class: "icon", role: "img", "aria-label": label }, ICONS[tone]),
        h("span", { part: "title" }, inlineNodes(data.title || label)),
      ),
      prose(data.body ?? ""),
    );
  }
}

export class PbsCards extends PbsElement<CardsData> {
  static override css = displayCss;

  protected view(data: CardsData): Node {
    return h(
      "div",
      { part: "grid", class: "grid", role: "list", "aria-label": this.t("cards") },
      data.cards.map((card) => {
        const tone = knownTone(card.tone);
        return h(
          "article",
          { part: "card", class: "panel card", role: "listitem", "data-tone": tone },
          card.title &&
            h(
              "div",
              { part: "title", class: "heading" },
              tone && h("span", { part: "icon", class: "icon", "aria-hidden": "true" }, ICONS[tone]),
              inlineNodes(card.title),
            ),
          card.body && prose(card.body),
        );
      }),
    );
  }
}

const STATUS_TONE: Record<StepStatus, string | undefined> = {
  done: "ok",
  doing: "note",
  todo: undefined,
  blocked: "risk",
};
const STATUS_MARK: Record<StepStatus, string> = { done: "✓", doing: "●", todo: "○", blocked: "✕" };
const STATUS_LABEL: Record<StepStatus, keyof Strings> = {
  done: "statusDone",
  doing: "statusDoing",
  todo: "statusTodo",
  blocked: "statusBlocked",
};

export class PbsSteps extends PbsElement<StepsData> {
  static override css = displayCss;

  protected view(data: StepsData): Node {
    return h(
      "ol",
      { part: "steps", class: "steps", "aria-label": this.t("steps") },
      data.items.map((step) =>
        h(
          "li",
          { part: "step", "data-status": step.status, "data-tone": STATUS_TONE[step.status] },
          h(
            "div",
            { class: "rail", part: "rail" },
            h("span", { part: "marker", class: "marker", "aria-hidden": "true" }, STATUS_MARK[step.status]),
            h("span", { class: "line", "aria-hidden": "true" }),
          ),
          h(
            "div",
            { class: "content", part: "content" },
            h(
              "div",
              { class: "head" },
              h("span", { part: "title", class: "heading" }, inlineNodes(step.title)),
              h("span", { part: "badge", class: "badge" }, this.t(STATUS_LABEL[step.status])),
              step.when && h("span", { part: "when", class: "when" }, step.when),
            ),
            step.body && h("div", { part: "body", class: "body" }, prose(step.body)),
          ),
        ),
      ),
    );
  }
}

/** A delta's direction from its sign, as a glyph: the tile also says it in words, so colour is never the only cue. */
const trend = (delta: string): string => (/^\+/.test(delta) ? "▲ " : /^[-−–]/.test(delta) ? "▼ " : "");

export class PbsStats extends PbsElement<StatsData> {
  static override css = displayCss;

  protected view(data: StatsData): Node {
    return h(
      "div",
      { part: "grid", class: "grid", role: "list", "aria-label": this.t("stats") },
      data.items.map((stat) =>
        h(
          "div",
          { part: "stat", class: "panel stat", role: "listitem", "data-tone": knownTone(stat.tone) },
          h("div", { part: "label", class: "label" }, inlineNodes(stat.label)),
          h("div", { part: "value", class: "value" }, stat.value),
          stat.delta &&
            h(
              "div",
              null,
              h(
                "span",
                { part: "delta", class: "badge", "data-tone": knownTone(stat.tone) },
                trend(stat.delta),
                stat.delta,
              ),
            ),
          stat.note && h("div", { part: "note", class: "label" }, inlineNodes(stat.note)),
        ),
      ),
    );
  }
}

type DiffKind = "add" | "del" | "hunk" | "meta" | "context";

/** Classifies unified-diff lines. `---`/`+++` file headers are told from a removed or added line by their pairing. */
export function diffKinds(lines: string[]): DiffKind[] {
  const kinds: DiffKind[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    if (line.startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ")) {
      kinds.push("meta", "meta");
      index++;
    } else if (line.startsWith("@@")) kinds.push("hunk");
    else if (/^(diff |index |new file|deleted file|similarity |rename |old mode|new mode|\\)/.test(line))
      kinds.push("meta");
    else if (line.startsWith("+")) kinds.push("add");
    else if (line.startsWith("-")) kinds.push("del");
    else kinds.push("context");
  }
  return kinds;
}

export class PbsDiff extends PbsElement<DiffData> {
  static override css = displayCss;

  protected view(data: DiffData): Node {
    const lines = data.source.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    const kinds = diffKinds(lines);
    const label = this.t("diff");
    return h(
      "figure",
      { part: "diff", class: "diff" },
      h(
        "div",
        { class: "scroll", part: "scroll", tabindex: "0", role: "region", "aria-label": label },
        h(
          "pre",
          null,
          h(
            "code",
            null,
            lines.map((line, index) => h("span", { part: "line", class: "line", "data-kind": kinds[index] }, line)),
          ),
        ),
      ),
    );
  }
}

export class PbsDiagram extends PbsElement<MermaidData> {
  static override css = displayCss;
  /** A URL whose image failed to load; the source is shown instead. */
  #failed: string | undefined;

  protected override reset(): void {
    this.#failed = undefined;
  }

  protected view(data: MermaidData): Node {
    const url = configuration().diagramUrl?.(data.source, this.scheme);
    const shown = url !== undefined && url !== this.#failed;
    const source = h("pre", null, h("code", null, data.source));
    const figure = h("figure", { part: "diagram", class: "panel diagram" });
    if (shown) {
      const image = h("img", { part: "image", src: url, alt: this.t("diagram"), loading: "lazy" });
      image.addEventListener("error", () => {
        this.#failed = url;
        this.refresh();
      });
      const frame = h("div", { class: "frame" }, image);
      this.#addTargets(frame, url);
      figure.append(frame, h("details", { part: "source" }, h("summary", null, this.t("diagramSource")), source));
    } else {
      figure.append(h("p", { part: "note", class: "muted note" }, this.t("diagramFallback")), source);
    }
    return figure;
  }

  /**
   * When the host can read the drawing (`diagramMap`), lays its nodes and edges over the image as buttons: a click, or
   * Enter or Space on a focused one, dispatches `pbs-diagram-target` with the element in the diagram's own words.
   * The overlay arrives after the image; a diagram the host cannot read stays a plain image.
   */
  #addTargets(frame: HTMLElement, url: string): void {
    const read = configuration().diagramMap;
    if (!read) return;
    // A host that throws, or answers without a promise, must not break the drawing.
    Promise.resolve()
      .then(() => read(url))
      .then(
        (map) => {
          // A redraw replaced this frame while the map was loading.
          if (map && frame.isConnected) frame.append(this.#overlay(map));
        },
        (error: unknown) => console.warn("pbs-diagram: the diagram's elements cannot be commented on:", error),
      );
  }

  #overlay(map: DiagramMap): SVGElement {
    const words: Record<DiagramTarget["kind"], string> = {
      node: this.t("diagramNode"),
      edge: this.t("diagramEdge"),
      group: this.t("diagramGroup"),
    };
    const pick = (target: DiagramTarget): void => {
      this.dispatchEvent(
        new CustomEvent("pbs-diagram-target", {
          bubbles: true,
          composed: true,
          detail: { kind: target.kind, text: target.text },
        }),
      );
    };
    const hits = map.targets.map((target) => {
      const hit = svg(
        "g",
        {
          class: "hit",
          role: "button",
          tabindex: 0,
          "data-kind": target.kind,
          "aria-label": this.t("diagramComment", { kind: words[target.kind], text: target.text }),
        },
        ...target.shapes.map((shape) => svg(shape.tag, shape.attrs)),
      );
      hit.addEventListener("click", () => pick(target));
      hit.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        pick(target);
      });
      return hit;
    });
    return svg(
      "svg",
      { class: "targets", viewBox: map.viewBox, role: "group", "aria-label": this.t("diagram") },
      ...hits,
    );
  }
}

export function defineDisplay(): void {
  define("pbs-callout", PbsCallout);
  define("pbs-cards", PbsCards);
  define("pbs-steps", PbsSteps);
  define("pbs-stats", PbsStats);
  define("pbs-diff", PbsDiff);
  define("pbs-diagram", PbsDiagram);
}
