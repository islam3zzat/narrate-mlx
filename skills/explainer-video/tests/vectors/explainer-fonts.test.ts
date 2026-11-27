import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Source-level guard for the font gate on composition roots. React Flow measures node handles when nodes mount and
 * never re-measures fixed-size nodes when a font swaps in, so the scene tree must not mount before loadFonts settles
 * (edge/s14_c_1970 flipped between two outputs when it did). There is no React DOM harness, so check the source shape.
 */
const src = (f: string) => fs.readFileSync(path.resolve(process.cwd(), 'src', f), 'utf8');

for (const [file, label] of [['Explainer.tsx', 'fonts'], ['CatalogScene.tsx', 'catalog-fonts']] as const) {
  const code = src(file);
  const gate = code.match(/const (\w+) = useFontGate\(rtl, '([\w-]+)'\);/);
  assert.ok(gate, `${file}: must gate the scene tree with useFontGate(rtl, ...)`);
  assert.equal(gate![2], label, `${file}: delayRender label`);
  const ready = gate![1];
  assert.match(code, new RegExp(`if \\([^)]*!${ready}\\) return <AbsoluteFill style=\\{\\{background: theme\\.C\\.bg\\}\\} />;`),
    `${file}: must return the background placeholder while !${ready}`);
  // releasing the handle from the load promise lets Remotion capture a frame before the gated tree commits
  assert.doesNotMatch(code, /loadFonts\([^)]*\)\s*\.(?:then|finally)\([^;]*continueRender/s,
    `${file}: continueRender must not run inside a loadFonts(...).then/.finally callback`);
  assert.doesNotMatch(code, /\bdelayRender\(/, `${file}: the fonts handle belongs to useFontGate`);
}

const theme = src('theme.ts');
const hook = theme.slice(theme.indexOf('export const useFontGate'));
assert.ok(hook.length > 0 && theme.includes('export const useFontGate'), 'theme.ts: useFontGate exported');
// the only promise-side release is for a render pass that never committed (discarded Suspense pass)
assert.match(hook, /loadFonts\(rtl\)\.finally\(\(\) => \{\s*requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{\s*if \(!committed\.current && !h\.released\)/,
  'theme.ts: the promise may release the handle only for an uncommitted pass');
assert.match(hook, /React\.useEffect\(\(\) => \(\) => release\(\), \[release\]\);/, 'theme.ts: unmount must release the handle');
assert.match(hook, /React\.useEffect\(\(\) => \{ if \(ready\) release\(\); \}, \[ready, release\]\);/,
  'theme.ts: a committed pass releases in an effect once ready');
assert.match(theme, /\.finally\(\(\) => \{ fontsDone\.add\(arabic\); \}\)/, 'theme.ts: loadFonts records settled font sets');

console.log('explainer font gate checks passed');
