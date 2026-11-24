// Pure frame-driven computation for `linked-plot`: O(N) cumulative Simpson integral / numerical derivative, cursor motion, tangent & area.
import type {Visual} from '../../types';
import {compile1D, cumulativeSimpson, numDeriv} from '../math-expr';
import {
  interpolateSeries,
  sampleCurve,
  segmentsToPaths,
  stageProgress,
  type PlotTone,
  type Pt,
  type Viewport,
} from '../plot-kit';

export type LinkedPlotV = Extract<Visual, {type: 'linked-plot'}>;

export type LinkedData = {
  topFn: (x: number) => number;
  bottomFn: (x: number) => number;
  topTone: PlotTone;
  botTone: PlotTone;
  topBaseVal: number;
};

const GRID_SAMPLES = 240;

export function buildLinkedData(v: LinkedPlotV): LinkedData {
  const [xMin, xMax] = v.xDomain;
  const xSpan = xMax - xMin;
  const topRaw = v.top.expr
    ? compile1D(v.top.expr)
    : v.top.points
      ? (x: number) => interpolateSeries(v.top.points!, x)
      : null;
  const botRaw = v.bottom.expr
    ? compile1D(v.bottom.expr)
    : v.bottom.points
      ? (x: number) => interpolateSeries(v.bottom.points!, x)
      : null;

  let topFn: (x: number) => number;
  let bottomFn: (x: number) => number;

  if (topRaw && botRaw) {
    topFn = topRaw;
    bottomFn = botRaw;
  } else if (topRaw) {
    topFn = topRaw;
    bottomFn = (x: number) => numDeriv(topRaw, x, xSpan);
  } else if (botRaw) {
    bottomFn = botRaw;
    const xs = Array.from({length: GRID_SAMPLES + 1}, (_, i) => xMin + (i / GRID_SAMPLES) * xSpan);
    const cum = cumulativeSimpson(botRaw, xs);
    const pts: [number, number][] = xs.map((x, i) => [x, cum[i]]);
    const anchor = v.anchor ?? {x: xMin, y: 0};
    const rawAtAnchor = interpolateSeries(pts, anchor.x);
    const shift = Number.isFinite(rawAtAnchor) ? anchor.y - rawAtAnchor : 0;
    const shifted: [number, number][] = pts.map(([x, y]) => [x, y + shift]);
    topFn = (x: number) => interpolateSeries(shifted, x);
  } else {
    topFn = () => NaN;
    bottomFn = () => NaN;
  }

  const topBaseVal = topFn(xMin);
  return {
    topFn,
    bottomFn,
    topTone: v.top.tone ?? 'secondary',
    botTone: v.bottom.tone ?? 'accent',
    topBaseVal: Number.isFinite(topBaseVal) ? topBaseVal : 0,
  };
}

export function computeCursorState(
  v: LinkedPlotV,
  data: LinkedData,
  frame: number,
  stageStarts: readonly number[],
): {
  cursorX: number;
  topY: number;
  topSlope: number;
  bottomY: number;
  area: number;
  deltaTop: number;
  showTangent: boolean;
  showArea: boolean;
  note?: string;
} {
  const [xMin, xMax] = v.xDomain;
  const xSpan = xMax - xMin;
  let cursorX = xMin;
  let activeIdx = 0;

  for (let i = 0; i < v.stages.length; i++) {
    const p = stageProgress(frame, stageStarts[i], 24);
    if (p <= 0) break;
    const target = v.stages[i].x;
    cursorX = cursorX + (target - cursorX) * p;
    activeIdx = i;
  }
  cursorX = Math.max(xMin, Math.min(xMax, cursorX));

  const topY = data.topFn(cursorX);
  const bottomY = data.bottomFn(cursorX);
  const topSlope = numDeriv(data.topFn, cursorX, xSpan);
  const deltaTop = Number.isFinite(topY) ? topY - data.topBaseVal : NaN;
  const stage = v.stages[activeIdx];
  const show = stage?.show ?? 'both';

  return {
    cursorX,
    topY,
    topSlope,
    bottomY,
    area: deltaTop,
    deltaTop,
    showTangent: show === 'tangent' || show === 'both',
    showArea: show === 'area' || show === 'both',
    note: stage?.note,
  };
}

/** Build signed positive/negative polygons under bottomFn from xMin to cursorX. */
export function buildAreaPolygons(
  fn: (x: number) => number,
  xMin: number,
  cursorX: number,
  xMax: number = cursorX,
): {pos: Pt[][]; neg: Pt[][]} {
  const pos: Pt[][] = [];
  const neg: Pt[][] = [];
  if (cursorX <= xMin + 1e-6) return {pos, neg};
  const xSpan = Math.max(1e-6, xMax - xMin);
  const steps = Math.max(24, Math.min(180, Math.round(((cursorX - xMin) / xSpan) * 120)));
  let curPos: Pt[] = [];
  let curNeg: Pt[] = [];

  const flush = (poly: Pt[], list: Pt[][]) => {
    if (poly.length >= 2) {
      list.push([{x: poly[0].x, y: 0}, ...poly, {x: poly[poly.length - 1].x, y: 0}]);
    }
    poly.length = 0;
  };

  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (cursorX - xMin);
    const y = fn(x);
    if (!Number.isFinite(y)) {
      flush(curPos, pos);
      flush(curNeg, neg);
      continue;
    }
    if (y >= 0) {
      if (curNeg.length) {
        const prev = curNeg[curNeg.length - 1];
        const xz = prev.x + (x - prev.x) * (Math.abs(prev.y) / (Math.abs(prev.y) + y + 1e-12));
        curNeg.push({x: xz, y: 0});
        flush(curNeg, neg);
        curPos.push({x: xz, y: 0});
      }
      curPos.push({x, y});
    } else {
      if (curPos.length) {
        const prev = curPos[curPos.length - 1];
        const xz = prev.x + (x - prev.x) * (prev.y / (prev.y + Math.abs(y) + 1e-12));
        curPos.push({x: xz, y: 0});
        flush(curPos, pos);
        curNeg.push({x: xz, y: 0});
      }
      curNeg.push({x, y});
    }
  }
  flush(curPos, pos);
  flush(curNeg, neg);
  return {pos, neg};
}

export function panelPaths(fn: (x: number) => number, vp: Viewport): string[] {
  return segmentsToPaths(sampleCurve(fn, vp.x[0], vp.x[1], vp.y[0], vp.y[1], 240), vp);
}
