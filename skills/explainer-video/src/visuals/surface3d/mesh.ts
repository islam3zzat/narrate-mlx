// Pure 3D surface geometry builder (no React, Remotion, or Three): right-handed mapping (x_math, z_height, -y_math).
import type {Visual} from '../../types';
import {compile2D} from '../math-expr';

export type Surface3DV = Extract<Visual, {type: 'surface3d'}>;

export const WORLD_X = 7.2; // [-3.6, 3.6]
export const WORLD_Y = 3.2; // [0, 3.2] (height up)
export const WORLD_Z = 6.4; // [-3.2, 3.2] (+y_math -> -z_world)
export const MESH_OFFSET_GAP = 0.012;

export type SurfaceEval = {
  fn: (x: number, y: number) => number;
  xDom: readonly [number, number];
  yDom: readonly [number, number];
  zDom: readonly [number, number];
  toWorld: (x: number, y: number, z: number) => [number, number, number];
};

function bilinearGrid(grid: number[][], xDom: readonly [number, number], yDom: readonly [number, number], x: number, y: number): number {
  const ny = grid.length - 1;
  const nx = grid[0].length - 1;
  const tx = Math.max(0, Math.min(1, (x - xDom[0]) / (xDom[1] - xDom[0]))) * nx;
  const ty = Math.max(0, Math.min(1, (y - yDom[0]) / (yDom[1] - yDom[0]))) * ny;
  const ix = Math.min(nx - 1, Math.floor(tx));
  const iy = Math.min(ny - 1, Math.floor(ty));
  const fx = tx - ix, fy = ty - iy;
  const z00 = grid[iy][ix], z10 = grid[iy][ix + 1];
  const z01 = grid[iy + 1][ix], z11 = grid[iy + 1][ix + 1];
  return (z00 * (1 - fx) + z10 * fx) * (1 - fy) + (z01 * (1 - fx) + z11 * fx) * fy;
}

export function buildSurfaceEval(v: Surface3DV): SurfaceEval {
  const fn = v.expr
    ? (() => {
        const raw = compile2D(v.expr) ?? (() => 0);
        return (x: number, y: number) => {
          const val = raw(x, y);
          return Number.isFinite(val) ? val : 0;
        };
      })()
    : (x: number, y: number) => bilinearGrid(v.grid!, v.xDomain, v.yDomain, x, y);

  let zDom: readonly [number, number];
  if (v.zDomain) {
    zDom = v.zDomain;
  } else {
    let min = Infinity, max = -Infinity;
    const n = 18;
    for (let j = 0; j <= n; j++) {
      const y = v.yDomain[0] + (j / n) * (v.yDomain[1] - v.yDomain[0]);
      for (let i = 0; i <= n; i++) {
        const x = v.xDomain[0] + (i / n) * (v.xDomain[1] - v.xDomain[0]);
        const z = fn(x, y);
        if (z < min) min = z;
        if (z > max) max = z;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-4) {
      min = 0;
      max = 2;
    }
    const pad = (max - min) * 0.08;
    zDom = [min - pad, max + pad];
  }

  const xSpan = v.xDomain[1] - v.xDomain[0];
  const ySpan = v.yDomain[1] - v.yDomain[0];
  const zSpan = Math.max(1e-6, zDom[1] - zDom[0]);
  const toWorld = (x: number, y: number, z: number): [number, number, number] => [
    ((x - v.xDomain[0]) / xSpan - 0.5) * WORLD_X,
    Math.max(-0.4, Math.min(WORLD_Y + 0.4, ((z - zDom[0]) / zSpan) * WORLD_Y)),
    (0.5 - (y - v.yDomain[0]) / ySpan) * WORLD_Z,
  ];

  return {fn, xDom: v.xDomain, yDom: v.yDomain, zDom, toWorld};
}

export function buildSurfaceMeshData(v: Surface3DV, surf: SurfaceEval): {
  positions: Float32Array;
  indices: number[];
  elevT: Float32Array;
  gridLines: Float32Array;
} {
  const res = v.resolution ?? 20;
  const cols = res + 1;
  const count = cols * cols;
  const positions = new Float32Array(count * 3);
  const elevT = new Float32Array(count);
  const zSpan = Math.max(1e-6, surf.zDom[1] - surf.zDom[0]);

  for (let j = 0; j <= res; j++) {
    const y = surf.yDom[0] + (j / res) * (surf.yDom[1] - surf.yDom[0]);
    for (let i = 0; i <= res; i++) {
      const x = surf.xDom[0] + (i / res) * (surf.xDom[1] - surf.xDom[0]);
      const z = surf.fn(x, y);
      const [wx, wy, wz] = surf.toWorld(x, y, z);
      const idx = j * cols + i;
      positions[idx * 3] = wx;
      positions[idx * 3 + 1] = wy;
      positions[idx * 3 + 2] = wz;
      elevT[idx] = Math.max(0, Math.min(1, (z - surf.zDom[0]) / zSpan));
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  // Sparse wireframe grid lines offset by +MESH_OFFSET_GAP in Y to prevent z-fighting
  const step = Math.max(1, Math.round(res / 10));
  const segs: number[] = [];
  const pushSeg = (i0: number, j0: number, i1: number, j1: number) => {
    const a = (j0 * cols + i0) * 3;
    const b = (j1 * cols + i1) * 3;
    segs.push(
      positions[a], positions[a + 1] + MESH_OFFSET_GAP, positions[a + 2],
      positions[b], positions[b + 1] + MESH_OFFSET_GAP, positions[b + 2],
    );
  };
  for (let j = 0; j <= res; j += step) {
    for (let i = 0; i < res; i++) pushSeg(i, j, i + 1, j);
  }
  for (let i = 0; i <= res; i += step) {
    for (let j = 0; j < res; j++) pushSeg(i, j, i, j + 1);
  }

  return {positions, indices, elevT, gridLines: new Float32Array(segs)};
}

export function buildSliceCurve(
  surf: SurfaceEval,
  axis: 'x' | 'y',
  atVal: number,
): {
  curveSegments: Float32Array;
  planePos: [number, number, number];
  planeSize: [number, number];
  planeRotY: number;
} {
  const n = 40;
  const segs: number[] = [];
  let prev: [number, number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = axis === 'x' ? atVal : surf.xDom[0] + t * (surf.xDom[1] - surf.xDom[0]);
    const y = axis === 'y' ? atVal : surf.yDom[0] + t * (surf.yDom[1] - surf.yDom[0]);
    const [wx, wy, wz] = surf.toWorld(x, y, surf.fn(x, y));
    const cur: [number, number, number] = [wx, wy + MESH_OFFSET_GAP * 2, wz];
    if (prev) segs.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
    prev = cur;
  }

  const ref = surf.toWorld(
    axis === 'x' ? atVal : (surf.xDom[0] + surf.xDom[1]) * 0.5,
    axis === 'y' ? atVal : (surf.yDom[0] + surf.yDom[1]) * 0.5,
    surf.zDom[0],
  );
  return {
    curveSegments: new Float32Array(segs),
    planePos: [axis === 'x' ? ref[0] : 0, WORLD_Y * 0.5, axis === 'y' ? ref[2] : 0],
    planeSize: [axis === 'x' ? WORLD_Z : WORLD_X, WORLD_Y],
    planeRotY: axis === 'x' ? Math.PI / 2 : 0,
  };
}

export function buildTangentPatch(
  surf: SurfaceEval,
  at: readonly [number, number],
  halfSize = 1.1,
): {
  positions: Float32Array;
  contact: [number, number, number];
  normalTip: [number, number, number];
} {
  const xSpan = surf.xDom[1] - surf.xDom[0];
  const ySpan = surf.yDom[1] - surf.yDom[0];
  const hx = xSpan * 1e-4, hy = ySpan * 1e-4;
  const [x0, y0] = at;
  const z0 = surf.fn(x0, y0);
  const zx = (surf.fn(x0 + hx, y0) - surf.fn(x0 - hx, y0)) / (2 * hx);
  const zy = (surf.fn(x0, y0 + hy) - surf.fn(x0, y0 - hy)) / (2 * hy);
  const dx = (halfSize / WORLD_X) * xSpan;
  const dy = (halfSize / WORLD_Z) * ySpan;

  const pt = (sx: number, sy: number): [number, number, number] => {
    const x = x0 + sx * dx, y = y0 + sy * dy;
    const z = z0 + zx * (x - x0) + zy * (y - y0);
    const [wx, wy, wz] = surf.toWorld(x, y, z);
    return [wx, wy + MESH_OFFSET_GAP * 2.5, wz];
  };

  const p00 = pt(-1, -1), p10 = pt(1, -1), p11 = pt(1, 1), p01 = pt(-1, 1);
  const positions = new Float32Array([
    ...p00, ...p10, ...p11,
    ...p00, ...p11, ...p01,
  ]);
  const contact = surf.toWorld(x0, y0, z0);
  // World-space normal via cross product of tangent edges (p10 - p00) x (p01 - p00)
  const ux = p10[0] - p00[0], uy = p10[1] - p00[1], uz = p10[2] - p00[2];
  const vx = p01[0] - p00[0], vy = p01[1] - p00[1], vz = p01[2] - p00[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const normalTip: [number, number, number] = [
    contact[0] + (nx / nLen) * 1.15,
    contact[1] + (ny / nLen) * 1.15,
    contact[2] + (nz / nLen) * 1.15,
  ];
  return {positions, contact, normalTip};
}

export type VolumeBox = {
  pos: [number, number, number];
  size: [number, number, number];
  t: number;
};

export function buildVolumeBoxes(
  surf: SurfaceEval,
  nx: number,
  ny: number,
  nz: number,
  xRange?: readonly [number, number],
  yRange?: readonly [number, number],
  mode: 'columns' | 'voxels' = 'columns',
): VolumeBox[] {
  const xr = xRange ?? surf.xDom;
  const yr = yRange ?? surf.yDom;
  const dx = (xr[1] - xr[0]) / nx;
  const dy = (yr[1] - yr[0]) / ny;
  const xSpan = surf.xDom[1] - surf.xDom[0];
  const ySpan = surf.yDom[1] - surf.yDom[0];
  const zSpan = Math.max(1e-6, surf.zDom[1] - surf.zDom[0]);
  const bw = (dx / xSpan) * WORLD_X * 0.88;
  const bd = (dy / ySpan) * WORLD_Z * 0.88;
  const boxes: VolumeBox[] = [];

  for (let j = 0; j < ny; j++) {
    const cy = yr[0] + (j + 0.5) * dy;
    for (let i = 0; i < nx; i++) {
      const cx = xr[0] + (i + 0.5) * dx;
      const z = surf.fn(cx, cy);
      const [wx, wyTop, wz] = surf.toWorld(cx, cy, z);
      const hTotal = Math.max(0.06, wyTop);
      const t = Math.max(0, Math.min(1, (z - surf.zDom[0]) / zSpan));
      if (mode === 'columns') {
        boxes.push({pos: [wx, hTotal * 0.5, wz], size: [bw, hTotal, bd], t});
      } else {
        const layers = Math.max(1, Math.min(nz, Math.round((hTotal / WORLD_Y) * nz) || 1));
        const vh = (hTotal / layers) * 0.88;
        for (let k = 0; k < layers; k++) {
          boxes.push({
            pos: [wx, ((k + 0.5) / layers) * hTotal, wz],
            size: [bw * 0.92, vh, bd * 0.92],
            t: (k + 1) / Math.max(1, nz),
          });
        }
      }
    }
  }
  return boxes;
}
