// Unit tests for cancellation-grid schema, grid geometry, phase weights, and View2D hygiene.
import {CancellationGridVisual} from '../../src/visuals/cancellation-grid/schema';
import {build2DGrid, buildIso3DGrid, phaseWeights} from '../../src/visuals/cancellation-grid/grid';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

T(CancellationGridVisual.safeParse({
  type: 'cancellation-grid',
  heading: 'FTC telescoping',
  theorem: 'ftc-1d',
  cols: 5,
  stages: [{label: 'Reveal cells', phase: 'cells'}, {label: 'Boundary', phase: 'boundary'}],
}).success, 'valid ftc-1d passes');

T(!CancellationGridVisual.safeParse({
  type: 'cancellation-grid',
  heading: 'Bad ftc',
  theorem: 'ftc-1d',
  rows: 2,
  stages: [{label: 'Reveal', phase: 'cells'}],
}).success, 'ftc-1d rejects rows');

T(!CancellationGridVisual.safeParse({
  type: 'cancellation-grid',
  heading: 'Too big 3D',
  theorem: 'divergence-3d',
  cols: 4,
  stages: [{label: 'Reveal', phase: 'cells'}],
}).success, 'divergence-3d caps cols at 3');

T(CancellationGridVisual.safeParse({
  type: 'cancellation-grid',
  heading: '3D divergence',
  theorem: 'divergence-3d',
  cols: 2,
  rows: 2,
  depth: 2,
  stages: [{label: 'Cells', phase: 'cells'}, {label: 'Cancel', phase: 'cancel'}, {label: 'Boundary', phase: 'boundary'}],
}).success, 'valid divergence-3d passes');

// Grid geometry checks
{
  const g2 = build2DGrid('curl-2d', 3, 2, {x: 0, y: 0, w: 300, h: 200});
  T(g2.cells.length === 6, '3x2 grid produces 6 cells');
  const allEdges = g2.cells.flatMap((c) => c.edges);
  const boundaryCount = allEdges.filter((e) => e.kind === 'boundary').length;
  const interiorCount = allEdges.filter((e) => e.kind === 'interior').length;
  T(boundaryCount === 10 && interiorCount === 14, `3x2 curl grid has 10 boundary and 14 interior edges (got ${boundaryCount}/${interiorCount})`);

  const cubes = buildIso3DGrid(2, 2, 2, 500, 300, 80);
  T(cubes.length === 8, '2x2x2 divergence-3d produces 8 painter-sorted cubes');
  for (let i = 1; i < cubes.length; i++) T(cubes[i].depthKey >= cubes[i - 1].depthKey, 'iso cubes are sorted back-to-front');

  const stages = [
    {label: 'Cells', phase: 'cells' as const},
    {label: 'Interior', phase: 'interior' as const},
    {label: 'Cancel', phase: 'cancel' as const},
    {label: 'Boundary', phase: 'boundary' as const},
  ];
  const wEnd = phaseWeights(200, [10, 40, 70, 100], stages);
  T(wEnd.cellsIn === 1 && wEnd.interiorHighlight === 1 && wEnd.interiorCancel === 1 && wEnd.boundarySpotlight === 1, 'phaseWeights reaches 1 on all completed stages');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
