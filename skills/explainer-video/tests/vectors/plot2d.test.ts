// Unit tests for plot2d schema, pure compute logic, and View2D source hygiene.
import {Plot2DVisual} from '../../src/visuals/plot2d/schema';
import {compileCurves, computeRiemann, computeSecant, computeTangent, computeViewport, type Plot2DV} from '../../src/visuals/plot2d/compute';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

const valid: Plot2DV = {
  type: 'plot2d',
  heading: 'Derivative intuition',
  xDomain: [-2, 4],
  yDomain: [-2, 6],
  curves: [{id: 'f', label: '0.5 x squared', expr: '0.5 * x^2'}],
  stages: [
    {kind: 'secant', label: 'Secant shrinks', x: 1, dx: 2, toDx: 0, zoom: 3},
    {kind: 'riemann', label: 'Signed slices', range: [-1, 3], slices: 4, toSlices: 16, method: 'midpoint'},
  ],
};

T(Plot2DVisual.safeParse(valid).success, 'valid plot2d passes');
T(!Plot2DVisual.safeParse({...valid, curves: []}).success, 'empty curves rejected');
T(!Plot2DVisual.safeParse({...valid, curves: [{label: 'Bad', expr: 'eval(x)'}]}).success, 'unsafe expr rejected');
T(!Plot2DVisual.safeParse({...valid, curves: [{label: 'Both', expr: 'x', points: [[0, 0], [1, 1]]}]}).success, 'both expr and points rejected');
T(!Plot2DVisual.safeParse({...valid, curves: [{label: 'Unsorted', points: [[1, 1], [0, 0]]}]}).success, 'unsorted points rejected');
T(!Plot2DVisual.safeParse({...valid, stages: [{kind: 'secant', label: 'Zero dx', x: 1, dx: 0}]}).success, 'secant dx=0 rejected');

// Compute checks
{
  const curves = compileCurves(valid);
  const quad = curves[0].fn;
  const sec0 = computeSecant(quad, 1, 2, 0, 6, 0)!;
  const sec1 = computeSecant(quad, 1, 2, 0, 6, 1)!;
  T(Math.abs(sec0.slope - 2) < 1e-4 && !sec0.isTangent, 'secant starts with slope 2 over [1, 3]');
  T(sec1.isTangent && Math.abs(sec1.slope - 1) < 1e-3, 'secant with toDx=0 converges cleanly to tangent slope 1 (no NaN)');

  const corner = computeTangent((x) => Math.abs(x), 0, 4, 4, 1)!;
  T(corner.isCorner && Math.abs(corner.leftSlope + 1) < 1e-3 && Math.abs(corner.rightSlope - 1) < 1e-3, 'computeTangent detects |x| corner');

  const rMid = computeRiemann((x) => x, [-2, 2], 4, 4, 'midpoint', 1);
  T(Math.abs(rMid.sum) < 1e-9 && rMid.bars.some((b) => !b.positive) && rMid.bars.some((b) => b.positive), 'signed Riemann cancels over [-2, 2]');

  const rSmooth = computeRiemann((x) => Math.sin(x), [0, Math.PI], 4, 16, 'smooth', 1);
  T(rSmooth.smoothPos.length === 1 && Math.abs(rSmooth.sum - 2) < 1e-3, 'smooth signed area over [0, pi]');

  const vp = computeViewport(valid, curves, {x: 100, y: 20, w: 1500, h: 400}, 200, [10, 100]);
  T(vp.x[1] - vp.x[0] < 6, 'computeViewport zooms in when secant stage has zoom > 1');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
