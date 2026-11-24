// Unit tests for surface3d schema, pure 3D geometry builder, and View3D guardrails.
import {readFileSync} from 'node:fs';
import {Surface3DVisual} from '../../src/visuals/surface3d/schema';
import {
  buildSliceCurve,
  buildSurfaceEval,
  buildSurfaceMeshData,
  buildTangentPatch,
  buildVolumeBoxes,
  type Surface3DV,
} from '../../src/visuals/surface3d/mesh';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

const valid: Surface3DV = {
  type: 'surface3d',
  heading: 'Saddle surface',
  xDomain: [-2, 2],
  yDomain: [-2, 2],
  expr: 'cos(x) * cos(y)',
  resolution: 12,
  overlays: [
    {kind: 'slice', label: 'X slice', axis: 'x', at: 0},
    {kind: 'tangent', label: 'Tangent plane', at: [0.5, 0.5]},
    {kind: 'columns', label: 'Columns', nx: 4, ny: 4, mode: 'columns'},
  ],
};

T(Surface3DVisual.safeParse(valid).success, 'valid expr surface3d passes');
T(Surface3DVisual.safeParse({
  type: 'surface3d',
  heading: 'Grid surface',
  xDomain: [0, 1],
  yDomain: [0, 1],
  grid: [[0, 1], [1, 2]],
}).success, 'valid grid surface3d passes');

T(!Surface3DVisual.safeParse({
  ...valid,
  grid: [[0, 1], [1, 2]],
}).success, 'rejects having both expr and grid');

T(!Surface3DVisual.safeParse({
  type: 'surface3d',
  heading: 'Jagged',
  xDomain: [0, 1],
  yDomain: [0, 1],
  grid: [[0, 1], [1]],
}).success, 'rejects jagged grid');

T(!Surface3DVisual.safeParse({
  ...valid,
  overlays: [{kind: 'columns', label: 'Too many', nx: 10, ny: 10, nz: 4, mode: 'voxels'}],
}).success, 'rejects > 250 voxels');

// Geometry builder checks
{
  const surf = buildSurfaceEval(valid);
  const mesh = buildSurfaceMeshData(valid, surf);
  T(mesh.positions.length === 13 * 13 * 3, '12x12 resolution has 13x13 vertices');
  T(mesh.indices.length === 12 * 12 * 6, '12x12 resolution has 288 triangles');
  T(mesh.elevT.every((t) => t >= 0 && t <= 1), 'elevT normalized in [0,1]');

  const sl = buildSliceCurve(surf, 'x', 0);
  T(sl.curveSegments.length > 0, 'slice curve segments generated');

  const tp = buildTangentPatch(surf, [0.5, 0.5]);
  T(tp.positions.length === 18 && tp.normalTip[1] > tp.contact[1], 'tangent quad and upward normal generated');

  const cols = buildVolumeBoxes(surf, 4, 4, 3, undefined, undefined, 'columns');
  T(cols.length === 16, '4x4 columns yields 16 boxes');
  const vox = buildVolumeBoxes(surf, 3, 3, 3, undefined, undefined, 'voxels');
  T(vox.length >= 9 && vox.length <= 27, '3x3x3 voxels bounded');
}

// View3D disposal check (other guardrails enforced centrally in hygiene.test.ts)
{
  const src = readFileSync(new URL('../../src/visuals/surface3d/View3D.tsx', import.meta.url), 'utf8');
  T(src.includes('.dispose()'), 'surface3d View3D disposes custom geometries/materials');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
