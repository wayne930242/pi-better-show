# Changelog

## Unreleased

Additive; 0.3.0.

- `INTERACTIVE_KINDS` (`options`, `suggest`, `form`, `checklist`, `review`), exported beside `DISPLAY_KINDS`.
- `toText`: a `checklist` now ends with a reply instruction like the other interactive kinds.
- `toText` takes `lang` (`en` default, `zh-TW`) for the reply instructions; an unknown value is `en`.
- `validateAnswer(block, answer)` checks an untrusted answer against its block and returns `{ ok, reason }`.
- `optionName` is shared by `validateAnswer` and the `options` element.
- Tests: a `multi` form question carries all chosen values; a form, checklist, or review sends nothing until Send; an empty required `multi` question is refused.
