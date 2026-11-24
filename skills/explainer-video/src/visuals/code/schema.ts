import {z} from 'zod';
import {text} from '../common';

export const CODE_LANGUAGES = ['ts', 'tsx', 'js', 'jsx', 'python', 'go', 'rust', 'java', 'sql', 'bash', 'json', 'yaml', 'diff', 'text'] as const;
// `lineUnits` bounds a line in UTF-16 units: combining marks are 0 cells, so the column cap alone would not bound it, and the
// tokenizer skips (and so would not colour) a longer line.
export const CODE_LIMITS = {lines: 30, columns: 80, chars: 2400, highlights: 8, heading: 50, caption: 160, lineUnits: 160} as const;

export {cellWidth, displayCells, forbiddenChar, bidiIn, bidiReorderIn} from '../chars';
import {forbiddenChar, bidiReorderIn, displayCells, hex} from '../chars';

/** One message per distinct forbidden character in `code` (first line it is on), at most 5. */
export const charIssues = (code: string): string[] => {
  const seen = new Set<number>(), out: string[] = [];
  code.split('\n').forEach((l, i) => {
    for (const ch of l) {
      const why = forbiddenChar(ch), cp = ch.codePointAt(0)!;
      if (why && !seen.has(cp)) { seen.add(cp); out.push(`code has ${why} ${hex(cp)} on line ${i + 1}: remove it`); }
    }
  });
  return out.slice(0, 5);
};
/** "N" or "N-M" (1-based, inclusive) to a range; null when the text is not of that form. Range checks are separate (`rangeIssue`). */
export const parseLines = (s: string): {from: number; to: number} | null => {
  const m = /^\s*(\d{1,6})(?:\s*-\s*(\d{1,6}))?\s*$/.exec(s);
  if (!m) return null;
  return {from: +m[1], to: m[2] === undefined ? +m[1] : +m[2]};
};

/** What is wrong with a `lines` value for code of `count` lines, or null. */
export const rangeIssue = (s: string, count: number): string | null => {
  const r = parseLines(s);
  if (!r) return `"${s}" is not a line or a range like "3" or "3-5"`;
  if (r.from < 1) return `"${s}": line numbers start at 1`;
  if (r.to < r.from) return `"${s}" runs backwards`;
  if (r.to > count) return `"${s}" is past line ${count}`;
  return null;
};

export const CodeHighlight = z.strictObject({
  lines: z.string().describe('The lines to point at: "4" or "4-6" (1-based, inclusive, within the code; ranges may overlap or repeat)'),
  label: text('What this part does, in words the narration says: the highlight moves here when they are spoken'),
});

export const CodeVisual = z.strictObject({
  type: z.literal('code'),
  heading: text('Scene heading').max(CODE_LIMITS.heading),
  language: z.enum(CODE_LANGUAGES).describe('Colouring: ts, tsx, js, jsx, python, go, rust, java, sql, bash, json, yaml, diff, or "text" for none'),
  code: z.string().describe('The code, shown as written: at most 30 lines of 80 display cells (East Asian wide characters and emoji count 2) and 2400 characters excluding line breaks, indented with spaces (no tabs), no leading or trailing blank lines, no invisible or direction-changing characters. Never trimmed: too much is an error'),
  highlights: z.array(CodeHighlight).min(1).max(CODE_LIMITS.highlights).describe('Parts to point at, each taking the spotlight when its label is spoken'),
  caption: text('Line under the code').max(CODE_LIMITS.caption).optional(),
}).describe('A code excerpt with syntax colouring and a spotlight that moves as the narration names its parts; 2D only').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  const lines = v.code.split('\n');
  const bad = charIssues(v.code);
  bad.forEach((m) => add(['code'], m));
  // empty once invisible characters are ignored too
  if (![...v.code].filter((ch) => !forbiddenChar(ch)).join('').trim()) return add(['code'], 'code is empty');
  if (v.code.includes('\t')) add(['code'], 'code has a tab: indent with spaces');
  if (v.code.includes('\r')) add(['code'], 'code has a carriage return: use plain line breaks');
  if (/^[ ]*\n/.test(v.code)) add(['code'], 'code starts with a blank line: remove leading blank lines');
  if (v.code !== v.code.trimEnd()) add(['code'], 'code ends with a blank line or trailing space: remove trailing blank lines');
  if (lines.length > CODE_LIMITS.lines) add(['code'], `code has ${lines.length} lines; the limit is ${CODE_LIMITS.lines}`);
  const chars = [...v.code].length - (lines.length - 1);
  if (chars > CODE_LIMITS.chars) add(['code'], `code has ${chars} characters (line breaks not counted); the limit is ${CODE_LIMITS.chars}`);
  const texts: [string[], string][] = [[['heading'], v.heading], ...v.highlights.map((h, i): [string[], string] => [['highlights', String(i), 'label'], h.label]), ...(v.caption ? [[['caption'], v.caption] as [string[], string]] : [])];
  texts.forEach(([path, t]) => {
    const b = bidiReorderIn(t);
    if (b.length) add(path.map((p) => (/^\d+$/.test(p) ? +p : p)), `${path[path.length - 1]} has reordering direction controls (${b.join(', ')}): remove them (the marks U+200E, U+200F and U+061C are fine)`);
  });
  lines.forEach((l, i) => {
    if (l.length > CODE_LIMITS.lineUnits) add(['code'], `line ${i + 1} is ${l.length} UTF-16 units long (combining marks count); the limit is ${CODE_LIMITS.lineUnits}`);
    const n = displayCells(l);
    if (n > CODE_LIMITS.columns) add(['code'], `line ${i + 1} is ${n} display cells wide (wide East Asian characters and emoji count 2); the limit is ${CODE_LIMITS.columns}`);
  });
  v.highlights.forEach((h, i) => {
    const issue = rangeIssue(h.lines, lines.length);
    if (issue) add(['highlights', i, 'lines'], issue);
  });
});
