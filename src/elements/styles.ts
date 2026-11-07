/**
 * The shared stylesheet, adopted into every element's shadow root as a constructed stylesheet (no <style> element,
 * no style attribute, so a CSP without `unsafe-inline` allows it).
 *
 * Tokens: a host sets a public `--pbs-*` property on the element or any ancestor; each is read once on `:host` into a
 * private `--_*` twin, with a `light-dark()` default that follows the host's `color-scheme`. (Declaring the public name
 * on `:host` itself would shadow what an ancestor sets, which is why the twins exist.)
 *
 * Borders: a card or panel has the same border on all four sides, or none. Tone and status show through a tint, a
 * badge, an icon, and the heading colour, never through a coloured or thicker border on one side.
 */
export const baseCss = `
:host {
  display: block;
  --_fg: var(--pbs-fg, light-dark(#1f2328, #e6edf3));
  --_muted: var(--pbs-muted, light-dark(#59636e, #9ba3ad));
  --_bg: var(--pbs-bg, light-dark(#ffffff, #151b23));
  --_surface: var(--pbs-surface, light-dark(#f6f8fa, #1d252f));
  --_line: var(--pbs-line, light-dark(#d1d9e0, #3d444d));
  --_control: var(--pbs-control, light-dark(#6e7781, #7d8590));
  --_accent: var(--pbs-accent, light-dark(#0969da, #4493f8));
  --_on-accent: var(--pbs-on-accent, light-dark(#ffffff, #0d1117));
  --_note: var(--pbs-note, light-dark(#0969da, #4493f8));
  --_ok: var(--pbs-ok, light-dark(#1a7f37, #3fb950));
  --_warn: var(--pbs-warn, light-dark(#9a6700, #d29922));
  --_risk: var(--pbs-risk, light-dark(#cf222e, #f85149));
  --_radius: var(--pbs-radius, 8px);
  --_font: var(--pbs-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif);
  --_mono: var(--pbs-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  --_gap: var(--pbs-gap, 1rem);
  --_fs: var(--pbs-font-size, 15px);
  --_lh: 1.6;
  --_pad: 0.9rem;
  --_pad-s: 0.4rem;
  margin: 0 0 var(--_gap);
  color: var(--_fg);
  font: var(--_fs) / var(--_lh) var(--_font);
}
:host([density="compact"]) {
  --_gap: var(--pbs-gap, 0.6rem);
  --_fs: var(--pbs-font-size, 13.5px);
  --_lh: 1.45;
  --_pad: 0.55rem;
  --_pad-s: 0.25rem;
}
:host([hidden]) { display: none; }
:host([scheme="light"]) { color-scheme: light; }
:host([scheme="dark"]) { color-scheme: dark; }
:host(:last-child) { margin-bottom: 0; }

*, *::before, *::after { box-sizing: border-box; }
p, ul, ol, dl, dd, figure, fieldset, h3, h4 { margin: 0; padding: 0; }
p + p, p + ul, p + ol, ul + p, ol + p { margin-top: 0.5em; }
ul, ol { padding-left: 1.3em; }
a { color: var(--_accent); text-underline-offset: 0.15em; }
code { font: 0.9em var(--_mono); background: var(--_surface); padding: 0.1em 0.35em; border-radius: 4px; overflow-wrap: anywhere; }
pre { margin: 0; font: 0.88em / 1.5 var(--_mono); overflow: auto; }
pre code { background: none; padding: 0; font: inherit; }
strong { font-weight: 650; }
legend { padding: 0; }
[hidden] { display: none !important; }
.sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.muted { color: var(--_muted); }

:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }

[data-tone="note"] { --_t: var(--_note); }
[data-tone="ok"] { --_t: var(--_ok); }
[data-tone="warn"] { --_t: var(--_warn); }
[data-tone="risk"] { --_t: var(--_risk); }

/* A panel: one border on all four sides. A tone tints it. */
.panel {
  min-width: 0;
  padding: var(--_pad);
  background: var(--_bg);
  border: 1px solid var(--_line);
  border-radius: var(--_radius);
}
.panel[data-tone] {
  background: color-mix(in srgb, var(--_t, var(--_muted)) 9%, var(--_bg));
  border-color: color-mix(in srgb, var(--_t, var(--_muted)) 32%, var(--_line));
}
.heading { font-weight: 650; }
.panel > .heading { margin-bottom: 0.4em; }

.badge {
  display: inline-block;
  padding: 0 0.6em;
  border: 1px solid color-mix(in srgb, var(--_t, var(--_muted)) 40%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--_t, var(--_muted)) 14%, var(--_bg));
  color: color-mix(in srgb, var(--_t, var(--_muted)) 72%, var(--_fg));
  font-size: 0.8em;
  font-weight: 600;
  line-height: 1.7;
  white-space: nowrap;
  vertical-align: middle;
}
.icon { display: inline-block; min-width: 1.2em; margin-right: 0.35em; text-align: center; color: var(--_t, var(--_muted)); font-weight: 700; }

.btn {
  font: inherit;
  font-weight: 600;
  padding: 0.4em 1.1em;
  color: var(--_on-accent);
  background: var(--_accent);
  border: 1px solid var(--_accent);
  border-radius: var(--_radius);
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: color-mix(in srgb, var(--_accent) 88%, var(--_fg)); }
.btn.quiet { color: var(--_accent); background: transparent; }
.btn.quiet:hover:not(:disabled) { background: var(--_surface); }
.btn:disabled { opacity: 0.55; cursor: default; }

input[type="text"], input[type="search"], textarea {
  width: 100%;
  font: inherit;
  color: var(--_fg);
  background: var(--_bg);
  border: 1px solid var(--_control);
  border-radius: var(--_radius);
  padding: var(--_pad-s) 0.65em;
}
textarea { min-height: 4.5em; resize: vertical; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--_accent); margin: 0.3em 0 0; flex: none; }
::placeholder { color: var(--_muted); opacity: 1; }

.row { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; }
.status { color: var(--_muted); font-size: 0.9em; }
.error { color: var(--_risk); font-size: 0.92em; }
div.error { padding: var(--_pad); border: 1px solid color-mix(in srgb, var(--_risk) 40%, var(--_line)); border-radius: var(--_radius); background: color-mix(in srgb, var(--_risk) 8%, var(--_bg)); }

/* The submitted values a locked element shows. */
.sent { display: grid; gap: 0.5rem; margin: 0; }
.sent > div { display: grid; gap: 0.1rem; }
.sent dt { color: var(--_muted); font-size: 0.9em; }
.sent dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (prefers-reduced-motion: no-preference) {
  .btn, .badge { transition: background-color 0.12s, border-color 0.12s; }
}
`;
