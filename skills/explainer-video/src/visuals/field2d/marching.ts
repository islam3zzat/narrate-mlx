// Pure 2D grid sampling, marching squares with asymptotic decider, and multivariable differential operators.
import type {Domain, Pt} from '../plot-kit';

export type ScalarGrid = {
  nx: number;
  ny: number;
  xs: number[];
  ys: number[];
  values: number[][]; // [iy][ix]
  min: number;
  max: number;
};

export function sampleScalarGrid(
  fn: (x: number, y: number) => number,
  xDom: Domain,
  yDom: Domain,
  nx = 36,
  ny = 24,
): ScalarGrid {
  const xs = Array.from({length: nx + 1}, (_, i) => xDom[0] + (i / nx) * (xDom[1] - xDom[0]));
  const ys = Array.from({length: ny + 1}, (_, j) => yDom[0] + (j / ny) * (yDom[1] - yDom[0]));
  const values: number[][] = [];
  let min = Infinity, max = -Infinity;
  for (let j = 0; j <= ny; j++) {
    const row: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const v = fn(xs[i], ys[j]);
      row.push(v);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    values.push(row);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = 0;
    max = 1;
  }
  return {nx, ny, xs, ys, values, min, max};
}

type Seg = [Pt, Pt];

function interp(p1: Pt, p2: Pt, v1: number, v2: number, level: number): Pt {
  const dv = v2 - v1;
  const t = Math.abs(dv) < 1e-12 ? 0.5 : Math.max(0, Math.min(1, (level - v1) / dv));
  return {x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t};
}

/** Extract contour segments via marching squares with asymptotic decider for saddle cases (5 and 10). */
export function marchingSquaresSegments(grid: ScalarGrid, level: number): Seg[] {
  const segs: Seg[] = [];
  const {nx, ny, xs, ys, values} = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v0 = values[j][i];
      const v1 = values[j][i + 1];
      const v2 = values[j + 1][i + 1];
      const v3 = values[j + 1][i];
      if (![v0, v1, v2, v3].every(Number.isFinite)) continue;

      const b0 = v0 >= level ? 1 : 0;
      const b1 = v1 >= level ? 2 : 0;
      const b2 = v2 >= level ? 4 : 0;
      const b3 = v3 >= level ? 8 : 0;
      const code = b0 | b1 | b2 | b3;
      if (code === 0 || code === 15) continue;

      const p0 = {x: xs[i], y: ys[j]};
      const p1 = {x: xs[i + 1], y: ys[j]};
      const p2 = {x: xs[i + 1], y: ys[j + 1]};
      const p3 = {x: xs[i], y: ys[j + 1]};

      const eB = () => interp(p0, p1, v0, v1, level); // bottom (0-1)
      const eR = () => interp(p1, p2, v1, v2, level); // right (1-2)
      const eT = () => interp(p3, p2, v3, v2, level); // top (3-2)
      const eL = () => interp(p0, p3, v0, v3, level); // left (0-3)

      switch (code) {
        case 1: case 14: segs.push([eL(), eB()]); break;
        case 2: case 13: segs.push([eB(), eR()]); break;
        case 3: case 12: segs.push([eL(), eR()]); break;
        case 4: case 11: segs.push([eR(), eT()]); break;
        case 6: case 9: segs.push([eB(), eT()]); break;
        case 7: case 8: segs.push([eL(), eT()]); break;
        case 5: {
          const avg = 0.25 * (v0 + v1 + v2 + v3);
          if (avg >= level) { segs.push([eL(), eT()], [eB(), eR()]); }
          else { segs.push([eL(), eB()], [eR(), eT()]); }
          break;
        }
        case 10: {
          const avg = 0.25 * (v0 + v1 + v2 + v3);
          if (avg >= level) { segs.push([eL(), eB()], [eR(), eT()]); }
          else { segs.push([eL(), eT()], [eB(), eR()]); }
          break;
        }
      }
    }
  }
  return segs;
}

export function grad2D(fn: (x: number, y: number) => number, x: number, y: number, xSpan: number, ySpan: number): [number, number] {
  const hx = Math.max(xSpan * 1e-4, 1e-5);
  const hy = Math.max(ySpan * 1e-4, 1e-5);
  const gx = (fn(x + hx, y) - fn(x - hx, y)) / (2 * hx);
  const gy = (fn(x, y + hy) - fn(x, y - hy)) / (2 * hy);
  return [Number.isFinite(gx) ? gx : 0, Number.isFinite(gy) ? gy : 0];
}

export function jacobian2D(
  fx: (x: number, y: number) => number,
  fy: (x: number, y: number) => number,
  x: number,
  y: number,
  xSpan: number,
  ySpan: number,
): {dxx: number; dxy: number; dyx: number; dyy: number; div: number; curl: number} {
  const hx = Math.max(xSpan * 1e-4, 1e-5);
  const hy = Math.max(ySpan * 1e-4, 1e-5);
  const dxx = (fx(x + hx, y) - fx(x - hx, y)) / (2 * hx);
  const dxy = (fx(x, y + hy) - fx(x, y - hy)) / (2 * hy);
  const dyx = (fy(x + hx, y) - fy(x - hx, y)) / (2 * hx);
  const dyy = (fy(x, y + hy) - fy(x, y - hy)) / (2 * hy);
  const clean = (v: number) => (Number.isFinite(v) ? v : 0);
  const cXX = clean(dxx), cXY = clean(dxy), cYX = clean(dyx), cYY = clean(dyy);
  return {dxx: cXX, dxy: cXY, dyx: cYX, dyy: cYY, div: cXX + cYY, curl: cYX - cXY};
}
