import { expect } from "bun:test";
import type { Answer } from "../../src/core/types.ts";
import "../../src/elements/index.ts";
import type { PbsElement } from "../../src/elements/index.ts";

/** A string that would become an element if any element parsed it as HTML. */
export const PROBE = "<img src=x onerror=alert(1)>";
export const PROBE_TEXT = `${PROBE} <script>alert(2)</script>`;

export function mount<D>(tag: string, data: D, attributes: Record<string, string> = {}): PbsElement<D> {
  const element = document.createElement(tag) as PbsElement<D>;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  element.data = data;
  return element;
}

export const root = (element: Element): ShadowRoot => {
  const shadow = element.shadowRoot;
  if (!shadow) throw new Error("no shadow root");
  return shadow;
};

export function one<T extends Element = HTMLElement>(element: Element, selector: string): T {
  const found = root(element).querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in <${element.localName}>`);
  return found;
}

export const all = <T extends Element = HTMLElement>(element: Element, selector: string): T[] => [
  ...root(element).querySelectorAll<T>(selector),
];

export const text = (element: Element): string => root(element).textContent ?? "";

/** Collects the `pbs-answer` details that reach `document`, which proves the event bubbles and crosses the shadow boundary. */
export function answers(): { details: Answer[]; stop: () => void; cancel: boolean } {
  const state = { details: [] as Answer[], cancel: false, stop: () => {} };
  const listener = (event: Event) => {
    state.details.push((event as CustomEvent<Answer>).detail);
    if (state.cancel) event.preventDefault();
  };
  document.addEventListener("pbs-answer", listener);
  state.stop = () => document.removeEventListener("pbs-answer", listener);
  return state;
}

export function type(box: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  box.value = value;
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

export function check(box: HTMLInputElement, on = true): void {
  box.checked = on;
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

export const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
};

export function key(element: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

/** The rule every element must keep under a CSP without `unsafe-inline`: no <style> element and no style attribute in its shadow tree. */
export function expectCspSafe(element: Element): void {
  expect(root(element).querySelectorAll("style, [style], link").length).toBe(0);
  expect(root(element).adoptedStyleSheets.length).toBeGreaterThan(0);
}

/** Nothing was built from the probe string: no img/script/iframe from it, no event-handler attribute anywhere. */
export function expectInert(element: Element): void {
  const shadow = root(element);
  expect(shadow.querySelectorAll("script, [onerror], [onload], [onclick]").length).toBe(0);
  expect(shadow.querySelectorAll('img[src="x"]').length).toBe(0);
  expect(shadow.textContent).toContain("<img src=x onerror=alert(1)>");
}

export function cleanup(): void {
  document.body.replaceChildren();
}
