import type { Answer } from "../core/types.ts";
import { configuration, type Scheme, subscribe } from "./config.ts";
import { h } from "./dom.ts";
import { format, type Locale, localeOf, STRINGS, type Strings } from "./strings.ts";
import { baseCss } from "./styles.ts";

export type Density = "comfortable" | "compact";
/** The fields a user submitted, as `pbs-answer` carried them; a host hands them back through `answered` to lock the element. */
export type AnsweredFields = readonly (readonly [string, string])[];
export interface BlockRef {
  doc?: string;
  block: number;
}

/** Loading this module in a runtime without a DOM (SSR, node) must not throw, so the base class falls back to a stub there. */
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

const sheets = new Map<string, CSSStyleSheet>();
function sheetOf(css: string): CSSStyleSheet {
  let sheet = sheets.get(css);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sheets.set(css, sheet);
  }
  return sheet;
}

const isShadowRoot = (root: Node): root is ShadowRoot =>
  typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot;

/**
 * The shared shell of every `pbs-*` element. A host gives it data (`data` property or `data-json` attribute) and
 * listens for `pbs-answer`; the element builds its shadow DOM from the data and never reads or writes HTML.
 *
 * Subclasses implement `view()`. They keep user input (typed text, ticks) in instance fields that `reset()` clears
 * when new data arrives, so a redraw (a locale, density, or `answered` change) does not lose what the user typed.
 */
export abstract class PbsElement<D = unknown> extends Base {
  static observedAttributes = ["data-json", "data-answered", "density", "lang", "scheme", "doc", "block"];
  /** Element-specific CSS, adopted after the shared sheet. */
  static css = "";

  #data: D | undefined;
  #answered: AnsweredFields | undefined;
  #ref: BlockRef | undefined;
  #unsubscribe: (() => void) | undefined;
  #media: MediaQueryList | undefined;
  readonly #onScheme = () => this.refresh();

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const own = (this.constructor as typeof PbsElement).css;
    root.adoptedStyleSheets = own ? [sheetOf(baseCss), sheetOf(own)] : [sheetOf(baseCss)];
  }

  get data(): D | undefined {
    return this.#data;
  }
  set data(value: D | undefined) {
    this.#data = value;
    this.reset();
    this.refresh();
  }

  /** The submitted fields: set by the host once the answer is delivered, which locks the element and shows them. */
  get answered(): AnsweredFields | undefined {
    return this.#answered;
  }
  set answered(value: AnsweredFields | undefined) {
    this.#answered = value;
    this.settled();
    this.refresh();
  }

  /** The block's address, copied into every answer's `ref`; the `doc` and `block` attributes set it too. */
  get ref(): BlockRef | undefined {
    if (this.#ref) return this.#ref;
    const block = this.getAttribute("block");
    if (block === null || !/^\d+$/.test(block)) return undefined;
    const doc = this.getAttribute("doc");
    return doc === null ? { block: Number(block) } : { doc, block: Number(block) };
  }
  set ref(value: BlockRef | undefined) {
    this.#ref = value;
  }

  get density(): Density {
    return this.getAttribute("density") === "compact" ? "compact" : "comfortable";
  }
  set density(value: Density) {
    this.setAttribute("density", value);
  }

  /** The colour scheme in force: the `scheme` attribute, else the computed `color-scheme`, else the system's. */
  get scheme(): Scheme {
    const set = this.getAttribute("scheme");
    if (set === "light" || set === "dark") return set;
    const computed = getComputedStyle(this).colorScheme;
    if (computed === "dark" || computed === "light") return computed;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  set scheme(value: Scheme) {
    this.setAttribute("scheme", value);
  }

  /** The language in force: `lang` on the element or the nearest ancestor (through shadow hosts), then the document, then the browser. */
  get locale(): Locale {
    let node: Element | null = this;
    while (node) {
      const lang = node.getAttribute("lang");
      if (lang) return localeOf(lang);
      const root: Node = node.getRootNode();
      node = node.parentElement ?? (isShadowRoot(root) ? root.host : null);
    }
    return localeOf(document.documentElement.lang || navigator.language);
  }

  /** The words in force: the locale's, then the host's overrides. */
  get strings(): Strings {
    const locale = this.locale;
    return { ...STRINGS[locale], ...configuration().strings[locale] };
  }

  protected t(key: keyof Strings, values?: Record<string, string | number>): string {
    const text = this.strings[key];
    return values ? format(text, values) : text;
  }

  connectedCallback(): void {
    this.#unsubscribe = subscribe(() => this.refresh());
    this.#media = matchMedia("(prefers-color-scheme: dark)");
    this.#media.addEventListener("change", this.#onScheme);
    this.refresh();
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#media?.removeEventListener("change", this.#onScheme);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "data-json" || name === "data-answered") {
      try {
        const parsed: unknown = value === null ? undefined : JSON.parse(value);
        if (name === "data-json") {
          this.#data = parsed as D | undefined;
          this.reset();
        } else {
          this.#answered = parsed as AnsweredFields | undefined;
          this.settled();
        }
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    this.refresh();
  }

  /** Draws again from the data and the current locale, density, scheme, and configuration. */
  refresh(): void {
    if (!this.isConnected) return;
    const root = this.shadowRoot as ShadowRoot;
    if (this.#data === undefined) {
      root.replaceChildren();
      return;
    }
    try {
      const view = this.view(this.#data);
      root.replaceChildren(...(Array.isArray(view) ? view : [view]));
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const root = this.shadowRoot as ShadowRoot;
    root.replaceChildren(
      h("div", { part: "error", class: "error", role: "alert" }, `${this.t("blockError")}: ${message}`),
    );
    this.dispatchEvent(new CustomEvent("pbs-error", { bubbles: true, composed: true, detail: error }));
  }

  /** Dispatches `pbs-answer`. False when a listener cancelled it, meaning the host did not take the answer. */
  protected answer(answer: Omit<Answer, "ref">): boolean {
    const ref = this.ref;
    const detail: Answer = ref ? { ...answer, ref } : answer;
    return this.dispatchEvent(
      new CustomEvent<Answer>("pbs-answer", { bubbles: true, composed: true, cancelable: true, detail }),
    );
  }

  /** Writes a line into the element's live status region, if it has one. */
  protected status(text: string): void {
    const region = this.shadowRoot?.querySelector('[part="status"]');
    if (region) region.textContent = text;
  }

  /** Puts focus back on a control after a redraw replaced it. */
  protected focusIn(selector: string): void {
    this.shadowRoot?.querySelector<HTMLElement>(selector)?.focus();
  }

  /** Clears what the user did to the previous data. */
  protected reset(): void {}
  /** The host set or cleared `answered`. */
  protected settled(): void {}

  protected abstract view(data: D): Node | Node[];
}

/** Registers a tag once; a second import of the module (two bundles on one page) leaves the first definition. */
export function define(tag: string, element: CustomElementConstructor): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, element);
}
