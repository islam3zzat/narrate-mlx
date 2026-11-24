// Pure frame-driven geometry computation for `plot2d` (no React/Remotion).
import type {Visual} from '../../types';
import {compile1D, detectCorner, numDeriv, simpsonIntegrate} from '../math-expr';
import {
  interpolateSeries,
  lerpViewport,
  PLOT_TONES,
  sampleCurve,
  segmentsToPaths,
  stageProgress,
  type Domain,
  type PlotTone,
  type Pt,
  type Viewport,
} from '../plot-kit';

export type Plot2DV = Extract<Visual, {type: 'plot2d'}>;
export type CurveEval = {
  id?: string;
  label: string;
  tone: PlotTone;
  dashed: boolean;
  fn: (x: number) => number;
};

export type RiemannBar = {
  x0: number;
  x1: number;
  y: number;
  positive: boolean;
};

export type SecantInfo = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dx: number;
  slope: number;
  isTangent: boolean;
  progress: number;
};

export type TangentInfo = {
  x: number;
  y: number;
  slope: number;
  isCorner: boolean;
  leftSlope: number;
  rightSlope: number;
  progress: number;
};

export type PointInfo = {
  x: number;
  y: number;
  tag?: string;
  tone: PlotTone;
  progress: number;
};

export type RiemannInfo = {
  bars: RiemannBar[];
  smoothPos: Pt[][];
  smoothNeg: Pt[][];
  sum: number;
  smoothMode: boolean;
  slices: number;
  progress: number;
};

export function compileCurves(v: Plot2DV): CurveEval[] {
  return v.curves.map((c, idx) => {
    const fn = c.expr
      ? compile1D(c.expr) ?? (() => NaN)
      : (x: number) => interpolateSeries(c.points ?? [], x);
    return {
      id: c.id,
      label: c.label,
      tone: c.tone ?? PLOT_TONES[idx % PLOT_TONES.length],
      dashed: !!c.dashed,
      fn,
    };
  });
}

function zoomedDomains(
  baseX: Domain,
  baseY: Domain,
  cx: number,
  cy: number,
  factor: number,
): {x: Domain; y: Domain} {
  const f = Math.max(1, factor);
  const hx = (baseX[1] - baseX[0]) / (2 * f);
  const hy = (baseY[1] - baseY[0]) / (2 * f);
  return {
    x: [cx - hx, cx + hx],
    y: [cy - hy, cy + hy],
  };
}

export function computeViewport(
  v: Plot2DV,
  curves: readonly CurveEval[],
  px: Viewport['px'],
  frame: number,
  stageStarts: readonly number[],
): Viewport {
  const base: Viewport = {x: v.xDomain, y: v.yDomain, px};
  const stages = v.stages;
  if (!stages?.length) return base;

  let cur = base;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const p = stageProgress(frame, stageStarts[i], 22);
    if (p <= 0) break;

    let target: Viewport | null = null;
    if (st.kind === 'zoom') {
      if (st.xDomain && st.yDomain) {
        target = {x: st.xDomain, y: st.yDomain, px};
      } else if (st.center && st.factor) {
        const z = zoomedDomains(v.xDomain, v.yDomain, st.center[0], st.center[1], st.factor);
        target = {x: z.x, y: z.y, px};
      }
    } else if ((st.kind === 'secant' || st.kind === 'tangent') && st.zoom && st.zoom > 1) {
      const c = curves[st.curve ?? 0];
      const y = c ? c.fn(st.x) : 0;
      const cy = Number.isFinite(y) ? y : (v.yDomain[0] + v.yDomain[1]) * 0.5;
      const z = zoomedDomains(v.xDomain, v.yDomain, st.x, cy, st.zoom);
      target = {x: z.x, y: z.y, px};
    }
    if (target) {
      cur = lerpViewport(cur, target, p);
    }
  }
  return cur;
}

/** Build Riemann bars and smooth signed area polygons on [a, b]. */
export function computeRiemann(
  fn: (x: number) => number,
  range: Domain,
  slicesStart: number,
  slicesEnd: number,
  method: 'left' | 'right' | 'midpoint' | 'smooth',
  progress: number,
): RiemannInfo {
  const [a, b] = range;
  const smoothMode = method === 'smooth';
  const curSlices = Math.max(1, Math.round(slicesStart + (slicesEnd - slicesStart) * progress));
  const bars: RiemannBar[] = [];
  let sum = 0;

  if (!smoothMode) {
    const dx = (b - a) / curSlices;
    for (let i = 0; i < curSlices; i++) {
      const x0 = a + i * dx;
      const x1 = x0 + dx;
      const sx = method === 'left' ? x0 : method === 'right' ? x1 : (x0 + x1) * 0.5;
      const y = fn(sx);
      if (Number.isFinite(y)) {
        bars.push({x0, x1, y, positive: y >= 0});
        sum += y * dx;
      }
    }
    return {bars, smoothPos: [], smoothNeg: [], sum, smoothMode: false, slices: curSlices, progress};
  }

  // Smooth signed area split into positive (>= 0) and negative (< 0) polygons
  const samples = 160;
  const smoothPos: Pt[][] = [];
  const smoothNeg: Pt[][] = [];
  let curPos: Pt[] = [];
  let curNeg: Pt[] = [];

  const flush = (poly: Pt[], list: Pt[][]) => {
    if (poly.length >= 2) {
      list.push([{x: poly[0].x, y: 0}, ...poly, {x: poly[poly.length - 1].x, y: 0}]);
    }
    poly.length = 0;
  };

  for (let i = 0; i <= samples; i++) {
    const x = a + (i / samples) * (b - a);
    const y = fn(x);
    if (!Number.isFinite(y)) {
      flush(curPos, smoothPos);
      flush(curNeg, smoothNeg);
      continue;
    }
    if (y >= 0) {
      if (curNeg.length) {
        const prev = curNeg[curNeg.length - 1];
        const xz = prev.x + (x - prev.x) * (Math.abs(prev.y) / (Math.abs(prev.y) + y + 1e-12));
        curNeg.push({x: xz, y: 0});
        flush(curNeg, smoothNeg);
        curPos.push({x: xz, y: 0});
      }
      curPos.push({x, y});
    } else {
      if (curPos.length) {
        const prev = curPos[curPos.length - 1];
        const xz = prev.x + (x - prev.x) * (prev.y / (prev.y + Math.abs(y) + 1e-12));
        curPos.push({x: xz, y: 0});
        flush(curPos, smoothPos);
        curNeg.push({x: xz, y: 0});
      }
      curNeg.push({x, y});
    }
  }
  flush(curPos, smoothPos);
  flush(curNeg, smoothNeg);
  sum = simpsonIntegrate(fn, a, b, 96);
  return {bars: [], smoothPos, smoothNeg, sum, smoothMode: true, slices: samples, progress};
}

export function computeSecant(
  fn: (x: number) => number,
  x: number,
  dx0: number,
  toDx: number | undefined,
  xSpan: number,
  progress: number,
): SecantInfo | null {
  const y1 = fn(x);
  if (!Number.isFinite(y1)) return null;
  const target = toDx ?? dx0;
  const curDx = dx0 + (target - dx0) * progress;
  if (Math.abs(curDx) < 1e-5) {
    const slope = numDeriv(fn, x, xSpan);
    if (!Number.isFinite(slope)) return null;
    return {x1: x, y1, x2: x, y2: y1, dx: 0, slope, isTangent: true, progress};
  }
  const x2 = x + curDx;
  const y2 = fn(x2);
  if (!Number.isFinite(y2)) return null;
  const slope = (y2 - y1) / curDx;
  return {x1: x, y1, x2, y2, dx: curDx, slope, isTangent: false, progress};
}

export function computeTangent(
  fn: (x: number) => number,
  x: number,
  xSpan: number,
  ySpan: number,
  progress: number,
): TangentInfo | null {
  const y = fn(x);
  if (!Number.isFinite(y)) return null;
  const corner = detectCorner(fn, x, xSpan, ySpan);
  const slope = corner.isCorner ? corner.rightSlope : numDeriv(fn, x, xSpan);
  if (!Number.isFinite(slope)) return null;
  return {
    x,
    y,
    slope,
    isCorner: corner.isCorner,
    leftSlope: corner.leftSlope,
    rightSlope: corner.rightSlope,
    progress,
  };
}

export function curvePathsForViewport(c: CurveEval, vp: Viewport): string[] {
  const segs = sampleCurve(c.fn, vp.x[0], vp.x[1], vp.y[0], vp.y[1], 240);
  return segmentsToPaths(segs, vp);
}
