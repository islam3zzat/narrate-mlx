// Checks of the code visual's pure parts (no framework):
//   node_modules/.bin/tsx tests/vectors/code.test.ts
// - parseLines/rangeIssue: "N" and "N-M", and what is wrong with the rest
// - tokenize: deterministic, lossless (tokens of a line join to the line), coloured for each language, plain for `text`
// - the theme uses only palette colours, and the view source has no colour literals
import {readFileSync} from 'node:fs';
import {parseLines, rangeIssue, CODE_LANGUAGES, CODE_LIMITS, cellWidth, displayCells, charIssues, forbiddenChar, bidiIn, bidiReorderIn} from '../../src/visuals/code/schema';
import {tokenize, plainTokens, TOKENIZE_OPTIONS, CODE_THEME, CODE_COLORS, codeColorsFor, mix} from '../../src/visuals/code/highlight';
import {THEME_SPECS} from '../../src/themes';
import {spotlight} from '../../src/visuals/code/spotlight';
import theme from '../../src/theme.json';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

// ---- line ranges ----
T(JSON.stringify(parseLines('3')) === '{"from":3,"to":3}', 'single line');
T(JSON.stringify(parseLines('3-5')) === '{"from":3,"to":5}', 'range');
T(JSON.stringify(parseLines(' 3 - 5 ')) === '{"from":3,"to":5}', 'range with spaces');
for (const s of ['', 'a', '3-', '-3', '3-5-7', '3,5', '1.5', '3 5']) T(parseLines(s) === null, `parseLines(${JSON.stringify(s)}) is null`);
T(rangeIssue('1', 1) === null && rangeIssue('2-3', 3) === null && rangeIssue('3-3', 3) === null, 'valid ranges');
T(rangeIssue('12-14', 9) === '"12-14" is past line 9', 'past the end');
T(/start at 1/.test(rangeIssue('0', 9)!), 'zero');
T(/runs backwards/.test(rangeIssue('5-3', 9)!), 'backwards');
T(/not a line/.test(rangeIssue('x', 9)!), 'garbage');

// ---- tokenize ----
const SAMPLES: Record<(typeof CODE_LANGUAGES)[number], string> = {
  ts: 'const x: number = 1; // note\nfunction f(a: string) {\n  return "s" + a;\n}',
  tsx: 'const a = <div className="x">{n}</div>;',
  js: 'let a = 1;\nconsole.log("hi", a);',
  jsx: 'const b = <A b="c" />;',
  python: 'def f(x):\n    # note\n    return "a" + str(1)',
  go: 'func main() {\n    fmt.Println("x", 1)\n}',
  rust: 'fn main() {\n    let x = 1; // note\n}',
  java: 'class A {\n    int x = 1;\n}',
  sql: "SELECT a FROM b WHERE c = 'x' AND d > 1;",
  bash: 'echo "hi" | grep x # note',
  json: '{"a": [1, true, null], "b": "c"}',
  yaml: 'a: 1\nb: "x"\n# note',
  diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new',
  text: 'plain text\n\n  indented  ',
};
const palette = new Set(Object.values(CODE_COLORS).map((c) => c.toLowerCase()));
for (const lang of CODE_LANGUAGES) {
  const code = SAMPLES[lang];
  const a = tokenize(code, lang), b = tokenize(code, lang);
  T(JSON.stringify(a) === JSON.stringify(b), `${lang}: deterministic`);
  T(a.length === code.split('\n').length, `${lang}: one entry per line`);
  T(a.map((l) => l.map((t) => t.content).join('')).join('\n') === code, `${lang}: lossless`);
  const colours = new Set(a.flat().map((t) => t.color));
  for (const c of colours) T(palette.has(c), `${lang}: ${c} is not a theme colour`);
  if (lang === 'text') T(colours.size === 1, 'text: one colour');
  else if (lang !== 'tsx' && lang !== 'jsx') T(colours.size >= 2, `${lang}: coloured (${colours.size} colours)`);
  else T(colours.size >= 1, `${lang}: tokens`);
}
const celPalette = new Set(Object.values(codeColorsFor(THEME_SPECS['cel-sky'].C)).map((c) => c.toLowerCase()));
for (const c of tokenize(SAMPLES.ts, 'ts', undefined, 'cel-sky').flat().map((t) => t.color)) {
  T(celPalette.has(c), `cel-sky ts: ${c} is not in cel-sky code palette`);
}

// ---- display cells ----
T(displayCells('abc') === 3 && displayCells('漢字') === 4 && displayCells('ｗ') === 2 && displayCells('한') === 2 && displayCells('😀') === 2, 'wide and emoji count 2');
T(displayCells('é') === 1 && displayCells('a️') === 1, 'combining marks and variation selectors count 0');
T(cellWidth(0x20) === 1 && cellWidth(0x1f600) === 2 && cellWidth(0x3042) === 2 && cellWidth(0xe9) === 1, 'cellWidth');
T(forbiddenChar('‮') !== null && forbiddenChar('​') !== null && forbiddenChar('\x00') !== null && forbiddenChar('\ud800') !== null && forbiddenChar('a') === null && forbiddenChar('漢') === null && forbiddenChar('\n') === null, 'forbiddenChar');
for (const c of ['\u{e0041}', '\u00ad', '\u2064', '\u3164', '\u115f', '\u1160', '\uffa0', '\u2800', '\u034f', '\ufe0f', '\u{e0100}', '\u180e', '\ufff9']) T(forbiddenChar(c) !== null, `forbiddenChar U+${c.codePointAt(0)!.toString(16)}`);
for (const c of ['é', '漢', '😀', 'א', 'λ', '→']) T(forbiddenChar(c) === null, `forbiddenChar allows ${c}`);
T(bidiReorderIn('a\u202eb\u2067').join() === 'U+202E,U+2067' && bidiReorderIn('a\u200fb').length === 0 && bidiIn('a\u202eb').length === 0, 'bidiReorderIn vs bidiIn');
T(charIssues('a\nb‮').join() === 'code has a bidirectional control U+202E on line 2: remove it', 'charIssues names character and line');
T(bidiIn('x‏y‏').join() === 'U+200F' && bidiIn('plain').length === 0, 'bidiIn');
T(CODE_LIMITS.lines * CODE_LIMITS.columns === CODE_LIMITS.chars, '30 x 80 is reachable under the character cap');

// ---- tokenize: robustness ----
const boom = {codeToTokensBase: () => { throw new Error('boom'); }};
T(JSON.stringify(tokenize('a = 1\nb', 'python', boom as any)) === JSON.stringify(plainTokens('a = 1\nb')), 'a throwing highlighter gives plain tokens');
const lossy = {codeToTokensBase: () => [[{content: 'x', color: '#ff0000'}]]};
T(JSON.stringify(tokenize('a = 1', 'python', lossy as any)) === JSON.stringify(plainTokens('a = 1')), 'tokens that do not rebuild the code give plain tokens');
T(plainTokens('a\n\nb').length === 3 && plainTokens('a')[0][0].color === CODE_COLORS.text, 'plainTokens');
T(TOKENIZE_OPTIONS.tokenizeTimeLimit >= 1e8 && TOKENIZE_OPTIONS.tokenizeMaxLineLength > CODE_LIMITS.lineUnits, 'tokenizer limits do not depend on load');

// ---- tokenize: hostile 80-column lines finish quickly and the same way twice ----
const fillTo = (unit: string) => unit.repeat(Math.ceil(80 / unit.length)).slice(0, 80);
const UNITS = [' ', '\\', '$(', '${', "'", '"', '`', '#', '-', ':', '/*', '*/', '<!--', '(', '[', '{', '"""', "'''", '\\\\"', '$((', '<<', '=>', '\\u', "' \\", '--', '/', '<', '>', '&&', 'a<', ')] '];
for (const lang of CODE_LANGUAGES) {
  const rows = UNITS.flatMap((u) => [fillTo(u), fillTo(u + 'a'), fillTo('a' + u), ('a ' + u).repeat(40).slice(0, 80)]);
  const sources = [rows.slice(0, 30).join('\n'), rows.slice(30, 60).join('\n'), rows.slice(60, 90).join('\n'), rows.slice(90).join('\n')];
  const run = () => { const t = performance.now(); const out = sources.map((s) => JSON.stringify(tokenize(s, lang))).join('|'); return {out, ms: performance.now() - t}; };
  const a = run(), b = run();
  T(a.out === b.out, `${lang}: hostile lines give identical output on two runs`);
  T(a.ms < 2000 && b.ms < 2000, `${lang}: hostile lines tokenize in under 2 s (${Math.round(a.ms)} / ${Math.round(b.ms)} ms)`);
}

// ---- theme: only the palette ----
const C = Object.values(theme.C).map((c) => c.toLowerCase());
const hex = /#[0-9a-fA-F]{3,8}\b/g;
const themeColors = JSON.stringify(CODE_THEME).match(hex) ?? [];
for (const c of themeColors) T(C.includes(c.toLowerCase()) || palette.has(c.toLowerCase()), `theme colour ${c} is not derived from the palette`);
T(CODE_COLORS.comment === mix(theme.C.dim, theme.C.panel, 0.45) && CODE_COLORS.comment !== theme.C.dim, 'comment colour is the lightened dim');
T(CODE_COLORS.bg === theme.C.ink && CODE_COLORS.text === theme.C.panel && CODE_COLORS.keyword === theme.C.secondary && CODE_COLORS.string === theme.C.accent && CODE_COLORS.number === theme.C.primary, 'colour roles');

// ---- the view source has no colour literals ----
for (const f of ['View2D.tsx', 'highlight.ts']) {
  const src = readFileSync(new URL(`../../src/visuals/code/${f}`, import.meta.url), 'utf8');
  T(!/#[0-9a-fA-F]{3,8}\b/.test(src.replace(/\/\/.*$/gm, '')), `${f}: colour literal`);
  T(!/\b(rgb|rgba|hsl)\(/.test(src), `${f}: rgb/hsl literal`);
}

// ---- spotlight: a pure function of the frame ----
const stops = [{at: 30, from: 2, to: 3, scroll: 0, label: 'a'}, {at: 90, from: 5, to: 5, scroll: 1, label: 'b'}];
const s0 = spotlight(stops, 0), s1 = spotlight(stops, 100), s2 = spotlight(stops, 500);
T(s0.band === 0 && s0.line(1) === 1 && s0.line(9) === 1, 'before the first highlight everything is at full strength');
T(spotlight(stops, 29).band === 0, 'band absent just before the first stop');
T(s2.band === 1 && s2.from === 5 && s2.to === 5 && s2.scroll === 1, 'settled on the last stop');
T(s2.line(5) === 1 && s2.line(2) < 0.5, 'others dim once settled');
T(s1.from > 2 && s1.from < 5, 'mid-move sits between ranges');
T(JSON.stringify([spotlight(stops, 100).from, spotlight(stops, 100).scroll]) === JSON.stringify([s1.from, s1.scroll]), 'same frame, same state');
let prevFrom = 2;
for (let f = 90; f <= 110; f++) { const x = spotlight(stops, f).from; T(x >= prevFrom - 1e-9, `band moves monotonically at frame ${f}`); prevFrom = x; }

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
