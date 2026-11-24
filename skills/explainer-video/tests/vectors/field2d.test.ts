// Unit tests for field2d schema, marching squares, multivariable operators, deterministic particles, and view hygiene.
import {Field2DVisual} from '../../src/visuals/field2d/schema';
import {grad2D, jacobian2D, marchingSquaresSegments, sampleScalarGrid} from '../../src/visuals/field2d/marching';
import {computeFluxIntegral, computeLineIntegral, integrateGradientPath, precomputeParticles} from '../../src/visuals/field2d/particles';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

T(Field2DVisual.safeParse({
  type: 'field2d',
  heading: 'Contour hill',
  mode: 'scalar',
  xDomain: [-2, 2],
  yDomain: [-2, 2],
  expr: 'exp(-(x^2 + y^2))',
  overlays: [{id: 'g', kind: 'gradient', label: 'Gradient'}],
}).success, 'valid scalar field2d passes');

T(Field2DVisual.safeParse({
  type: 'field2d',
  heading: 'Rotation field',
  mode: 'vector',
  xDomain: [-2, 2],
  yDomain: [-2, 2],
  fx: '-y',
  fy: 'x',
  overlays: [{kind: 'curl', label: 'Curl', at: [0, 0]}],
}).success, 'valid vector field2d passes');

T(!Field2DVisual.safeParse({
  type: 'field2d',
  heading: 'Mode mismatch',
  mode: 'scalar',
  xDomain: [-2, 2],
  yDomain: [-2, 2],
  expr: 'x + y',
  overlays: [{kind: 'curl', label: 'Curl', at: [0, 0]}],
}).success, 'scalar mode rejects vector overlay');

T(!Field2DVisual.safeParse({
  type: 'field2d',
  heading: 'Unsafe',
  mode: 'vector',
  xDomain: [-2, 2],
  yDomain: [-2, 2],
  fx: 'process.exit(1)',
  fy: 'x',
}).success, 'vector mode rejects unsafe fx');

// Marching squares & calculus operators
{
  const fn = (x: number, y: number) => x * x + y * y;
  const g = sampleScalarGrid(fn, [-2, 2], [-2, 2], 24, 24);
  const segs = marchingSquaresSegments(g, 1.0);
  T(segs.length > 10, 'marching squares extracts unit circle contour segments');

  const [gx, gy] = grad2D(fn, 1, 2, 4, 4);
  T(Math.abs(gx - 2) < 1e-3 && Math.abs(gy - 4) < 1e-3, 'grad2D of x^2+y^2 at (1,2) is (2,4)');

  const jac = jacobian2D((x, y) => 2 * x - y, (x, y) => x + 3 * y, 0, 0, 4, 4);
  T(Math.abs(jac.div - 5) < 1e-3 && Math.abs(jac.curl - 2) < 1e-3, `jacobian2D div=5, curl=2 (got ${jac.div}, ${jac.curl})`);

  // Deterministic particles: running twice produces identical trajectories
  const p1 = precomputeParticles((x, y) => -y, (x, y) => x, [-2, 2], [-2, 2], 60);
  const p2 = precomputeParticles((x, y) => -y, (x, y) => x, [-2, 2], [-2, 2], 60);
  T(p1.length === 48 && JSON.stringify(p1[0]) === JSON.stringify(p2[0]), 'precomputeParticles is 100% deterministic');

  const trail = integrateGradientPath((x, y) => -(x * x + y * y), [1.5, 1.5], 'ascent', [-2, 2], [-2, 2], 40);
  const end = trail[trail.length - 1];
  T(Math.hypot(end.x, end.y) < 0.3, 'RK4 ascent climbs toward peak at (0,0)');

  const li = computeLineIntegral(() => 3, () => 0, [[0, 0], [2, 0]], 1);
  T(Math.abs(li.totalWork - 6) < 1e-4, 'line integral of (3,0) along [0,2] = 6');

  const fl = computeFluxIntegral(() => 2, () => 0, [[0, 0], [0, 3]]);
  T(Math.abs(fl.totalFlux - 6) < 1e-4, 'flux integral across vertical segment [0,3] = 6');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
