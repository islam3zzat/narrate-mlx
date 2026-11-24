// Checks of the stat visual's pure parts (no framework):
//   node_modules/.bin/tsx tests/vectors/stat.test.ts
// - formatNumber / formatStat / inferDecimals: fixed decimals, grouping, rounding, no "-0"
// - counterValue / countFrames: exact at the end, monotonic, constant string length
// - axisMax / barFraction / percentChange / delta
// - the character rules moved to chars.ts are the same ones `code` exports
import {formatNumber, formatStat, inferDecimals} from '../../src/visuals/stat/format';
import {counterValue, countFrames, axisMax, barFraction, percentChange, delta, COUNT_FRAMES, MIN_COUNT_FRAMES, type StatT} from '../../src/visuals/stat/count';
import {StatVisual} from '../../src/visuals/stat/schema';
import * as chars from '../../src/visuals/chars';
import * as code from '../../src/visuals/code/schema';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };
const S = (o: Partial<StatT> & {value: number}): StatT => ({label: 'x', ...o});

// ---- formatNumber ----
const F: [number, number, string][] = [
  [0, 0, '0'], [999, 0, '999'], [1000, 0, '1,000'], [1234567.891, 2, '1,234,567.89'], [-0.04, 1, '0.0'], [2.5, 0, '3'], [-2.5, 0, '-3'],
  [0.1 + 0.2, 1, '0.3'], [1e12, 0, '1,000,000,000,000'], [99.95, 1, '100.0'], [0, 2, '0.00'], [0.05, 2, '0.05'], [-1250.5, 1, '-1,250.5'], [12500.25, 2, '12,500.25'],
];
for (const [x, d, want] of F) T(formatNumber(x, d) === want, `formatNumber(${x}, ${d}) = ${formatNumber(x, d)}, want ${want}`);
T(formatStat(99.9, 1, '%') === '99.9%', 'no space before %');
T(formatStat(180, 0, 'ms') === '180 ms', 'space before ms');
T(formatStat(3, 0, 'x') === '3x', 'no space before x');
T(formatStat(12500, 0) === '12,500', 'no unit');
T(inferDecimals(0.1) === 1 && inferDecimals(12) === 0 && inferDecimals(1.25) === 2 && inferDecimals(1e-7) === 99 && inferDecimals(1.5, 2.25) === 2 && inferDecimals(5, undefined) === 0, 'inferDecimals');

// ---- counter ----
const start = 100, len = 36;
T(counterValue(0, start, len, 0, 500) === 0 && counterValue(start, start, len, 0, 500) === 0, 'starts at from0');
T(counterValue(start + len, start, len, 0, 500) === 500 && counterValue(start + len + 50, start, len, 0, 500) === 500, 'ends exactly at the value');
for (const [a, b] of [[0, 500], [420, 180], [3, 3.5]]) {
  let prev = a;
  for (let f = start; f <= start + len + 2; f++) {
    const v = counterValue(f, start, len, a, b);
    T(b >= a ? v >= prev - 1e-9 : v <= prev + 1e-9, `counter ${a}->${b} is monotonic at ${f}`);
    prev = v;
  }
}
// a fixed decimals count keeps the shape of the string: same number of digits after the point at every frame
{
  const shapes = new Set<number>();
  for (let f = start - 2; f <= start + len + 2; f++) shapes.add(formatNumber(counterValue(f, start, len, 0, 99.9), 1).split('.')[1].length);
  T(shapes.size === 1, 'same decimals at every frame');
}
T(countFrames(100, 10, 400) === COUNT_FRAMES, 'long audio: full count');
T(countFrames(405, 10, 400) === MIN_COUNT_FRAMES, 'late reveal: the minimum');
T(countFrames(390, 10, 400) === 20 && countFrames(500, 10, 400) === MIN_COUNT_FRAMES, 'shortened near the end of the audio');
for (let s = 10; s < 410; s += 7) {
  const n = countFrames(s, 10, 400), end = 10 + 400 + 16 - 1; // last frame of the scene
  T(s + n <= end || s + MIN_COUNT_FRAMES > end, `the count ends before the scene does (start ${s})`);
}

// ---- axis, bars, change ----
{
  const a = [S({value: 180, from: 420, unit: 'ms'}), S({value: 60, from: 95, unit: 'ms'}), S({value: 5})];
  const ax = axisMax(a);
  T(ax[0] === 420 && ax[1] === 420 && ax[2] === 0, 'shared axis for equal units, none for a plain stat');
  const b = axisMax([S({value: 180, from: 420, unit: 'ms'}), S({value: 3.1, from: 2.4, unit: '%'})]);
  T(b[0] === 420 && b[1] === 3.1, 'own axis when units differ');
  T(axisMax([S({value: 97, from: 92, unit: '%', max: 100})])[0] === 100, 'max sets the axis');
  T(axisMax([S({value: 0, from: 0, unit: '%'})])[0] === 0 && barFraction(0, 0) === 0, 'zero axis: fraction 0, no NaN');
  T(barFraction(210, 420) === 0.5 && barFraction(900, 420) === 1 && barFraction(-1, 420) === 0, 'barFraction clamps');
}
T(Math.abs(percentChange(420, 180)! + 57.142857) < 1e-5 && percentChange(0, 5) === null, 'percentChange');
{
  const d1 = delta(S({value: 180, from: 420, unit: 'ms', better: 'down'}), 0);
  T(d1.dir === 'down' && d1.text === '-57%' && d1.tone === 'good' && d1.word === 'down · better', `delta 420->180: ${JSON.stringify(d1)}`);
  const d2 = delta(S({value: 120, from: 0, unit: 'ms'}), 0);
  T(d2.text === '+120 ms' && d2.tone === 'neutral' && d2.word === 'up', `delta from 0: ${JSON.stringify(d2)}`);
  T(delta(S({value: 100.04, from: 100}), 2).text === '<0.1%', 'tiny change');
  T(delta(S({value: 1250, from: 100}), 0).text === '+1,150%', 'big change grouped');
  const d3 = delta(S({value: 5, from: 5, better: 'up'}), 0);
  T(d3.text === 'no change' && d3.tone === 'neutral' && d3.word === '', 'no change');
  T(delta(S({value: 3.1, from: 2.4, unit: '%', better: 'down'}), 1).tone === 'bad' && delta(S({value: 3.1, from: 2.4, unit: '%', better: 'down'}), 1).word === 'up · worse', 'worse');
  T(delta(S({value: 180, from: 420, better: 'down', tone: 'bad'}), 0).tone === 'bad', 'explicit tone wins');
  T(delta(S({value: 2.5, from: 2}), 1).text === '+25%' && delta(S({value: 2.1, from: 2}), 1).text === '+5.0%', 'one decimal under 10%');
}

// ---- schema ----
const vis = (stats: object[], extra: object = {}) => ({type: 'stat', heading: 'h', stats, ...extra});
const ok = (v: object) => StatVisual.safeParse(v).success;
const msg = (v: object) => { const r = StatVisual.safeParse(v); return r.success ? '' : r.error.issues.map((i) => i.message).join(' | '); };
T(ok(vis([{label: 'Uptime', value: 99.9, unit: '%'}])), 'valid plain stat');
T(ok(vis([{label: 'p99', value: 180, from: 420, unit: 'ms', better: 'down'}])), 'valid before/after');
T(!ok(vis([])) && !ok(vis([1, 2, 3, 4, 5].map((i) => ({label: 'a' + i, value: i})))), 'one to four stats');
T(/decimal/.test(msg(vis([{label: 'a', value: 3.14159, decimals: 2}]))), 'explicit decimals never round');
T(/decimal/.test(msg(vis([{label: 'a', value: 0.12345}]))), 'more than 4 inferred decimals');
T(/too large/.test(msg(vis([{label: 'a', value: 1e13}]))), 'magnitude');
T(/0 or more/.test(msg(vis([{label: 'a', value: 5, from: -1}]))), 'negative from');
T(ok(vis([{label: 'a', value: -3, unit: 'dB'}])), 'plain negative is fine');
T(/max/.test(msg(vis([{label: 'a', value: 50, from: 10, max: 20}]))), 'max below value');
T(/duplicate/.test(msg(vis([{id: 'a', label: 'one', value: 1}, {id: 'a', label: 'two', value: 2}]))), 'duplicate id');
T(/display cells/.test(msg(vis([{label: 'x'.repeat(41), value: 1}]))), 'label of 41 cells');
T(/display cells/.test(msg(vis([{label: '漢'.repeat(21), value: 1}]))), 'label of 42 cells (wide)');
T(ok(vis([{label: 'x'.repeat(40), value: 1}])), 'label of 40 cells');
T(/unit/.test(msg(vis([{label: 'a', value: 1, unit: 'x'.repeat(13)}]))), 'unit of 13');
for (const [name, label] of [['zero-width', 'a​b'], ['bidi override', 'a‮b'], ['mark', 'a‎b'], ['newline', 'a\nb'], ['C1', 'a\u0085b']]) T(/U\+/.test(msg(vis([{label, value: 1}]))), `label with ${name} is an error`);
T(/U\+/.test(msg(vis([{label: 'a', value: 1}], {heading: 'a‮b'}))) && ok(vis([{label: 'a', value: 1}], {heading: 'a‎b'})), 'heading: reordering controls are errors, marks are not');
T(!ok(vis([{label: 'a', value: 1, bogus: 1}])), 'unknown field');
T(ok(vis([{label: 'a', value: 1e12}])) && ok(vis([{label: 'a', value: 1.2345, decimals: 4}])), 'edge values pass');
T(!ok(vis([{label: 'a', value: 1e12, decimals: 4}])), 'scaled magnitude');

// ---- shared character rules ----
T(chars.forbiddenChar === code.forbiddenChar && chars.displayCells === code.displayCells && chars.bidiIn === code.bidiIn, 'code re-exports the chars.ts rules');
T(chars.textCharIssues('label', 'a​b').length === 1 && chars.textCharIssues('label', 'ab').length === 0 && chars.textCharIssues('label', 'a‎b', true).length === 0, 'textCharIssues');

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
