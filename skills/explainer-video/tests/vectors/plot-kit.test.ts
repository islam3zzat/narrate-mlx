// Unit tests for src/visuals/plot-kit.ts (domains, ticks, formatting, curve sampling, series interpolation).
import {
  domainIssue,
  formatNum,
  formatTick,
  interpolateSeries,
  lerpViewport,
  niceTicks,
  sampleCurve,
  segmentsToPaths,
  toPxX,
  toPxY,
  type Viewport,
} from '../../src/visuals/plot-kit';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

// Domain validation
T(domainIssue('x', [-2, 2]) === null, 'valid domain passes');
T(domainIssue('x', [2, 2]) !== null, 'degenerate domain rejected');
T(domainIssue('x', [3, 1]) !== null, 'inverted domain rejected');
T(domainIssue('x', [0, 1e7]) !== null, 'extreme domain rejected');
T(domainIssue('x', [NaN, 1]) !== null, 'NaN domain rejected');

// niceTicks: normal, tiny, huge, zero-crossing (no infinite loop, no -0)
for (const [lo, hi] of [[-5, 5], [0, 1], [-1e-4, 1e-4], [1e5, 1e5 + 1], [0.1, 0.3]]) {
  const ticks = niceTicks(lo, hi, 6);
  T(ticks.length >= 2 && ticks.length <= 20, `niceTicks(${lo}, ${hi}) bounded length: ${ticks.length}`);
  T(ticks.every((t) => !Object.is(t, -0) && Number.isFinite(t)), `niceTicks(${lo}, ${hi}) no -0/NaN`);
}

// formatTick & formatNum
T(formatTick(-0) === '0' && formatTick(0) === '0', 'formatTick normalizes -0');
T(formatTick(1.5) === '1.5' && formatTick(-2.25) === '-2.25', 'formatTick decimals');
T(formatNum(-0.001, 2) === '0.00', 'formatNum never returns -0.00');

// sampleCurve: splits on asymptotes (1/x) while preserving continuous exp(x)
{
  const invSegs = sampleCurve((x) => (Math.abs(x) < 1e-3 ? NaN : 1 / x), -3, 3, -5, 5, 120);
  T(invSegs.length >= 2, `1/x splits across vertical asymptote (got ${invSegs.length} segments)`);

  const sinSegs = sampleCurve((x) => Math.sin(x), 0, 6.28, -1.5, 1.5, 120);
  T(sinSegs.length === 1, 'sin(x) stays a single continuous segment');

  const vp: Viewport = {x: [0, 6.28], y: [-1.5, 1.5], px: {x: 100, y: 20, w: 1000, h: 400}};
  const paths = segmentsToPaths(sinSegs, vp);
  T(paths.length === 1 && paths[0].startsWith('M ') && paths[0].includes(' L '), 'segmentsToPaths produces valid SVG path');
  T(Math.abs(toPxX(0, vp) - 100) < 1e-6 && Math.abs(toPxY(1.5, vp) - 20) < 1e-6, 'toPxX/toPxY corners match');
  const mid = lerpViewport(vp, {x: [1, 3], y: [-1, 1], px: vp.px}, 0.5);
  T(Math.abs(mid.x[0] - 0.5) < 1e-6, 'lerpViewport interpolates');
}

// interpolateSeries
{
  const pts: [number, number][] = [[0, 0], [2, 4], [4, 0]];
  T(interpolateSeries(pts, 1) === 2 && interpolateSeries(pts, 3) === 2, 'interpolateSeries linear');
  T(Number.isNaN(interpolateSeries(pts, -1)) && Number.isNaN(interpolateSeries(pts, 5)), 'interpolateSeries out of bounds returns NaN');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
