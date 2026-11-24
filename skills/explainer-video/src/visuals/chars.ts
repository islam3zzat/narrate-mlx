// Character rules shared by the visuals that show text from the script: display width and invisible or direction-changing characters.
// Pure leaf (no React, no zod).

// Display width. An approximation of Unicode East Asian Width (no dependency): East Asian Wide/Fullwidth and emoji-presentation
// characters count 2 cells, combining marks and variation selectors 0, everything else 1. Ambiguous-width characters count 1, and
// fonts differ on some symbols, so a line at the limit can still be a little wider or narrower than 80 monospace cells.
const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe], [0x2614, 0x2615],
  [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce],
  [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b],
  [0x2728, 0x2728], [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0], [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0xa4cf], [0xa960, 0xa97f],
  [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f200, 0x1f320], [0x1f32d, 0x1f335], [0x1f337, 0x1f37c], [0x1f37e, 0x1f393], [0x1f3a0, 0x1f3ca],
  [0x1f3cf, 0x1f3d3], [0x1f3e0, 0x1f3f0], [0x1f3f4, 0x1f3f4], [0x1f3f8, 0x1f43e], [0x1f440, 0x1f440], [0x1f442, 0x1f4fc], [0x1f4ff, 0x1f53d],
  [0x1f54b, 0x1f54e], [0x1f550, 0x1f567], [0x1f57a, 0x1f57a], [0x1f595, 0x1f596], [0x1f5a4, 0x1f5a4], [0x1f5fb, 0x1f64f], [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc], [0x1f6d0, 0x1f6d2], [0x1f6d5, 0x1f6d7], [0x1f6dc, 0x1f6df], [0x1f6eb, 0x1f6ec], [0x1f6f4, 0x1f6fc], [0x1f7e0, 0x1f7eb],
  [0x1f90c, 0x1f93a], [0x1f93c, 0x1f945], [0x1f947, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
];
const ZERO: [number, number][] = [[0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x064b, 0x065f], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x20d0, 0x20ff], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f]];
const within = (t: [number, number][], cp: number) => {
  let lo = 0, hi = t.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cp < t[m][0]) hi = m - 1; else if (cp > t[m][1]) lo = m + 1; else return true; }
  return false;
};
export const cellWidth = (cp: number): 0 | 1 | 2 => (within(ZERO, cp) ? 0 : within(WIDE, cp) ? 2 : 1);
/** Display cells of a string (see `cellWidth`); counts by code point. */
export const displayCells = (s: string): number => { let n = 0; for (const ch of s) n += cellWidth(ch.codePointAt(0)!); return n; };

export const hex = (cp: number) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
// Overrides, embeddings and isolates reorder text; the marks (LRM, RLM, ALM) only set a direction and Arabic text may use them.
const BIDI_REORDER = (cp: number) => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
const BIDI = (cp: number) => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x200e || cp === 0x200f || cp === 0x061c;
const INVISIBLE = /^[\p{Cf}\u034f\u115f\u1160\u180b-\u180f\u2800\u3164\uffa0\ufe00-\ufe0f\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]$/u;
/** Why a character may not appear in code (invisible or direction-changing, so the picture could differ from the text), or null. */
export const forbiddenChar = (ch: string): string | null => {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0xd800 && cp <= 0xdfff) return 'a lone surrogate';
  if (BIDI(cp)) return 'a bidirectional control';
  if (cp === 0x09 || cp === 0x0d || cp === 0x0a) return null; // tab and carriage return have their own messages
  if (cp <= 0x08 || (cp >= 0x0b && cp <= 0x1f) || (cp >= 0x7f && cp <= 0x9f)) return 'a control character';
  if (cp === 0x2028 || cp === 0x2029) return 'a line or paragraph separator';
  if (cp === 0xfeff || (cp >= 0x200b && cp <= 0x200d) || cp === 0x2060) return 'an invisible (zero-width) character';
  // Every other format character (soft hyphen, invisible operators, interlinear marks, tag characters ...), the blank "letters"
  // (Hangul fillers, Braille blank, combining grapheme joiner, Mongolian vowel separator) and variation selectors: all draw nothing.
  if (INVISIBLE.test(ch)) return 'an invisible character';
  return null;
};
/** Bidi controls in a text that is not code (heading, label, caption): the direction marks are allowed, but worth a warning. */
export const bidiIn = (s: string): string[] => [...new Set([...s].filter((ch) => BIDI(ch.codePointAt(0)!) && !BIDI_REORDER(ch.codePointAt(0)!)).map((ch) => hex(ch.codePointAt(0)!)))];
/** Reordering bidi controls (overrides, embeddings, isolates) in a text that is not code: these are errors. */
export const bidiReorderIn = (s: string): string[] => [...new Set([...s].filter((ch) => BIDI_REORDER(ch.codePointAt(0)!)).map((ch) => hex(ch.codePointAt(0)!)))];

/** One message per distinct forbidden character in a short one-line text field (`field` names it in the message), at most 5.
 *  Line breaks and tabs count here. `allowMarks` lets the direction marks (LRM, RLM, ALM) through (Arabic text may use them). */
export const textCharIssues = (field: string, s: string, allowMarks = false): string[] => {
  const seen = new Set<number>(), out: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (allowMarks && (cp === 0x200e || cp === 0x200f || cp === 0x061c)) continue;
    const why = forbiddenChar(ch) ?? (cp === 0x09 || cp === 0x0a || cp === 0x0d ? 'a line break or tab' : null);
    if (why && !seen.has(cp)) { seen.add(cp); out.push(`${field} has ${why} ${hex(cp)}: remove it`); }
  }
  return out.slice(0, 5);
};
