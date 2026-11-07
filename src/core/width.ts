/** East Asian Wide and Fullwidth ranges, and emoji planes, that take two terminal cells. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
];

/** Combining marks, variation selectors, and joiners take no cell of their own. */
const ZERO = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

/** The columns a string takes in a monospace terminal or code block: CJK characters count 2, combining marks 0. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (ZERO.test(char)) continue;
    width += WIDE.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
  }
  return width;
}
