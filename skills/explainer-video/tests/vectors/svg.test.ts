// Runs tests/vectors/svg.json against the SVG subset parser (no framework):
//   node_modules/.bin/tsx tests/vectors/svg.test.ts
// accept cases must parse (and list the part ids given); reject cases must fail with a message containing `expect`.
// Size, depth and element-count limits are generated here. Exits non-zero on any mismatch.
import {readFileSync} from 'node:fs';
import {parseSvg, LIMITS, COLOR_TOKENS, checkTree, leaves} from '../../src/visuals/svg/parse';
import theme from '../../src/theme.json';

const v = JSON.parse(readFileSync(new URL('./svg.json', import.meta.url), 'utf8')) as {
  accept: {name: string; svg: string; parts: string[]}[]; reject: {name: string; svg: string; expect: string}[];
};
let bad = 0, total = 0;
const fail = (msg: string) => { bad++; console.error('FAIL ' + msg); };
const T = (cond: boolean, msg: string) => { total++; if (!cond) fail(msg); };

for (const c of v.accept) {
  const r = parseSvg(c.svg);
  T(r.ok, `accept "${c.name}": rejected with ${r.ok ? '' : r.errors.join(' | ')}`);
  if (r.ok) {
    T(JSON.stringify(r.doc.parts) === JSON.stringify(c.parts), `accept "${c.name}": parts ${JSON.stringify(r.doc.parts)} != ${JSON.stringify(c.parts)}`);
    T(checkTree(r.doc.children).length === 0, `accept "${c.name}": checkTree: ${checkTree(r.doc.children).join(',')}`);
  }
}
for (const c of v.reject) {
  const r = parseSvg(c.svg);
  T(!r.ok, `reject "${c.name}": was accepted`);
  if (!r.ok) T(r.errors.join(' | ').includes(c.expect), `reject "${c.name}": errors ${JSON.stringify(r.errors)} do not mention ${JSON.stringify(c.expect)}`);
}

// generated limits
const wrap = (b: string, vb = '0 0 1700 560') => `<svg viewBox="${vb}">${b}</svg>`;
const rect = '<rect width="5" height="5"/>';
const rejects = (name: string, svg: string, expect: string) => {
  const r = parseSvg(svg);
  T(!r.ok && r.errors.join(' | ').includes(expect), `limit "${name}": ${r.ok ? 'accepted' : JSON.stringify(r.errors)} (wanted ${expect})`);
};
const accepts = (name: string, svg: string) => { const r = parseSvg(svg); T(r.ok, `limit "${name}": ${r.ok ? '' : JSON.stringify(r.errors)}`); };
accepts('299 shapes', wrap(rect.repeat(299)));
rejects('301 elements', wrap(rect.repeat(300)), 'more than 300 elements');
const nest = (d: number) => '<g>'.repeat(d) + rect + '</g>'.repeat(d);
accepts('depth 6 (svg + 4 groups + rect)', wrap(nest(4)));
rejects('depth 7', wrap(nest(5)), 'nested');
rejects('depth 30', wrap(nest(30)), 'nested');
rejects('25KB', wrap(`<text x="1" y="1">${'a'.repeat(80)}</text>`.repeat(250)), 'bytes');
accepts('~23KB', wrap(`<text x="1" y="1">${'a'.repeat(80)}</text>`.repeat(220)));
rejects('d of 4001 chars', wrap(`<path d="M0 0 ${'L1 1 '.repeat(800)}"/>`), 'limit 4000');
accepts('d near the limit', wrap(`<path d="M0 0 ${'L1 1 '.repeat(790)}"/>`));
accepts('text of 80 chars', wrap(`<text x="1" y="1">${'a'.repeat(80)}</text>`));
accepts('viewBox 100 and 4000', wrap(rect, '0 0 100 4000'));
rejects('viewBox 99', wrap(rect, '0 0 99 100'), 'viewBox width and height');
rejects('viewBox 4001', wrap(rect, '0 0 4001 100'), 'viewBox width and height');
rejects('markup of 30KB', wrap('<!-- ' + 'x'.repeat(30000) + '-->'), 'bytes');
rejects('non-string', undefined as unknown as string, 'string');

// the colour vocabulary is exactly the theme's colours (plus none), so nothing the markup says can leave the palette
T(JSON.stringify([...COLOR_TOKENS].sort()) === JSON.stringify(Object.keys(theme.C).sort()), `COLOR_TOKENS ${COLOR_TOKENS} != theme.json C keys ${Object.keys(theme.C)}`);
T(LIMITS.parts === 16, 'parts limit');

// normalisation: defaults are resolved in the tree
{
  const r = parseSvg(wrap('<rect width="5" height="5"/><path d="M0 0 L5 5"/><text x="1" y="1">a</text>'));
  if (r.ok) {
    const [a, b, c] = r.doc.children;
    T(a.attrs.fill === 'panel' && a.attrs.stroke === 'ink' && a.attrs['stroke-width'] === 4, 'defaults of a closed shape');
    T(b.attrs.fill === 'none' && b.attrs.stroke === 'ink', 'defaults of a path');
    T(c.attrs.font === 'sans' && c.attrs.size === 'body' && c.attrs.fill === 'ink', 'defaults of text');
    T(leaves(c).length === 1, 'leaves');
  } else fail('defaults case did not parse');
}

console.log(`svg vectors: ${total - bad}/${total} ok`);
if (bad) throw new Error(`${bad} check(s) failed`);
