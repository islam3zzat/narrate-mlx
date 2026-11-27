// Which characters the whiteboard font (Gochi Hand, src/fonts/GochiHand-Regular.ttf) can draw. Anything else would fall
// back to a system font and make the output depend on the machine, so `check` rejects it. Pure: used by schema.ts.
// tests/vectors/whiteboard-layout.test.ts pins these ranges to the font's real cmap.
export const GOCHI_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], [0xa0, 0xac], [0xae, 0xff], [0x127, 0x129], [0x131, 0x131], [0x133, 0x135], [0x137, 0x138], [0x140, 0x144],
  [0x152, 0x154], [0x156, 0x159], [0x160, 0x161], [0x178, 0x178], [0x17d, 0x17e], [0x2c6, 0x2c7], [0x2d8, 0x2da], [0x2dc, 0x2dc],
  [0x326, 0x326], [0x2013, 0x2014], [0x2018, 0x201a], [0x201c, 0x201e], [0x2022, 0x2022], [0x2026, 0x2026], [0x2039, 0x203a],
  [0x2044, 0x2044], [0x2074, 0x2074], [0x20ac, 0x20ac], [0xfb01, 0xfb02],
];

/** The first character of `s` the whiteboard font cannot draw (newlines and tabs count as spaces), or null. */
export const unsupportedGlyph = (s: string): string | null => {
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0a || cp === 0x09 || cp === 0x0d) continue;
    if (!GOCHI_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return ch;
  }
  return null;
};

/** Visual types the whiteboard layout draws by hand (see buildBoard in layouts.ts; a test keeps the two in step). */
export const WHITEBOARD_DRAWN_TYPES: readonly string[] = ['title', 'bullets', 'flow', 'steps', 'fanout', 'compare', 'callout'];

/** Every string value inside a visual (text fields only; `type` and `tone` are tokens, not drawn). */
export const stringsOf = (x: unknown): string[] =>
  typeof x === 'string' ? [x]
    : Array.isArray(x) ? x.flatMap(stringsOf)
    : x && typeof x === 'object' ? Object.entries(x).filter(([k]) => k !== 'type' && k !== 'tone').flatMap(([, y]) => stringsOf(y))
    : [];
