// Runs tests/vectors/text.json against the TypeScript word-matching functions (no framework):
//   node_modules/.bin/tsx tests/vectors/text.test.ts
// The same file is checked against the Python versions by test_timing.py. Exits non-zero on any mismatch.
import {readFileSync} from 'node:fs';
import {normWord, arVariants, sameWord, normName} from '../../src/schema';

const v = JSON.parse(readFileSync(new URL('./text.json', import.meta.url), 'utf8'));
let bad = 0, total = 0;
const check = (fn: string, input: unknown, got: unknown, want: unknown) => {
  total++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    bad++;
    console.error(`MISMATCH ${fn}(${JSON.stringify(input)}): TypeScript ${JSON.stringify(got)}, Python ${JSON.stringify(want)}`);
  }
};
for (const [x, want] of v.norm) check('norm', x, normWord(x), want);
for (const [x, want] of v.ar_variants) check('ar_variants', x, [...arVariants(x)].sort(), want);
for (const [a, b, want] of v.word_eq) check('word_eq', [a, b], sameWord(a, b), want);
for (const [x, want] of v.norm_name) check('norm_name', x, normName(x), want);
for (const [fn, x, , ts] of v.known_disagreements) check(`known_disagreement ${fn}`, x, normName(x), ts);
console.log(`text vectors: ${total - bad}/${total} ok`);
if (bad) throw new Error(`${bad} check(s) failed`);
