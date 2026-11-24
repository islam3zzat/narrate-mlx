// Unit tests for linked-plot schema, O(N) integral/derivative derivation, cursor state, and View2D hygiene.
import {LinkedPlotVisual} from '../../src/visuals/linked-plot/schema';
import {buildAreaPolygons, buildLinkedData, computeCursorState, type LinkedPlotV} from '../../src/visuals/linked-plot/compute';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

const validFromBottom: LinkedPlotV = {
  type: 'linked-plot',
  heading: 'Position & speed',
  xDomain: [0, 4],
  top: {label: 'Position', yDomain: [0, 10], unit: 'm'},
  bottom: {label: 'Speed', yDomain: [0, 6], unit: 'm/s', expr: '2 * x'},
  stages: [
    {label: 'Start moving', x: 1},
    {label: 'Reach four', x: 3},
  ],
};

T(LinkedPlotVisual.safeParse(validFromBottom).success, 'valid linked-plot with derived top passes');
T(LinkedPlotVisual.safeParse({
  ...validFromBottom,
  top: {label: 'Position', yDomain: [-2, 18], expr: 'x^2'},
  bottom: {label: 'Speed', yDomain: [0, 10]},
}).success, 'valid linked-plot with derived bottom passes');

T(!LinkedPlotVisual.safeParse({
  ...validFromBottom,
  bottom: {label: 'Speed', yDomain: [0, 6]},
}).success, 'rejects when neither top nor bottom provides curve');

T(!LinkedPlotVisual.safeParse({
  ...validFromBottom,
  stages: [{label: 'Out', x: 10}],
}).success, 'rejects stage.x outside xDomain');

T(!LinkedPlotVisual.safeParse({
  ...validFromBottom,
  anchor: {x: -1, y: 0},
}).success, 'rejects anchor.x outside xDomain');

// Math identity checks: integral of 2x from 0 to x is x^2; derivative of x^2 is 2x
{
  const d1 = buildLinkedData(validFromBottom);
  const st1 = computeCursorState(validFromBottom, d1, 200, [10, 50]);
  T(Math.abs(st1.cursorX - 3) < 1e-4, 'cursor settles at final stage x=3');
  T(Math.abs(st1.topY - 9) < 1e-2, `derived top integral at x=3 is ~9 (got ${st1.topY})`);
  T(Math.abs(st1.topSlope - 6) < 0.1, `top slope at x=3 matches bottom height 6 (got ${st1.topSlope})`);
  T(Math.abs(st1.area - 9) < 1e-2, 'bottom area matches deltaTop');

  const withAnchor: LinkedPlotV = {...validFromBottom, anchor: {x: 1, y: 5}};
  const dAnchor = buildLinkedData(withAnchor);
  T(Math.abs(dAnchor.topFn(1) - 5) < 1e-3 && Math.abs(dAnchor.topFn(3) - 13) < 1e-2, 'anchor shifts derived integral by constant C');

  const d2 = buildLinkedData({
    ...validFromBottom,
    top: {label: 'Balance', yDomain: [-5, 5], expr: '4 * sin(x)'},
    bottom: {label: 'Cash Flow', yDomain: [-5, 5]},
  });
  T(Math.abs(d2.bottomFn(0) - 4) < 1e-2 && Math.abs(d2.bottomFn(Math.PI) + 4) < 1e-2, 'derived bottom derivative matches 4*cos(x)');

  const polys = buildAreaPolygons((x) => Math.cos(x), 0, Math.PI);
  T(polys.pos.length === 1 && polys.neg.length === 1, 'area polygons split cleanly across zero crossing');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
