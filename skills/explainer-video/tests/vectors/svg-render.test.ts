// Theme, reveal and geometry checks of the svg visual's pure parts (no framework):
//   node_modules/.bin/tsx tests/vectors/svg-render.test.ts
// - every colour, width, font and size the style mapping can produce stays inside the theme, at any scale, left to right and right to left
// - the reveal state is a monotonic pure function of the frame; effects are picked from what a part contains
// - the view source never builds markup (no dangerouslySetInnerHTML, no <Img>, no colour literals)
import {readFileSync, readdirSync} from 'node:fs';
import {parseSvg, effectOf, leaves, type SvgNode} from '../../src/visuals/svg/parse';
import {styleOf, colorOf, hasShadow, shadowOffset, SIZE_PX, type Theme} from '../../src/visuals/svg/style';
import {revealProgress, revealFrame, popScale, REVEAL_FRAMES} from '../../src/visuals/svg/reveal';
import {boxOf, pathPoints} from '../../src/visuals/svg/geometry';
import theme from '../../src/theme.json';

const th: Theme = {C: theme.C, FONT: theme.FONT, MONO: theme.MONO, BORDER: theme.BORDER, SHADOW: theme.SHADOW};
const v = JSON.parse(readFileSync(new URL('./svg.json', import.meta.url), 'utf8')) as {accept: {name: string; svg: string}[]};
let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

// ---- theme: nothing leaves the palette ----
const palette = new Set([...Object.values(th.C), 'none']);
const KEYS = new Set(['fill', 'stroke', 'strokeWidth', 'strokeLinejoin', 'strokeLinecap', 'fontFamily', 'fontSize', 'fontWeight', 'textAnchor', 'direction']);
const walk = (n: SvgNode, f: (n: SvgNode) => void) => { if (n.tag !== '#text') f(n); n.children.forEach((c) => walk(c, f)); };
let leafCount = 0;
for (const c of v.accept) {
  const r = parseSvg(c.svg);
  if (!r.ok) continue;
  for (const scale of [0.4, 1, 2.3]) for (const rtl of [false, true]) {
    r.doc.children.forEach((n) => walk(n, (x) => {
      if (x.tag === 'g') return;
      leafCount++;
      const s = styleOf(x, th, scale, rtl);
      for (const k of Object.keys(s)) T(KEYS.has(k), `${c.name}: unexpected style key ${k}`);
      for (const k of ['fill', 'stroke'] as const) if (k in s) T(palette.has(String(s[k])), `${c.name}: ${k}=${s[k]} is not a theme colour`);
      if ('strokeWidth' in s) T([2, 4].includes(Math.round(Number(s.strokeWidth) * scale * 1000) / 1000), `${c.name}: stroke width ${Number(s.strokeWidth) * scale}px`);
      if ('strokeLinejoin' in s) T(s.strokeLinejoin === 'miter' && s.strokeLinecap === 'square', `${c.name}: join/cap`);
      if ('fontFamily' in s) T(s.fontFamily === th.FONT || s.fontFamily === th.MONO, `${c.name}: font ${s.fontFamily}`);
      if ('fontSize' in s) T((Object.values(SIZE_PX) as number[]).includes(Math.round(Number(s.fontSize) * scale * 1000) / 1000), `${c.name}: font size ${Number(s.fontSize) * scale}px`);
      if (x.tag === 'text') T(rtl ? s.direction === 'rtl' : !('direction' in s), `${c.name}: direction`);
    }));
  }
}
T(leafCount > 100, `only ${leafCount} leaves styled`);
let threw = false;
try { colorOf(th, '#ff0000'); } catch { threw = true; }
T(threw, 'colorOf accepts a hex colour');
threw = false;
try { colorOf(th, 'red'); } catch { threw = true; }
T(threw, 'colorOf accepts a CSS colour name');
T(colorOf(th, 'none') === 'none' && colorOf(th, 'primary') === th.C.primary, 'colorOf maps tokens');

// shadow: closed filled shapes with an ink stroke, mirrored in rtl
{
  const r = parseSvg('<svg viewBox="0 0 400 200"><rect width="5" height="5"/><rect width="5" height="5" fill="none"/><rect width="5" height="5" stroke="danger"/><path d="M0 0 L5 5"/></svg>');
  if (r.ok) T(JSON.stringify(r.doc.children.map(hasShadow)) === '[true,false,false,false]', 'hasShadow');
  const a = shadowOffset(th, 2, false), b = shadowOffset(th, 2, true);
  T(a.dx === th.SHADOW / 2 && a.dy === th.SHADOW / 2 && b.dx === -a.dx && b.dy === a.dy, 'shadow offset and its mirror');
}

// ---- reveal: pure, monotonic ----
for (const effect of ['draw', 'fade', 'pop'] as const) {
  let last = 0;
  T(revealProgress(10, 10, effect) === 0 && revealProgress(-5, 10, effect) === 0, `${effect}: 0 before and at its frame`);
  for (let f = 10; f < 80; f++) {
    const p = revealProgress(f, 10, effect);
    T(p >= last - 1e-12 && p >= 0 && p <= 1, `${effect}: monotonic in [0,1] at frame ${f} (${p} after ${last})`);
    last = p;
  }
  T(Math.abs(revealProgress(80, 10, effect) - 1) < 1e-3, `${effect}: settles at 1 (${revealProgress(80, 10, effect)})`);
  T(revealProgress(10 + REVEAL_FRAMES, 10, effect) > 0.5, `${effect}: well under way after ${REVEAL_FRAMES} frames`);
  T(revealProgress(25, 10, effect) === revealProgress(25, 10, effect), `${effect}: deterministic`);
}
T(popScale(5, 10, 'pop') === 0.8 && Math.abs(popScale(120, 10, 'pop') - 1) < 1e-3 && popScale(25, 10, 'draw') === 1, 'popScale');
T(Math.max(...Array.from({length: 60}, (_, i) => popScale(10 + i, 10, 'pop'))) > 1, 'pop overshoots a little');
T(revealFrame(1, 4, 11, 300, [0.5, 1.25]) === 11 + Math.round(1.25 * 30), 'revealFrame uses the narration time');
T(revealFrame(2, 4, 11, 300, [0.5]) === 11 + Math.round((2 / 4) * 300 * 0.8), 'revealFrame spreads when there is no time');

// ---- effect choice ----
const eff = (body: string) => { const r = parseSvg(`<svg viewBox="0 0 400 200"><g id="a">${body}</g></svg>`); return r.ok ? effectOf(r.doc.children[0]) : 'ERR ' + r.errors; };
T(eff('<line x1="0" y1="0" x2="9" y2="9"/><path d="M0 0 L5 5"/><polyline points="0,0 1,1"/>') === 'draw', 'strokes draw');
T(eff('<path d="M0 0 L5 5" fill="primary"/>') === 'pop', 'a filled path pops');
T(eff('<text x="1" y="1">a</text><text x="1" y="9">b</text>') === 'fade', 'text fades');
T(eff('<rect width="5" height="5"/>') === 'pop', 'a rect pops');
T(eff('<line x1="0" y1="0" x2="9" y2="9"/><text x="1" y="1">a</text>') === 'pop', 'mixed pops');
T(eff('') === 'fade', 'an empty part');
{
  const r = parseSvg('<svg viewBox="0 0 400 200"><g id="a"><rect width="5" height="5"/><text x="1" y="1">a</text></g></svg>');
  if (r.ok) T(leaves(r.doc.children[0]).length === 2, 'leaves');
}

// ---- geometry ----
{
  const r = parseSvg('<svg viewBox="0 0 1000 400"><g id="a" transform="translate(100 50)"><rect x="10" y="20" width="30" height="40"/></g><g id="b"><path d="M 10 10 l 20 0 v 30 c 5 5 10 5 15 15 z"/></g><g id="c"><text x="500" y="100" text-anchor="middle" size="body">abcd</text></g><g id="d" transform="rotate(90)"><rect width="10" height="20"/></g></svg>');
  if (r.ok) {
    const [a, b, c, d] = r.doc.children.map((n) => boxOf(n, 1)!);
    T(a.x0 === 110 && a.y0 === 70 && a.x1 === 140 && a.y1 === 110, `box with translate ${JSON.stringify(a)}`);
    T(b.x0 === 10 && b.y0 === 10 && b.x1 === 45 && b.y1 === 55, `path box ${JSON.stringify(b)}`);
    T(c.x0 < 500 && c.x1 > 500 && Math.abs((c.x0 + c.x1) / 2 - 500) < 1e-6, `text box centred ${JSON.stringify(c)}`);
    T(Math.abs(d.x0 + 20) < 1e-9 && Math.abs(d.x1) < 1e-9 && Math.abs(d.y1 - 10) < 1e-9, `rotated box ${JSON.stringify(d)}`);
    T(boxOf(r.doc.children[0], 2)!.x0 === 110, 'rect box does not depend on scale');
    T(boxOf(r.doc.children[2], 2)!.x1 - boxOf(r.doc.children[2], 2)!.x0 < boxOf(r.doc.children[2], 1)!.x1 - boxOf(r.doc.children[2], 1)!.x0, 'text box shrinks in viewBox units when the drawing is scaled up');
  } else console.error(r.errors);
  T(pathPoints('M 0 0 H 10 V 5 h -3 v 2').length === 5, 'pathPoints counts H V');
  T(JSON.stringify(pathPoints('M 1e3 0 L 5 5')) === '[[1000,0],[5,5]]', 'pathPoints reads exponents');
}

// ---- the view builds elements, never markup, never colour literals ----
const dir = new URL('../../src/visuals/svg/', import.meta.url);
for (const f of readdirSync(dir)) {
  if (!/\.(ts|tsx)$/.test(f) || f === 'meta.ts') continue;
  const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  T(!/dangerouslySetInnerHTML|innerHTML|<Img\b|<img\b|foreignObject|eval\(|new Function/.test(src), `${f}: builds markup or loads an image`);
  if (/^(View2D\.tsx|style\.ts|reveal\.ts|geometry\.ts)$/.test(f)) T(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(src.replace(/url\(#/g, '')), `${f}: colour literal`);
}

console.log(`svg render checks: ${total - bad}/${total} ok`);
if (bad) throw new Error(`${bad} check(s) failed`);
