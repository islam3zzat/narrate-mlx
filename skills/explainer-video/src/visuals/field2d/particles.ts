// Deterministic particle streamlines (Mulberry32 seeded), RK4 gradient paths, and line/flux integrals.
import type {Domain, Pt} from '../plot-kit';
import {grad2D} from './marching';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ParticleTrack = {
  pts: Pt[];
  phase: number;
};

/** Precompute 48 deterministic advected particle trajectories via RK4 (O(1) per-frame lookup). */
export function precomputeParticles(
  fx: (x: number, y: number) => number,
  fy: (x: number, y: number) => number,
  xDom: Domain,
  yDom: Domain,
  period = 60,
): ParticleTrack[] {
  const rand = mulberry32(0x2f6e2b1);
  const cols = 8, rows = 6;
  const xSpan = xDom[1] - xDom[0];
  const ySpan = yDom[1] - yDom[0];
  const scale = Math.min(xSpan, ySpan) * 0.018;
  const tracks: ParticleTrack[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x = xDom[0] + ((c + 0.15 + rand() * 0.7) / cols) * xSpan;
      let y = yDom[0] + ((r + 0.15 + rand() * 0.7) / rows) * ySpan;
      const phase = Math.floor(rand() * period);
      const pts: Pt[] = [{x, y}];
      const vel = (px: number, py: number): [number, number] => {
        const vx = fx(px, py), vy = fy(px, py);
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) return [0, 0];
        const mag = Math.hypot(vx, vy);
        if (mag < 1e-8) return [0, 0];
        const cap = Math.min(1.6, mag) / mag;
        return [vx * cap * scale, vy * cap * scale];
      };
      for (let s = 1; s < period; s++) {
        const [k1x, k1y] = vel(x, y);
        const [k2x, k2y] = vel(x + 0.5 * k1x, y + 0.5 * k1y);
        const [k3x, k3y] = vel(x + 0.5 * k2x, y + 0.5 * k2y);
        const [k4x, k4y] = vel(x + k3x, y + k3y);
        x += (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
        y += (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
        if (x < xDom[0] || x > xDom[1] || y < yDom[0] || y > yDom[1]) break;
        pts.push({x, y});
      }
      tracks.push({pts, phase});
    }
  }
  return tracks;
}

/** RK4 gradient ascent/descent path from a starting point, bounded to `steps`. */
export function integrateGradientPath(
  fn: (x: number, y: number) => number,
  start: readonly [number, number],
  direction: 'ascent' | 'descent',
  xDom: Domain,
  yDom: Domain,
  steps = 48,
): Pt[] {
  const sign = direction === 'ascent' ? 1 : -1;
  const xSpan = xDom[1] - xDom[0];
  const ySpan = yDom[1] - yDom[0];
  const stepLen = Math.min(xSpan, ySpan) * 0.045;
  let x = start[0], y = start[1];
  const out: Pt[] = [{x, y}];
  const dir = (px: number, py: number): [number, number] | null => {
    const [gx, gy] = grad2D(fn, px, py, xSpan, ySpan);
    const m = Math.hypot(gx, gy);
    if (!Number.isFinite(m) || m < 1e-5) return null;
    return [(sign * gx * stepLen) / m, (sign * gy * stepLen) / m];
  };
  for (let i = 0; i < steps; i++) {
    const k1 = dir(x, y);
    if (!k1) break;
    const k2 = dir(x + 0.5 * k1[0], y + 0.5 * k1[1]) ?? k1;
    const k3 = dir(x + 0.5 * k2[0], y + 0.5 * k2[1]) ?? k2;
    const k4 = dir(x + k3[0], y + k3[1]) ?? k3;
    const nx = x + (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
    const ny = y + (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
    if (nx < xDom[0] || nx > xDom[1] || ny < yDom[0] || ny > yDom[1]) break;
    x = nx;
    y = ny;
    out.push({x, y});
  }
  return out;
}

/** Line integral work along piecewise-linear trail, decomposing F into tangential and perpendicular parts. */
export function computeLineIntegral(
  fx: (x: number, y: number) => number,
  fy: (x: number, y: number) => number,
  points: readonly (readonly [number, number])[],
  progress: number,
): {
  totalWork: number;
  cursor: Pt;
  fieldVec: [number, number];
  tanVec: [number, number];
  perpVec: [number, number];
  trail: Pt[];
} {
  const segLens: number[] = [];
  let fullLen = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    segLens.push(l);
    fullLen += l;
  }
  const targetDist = fullLen * Math.max(0, Math.min(1, progress));
  let acc = 0;
  let work = 0;
  const trail: Pt[] = [{x: points[0][0], y: points[0][1]}];
  let cursor: Pt = {x: points[0][0], y: points[0][1]};
  let tx = 1, ty = 0;

  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1][0], ay = points[i - 1][1];
    const bx = points[i][0], by = points[i][1];
    const sl = segLens[i - 1];
    if (sl < 1e-9) continue;
    const ux = (bx - ax) / sl, uy = (by - ay) / sl;
    const rem = targetDist - acc;
    if (rem <= 0) break;
    const take = Math.min(sl, rem);
    const frac = take / sl;
    const cx = ax + (bx - ax) * frac;
    const cy = ay + (by - ay) * frac;
    // Midpoint work contribution
    const mx = (ax + cx) * 0.5, my = (ay + cy) * 0.5;
    const fmx = fx(mx, my), fmy = fy(mx, my);
    if (Number.isFinite(fmx) && Number.isFinite(fmy)) {
      work += (fmx * ux + fmy * uy) * take;
    }
    trail.push({x: cx, y: cy});
    cursor = {x: cx, y: cy};
    tx = ux;
    ty = uy;
    acc += sl;
  }

  const fvx = fx(cursor.x, cursor.y), fvy = fy(cursor.x, cursor.y);
  const fClean: [number, number] = [Number.isFinite(fvx) ? fvx : 0, Number.isFinite(fvy) ? fvy : 0];
  const dot = fClean[0] * tx + fClean[1] * ty;
  const tanVec: [number, number] = [dot * tx, dot * ty];
  const perpVec: [number, number] = [fClean[0] - tanVec[0], fClean[1] - tanVec[1]];
  return {totalWork: work, cursor, fieldVec: fClean, tanVec, perpVec, trail};
}

/** Flux integral across a piecewise-linear curve with right-hand normal vectors. */
export function computeFluxIntegral(
  fx: (x: number, y: number) => number,
  fy: (x: number, y: number) => number,
  points: readonly (readonly [number, number])[],
): {totalFlux: number; samples: {x: number; y: number; nx: number; ny: number; fDotN: number}[]} {
  let totalFlux = 0;
  const samples: {x: number; y: number; nx: number; ny: number; fDotN: number}[] = [];
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1][0], ay = points[i - 1][1];
    const bx = points[i][0], by = points[i][1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) continue;
    // Right-hand unit normal
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const sub = 3;
    for (let k = 0; k < sub; k++) {
      const t = (k + 0.5) / sub;
      const mx = ax + (bx - ax) * t;
      const my = ay + (by - ay) * t;
      const vx = fx(mx, my), vy = fy(mx, my);
      const dot = Number.isFinite(vx) && Number.isFinite(vy) ? vx * nx + vy * ny : 0;
      totalFlux += dot * (len / sub);
      if (k === 1) samples.push({x: mx, y: my, nx, ny, fDotN: dot});
    }
  }
  return {totalFlux, samples};
}
