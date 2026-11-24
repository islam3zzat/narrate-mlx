// Pure math, domain inference, log/linear tick generation, Pareto frontier, and label placement for `chart`.
// Pure TS leaf (no React, Remotion, or Three).
import type {ChartVisualT} from './schema';
import {formatTick, niceTicks, type Domain} from '../plot-kit';
import {formatStat, inferDecimals} from '../stat/format';
import {displayCells} from '../chars';

export type AxisScale = 'linear' | 'log';

export function toPlotVal(v: number, scale: AxisScale): number {
  return scale === 'log' ? Math.log10(Math.max(1e-30, v)) : v;
}

export function fromPlotVal(p: number, scale: AxisScale): number {
  return scale === 'log' ? Math.pow(10, p) : p;
}

/** Deterministic compact tick formatter without Intl (supports scientific/log scales as well as regular numbers). */
export function formatAxisTick(n: number): string {
  if (!Number.isFinite(n)) return '';
  const z = Math.abs(n) < 1e-12 ? 0 : n;
  if (z === 0) return '0';
  const abs = Math.abs(z);
  const sign = z < 0 ? '-' : '';
  if (abs >= 1e9 && abs < 1e12) {
    const b = abs / 1e9;
    return `${sign}${Math.abs(b - Math.round(b)) < 1e-6 ? Math.round(b) : formatTick(b)}B`;
  }
  if (abs >= 1e12) {
    const exp = Math.round(Math.log10(abs));
    if (Math.abs(abs / Math.pow(10, exp) - 1) < 1e-6) return `${sign}1e${exp}`;
    return `${sign}${abs.toExponential(1).replace(/\.0e/, 'e').replace(/e\+/, 'e')}`;
  }
  if (abs >= 1e6) {
    const m = abs / 1e6;
    return `${sign}${Math.abs(m - Math.round(m)) < 1e-6 ? Math.round(m) : formatTick(m)}M`;
  }
  if (abs >= 1e4) {
    const k = abs / 1e3;
    return `${sign}${Math.abs(k - Math.round(k)) < 1e-6 ? Math.round(k) : formatTick(k)}K`;
  }
  return formatTick(z);
}

/** Deterministic bar/callout value formatter (uses stat/format when small, scientific suffixes when huge). */
export function formatChartValue(v: number, decimals: number, unit?: string): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e5 || (abs > 0 && abs < 1e-3)) {
    const s = formatAxisTick(v);
    return unit ? `${s}${unit.startsWith('%') ? unit : ` ${unit}`}` : s;
  }
  return formatStat(v, decimals, unit);
}

/** Deterministic logarithmic ticks cleanly spaced within [min, max] (strictly positive). */
export function logTicks(min: number, max: number, maxTicks = 6): number[] {
  if (!(min > 0 && max > min && Number.isFinite(min) && Number.isFinite(max))) return [];
  const eMin = Math.floor(Math.log10(min));
  const eMax = Math.ceil(Math.log10(max));
  const decades = Math.max(1, eMax - eMin);
  const stepDecade = decades > maxTicks ? Math.ceil(decades / maxTicks) : 1;
  const majors: number[] = [];
  for (let e = eMin; e <= eMax && majors.length < 16; e += stepDecade) {
    const val = Math.pow(10, e);
    if (val >= min * (1 - 1e-9) && val <= max * (1 + 1e-9)) majors.push(Number(val.toPrecision(10)));
  }
  if (decades <= 2 && majors.length <= 3) {
    const rich: number[] = [];
    for (let e = eMin; e <= eMax; e++) {
      for (const m of [1, 2, 5]) {
        const val = m * Math.pow(10, e);
        if (val >= min * (1 - 1e-9) && val <= max * (1 + 1e-9)) rich.push(Number(val.toPrecision(10)));
      }
    }
    if (rich.length >= 2 && rich.length <= 8) return rich;
  }
  if (majors.length >= 2) return majors;
  // Tight sub-decade positive range: fall back to nicely rounded linear ticks inside [min, max].
  return niceTicks(min, max, maxTicks).filter((t) => t > 0);
}

export function scaleTicks(min: number, max: number, scale: AxisScale, maxTicks = 6): number[] {
  return scale === 'log' ? logTicks(min, max, maxTicks) : niceTicks(min, max, maxTicks);
}

function padLinearDomain(vals: number[], includeZero: boolean): Domain {
  let lo = includeZero ? 0 : Infinity;
  let hi = includeZero ? 0 : -Infinity;
  for (const v of vals) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  const span = Math.max(1e-6, hi - lo);
  const padLo = includeZero && lo === 0 ? 0 : lo - span * 0.08;
  const padHi = includeZero && hi === 0 ? 0 : hi + span * 0.1;
  const ticks = niceTicks(padLo, padHi, 5);
  const outLo = ticks.length && ticks[0] <= padLo ? ticks[0] : padLo;
  let outHi = padHi;
  if (ticks.length >= 2) {
    const step = ticks[1] - ticks[0];
    if (ticks[ticks.length - 1] + step * 0.5 < padHi) outHi = ticks[ticks.length - 1] + step;
    else outHi = Math.max(padHi, ticks[ticks.length - 1]);
  }
  return [outLo, outHi <= outLo ? outLo + 1 : outHi];
}

function padLogDomain(vals: number[]): Domain {
  const pos = vals.filter((v) => v > 0 && Number.isFinite(v));
  if (!pos.length) return [1, 10];
  let lo = Infinity, hi = -Infinity;
  for (const v of pos) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) return [lo * 0.5, hi * 2];
  const logSpan = Math.max(0.2, Math.log10(hi) - Math.log10(lo));
  return [Math.pow(10, Math.log10(lo) - logSpan * 0.08), Math.pow(10, Math.log10(hi) + logSpan * 0.08)];
}

export function inferChartDomains(v: ChartVisualT): {xDomain: Domain; yDomain: Domain; valueDecimals: number} {
  const xScale: AxisScale = v.xScale ?? 'linear';
  const yScale: AxisScale = v.yScale ?? 'linear';

  if (v.kind === 'bar') {
    const vals: number[] = [];
    for (const s of v.series ?? []) {
      const sv = s.values ?? [];
      sv.forEach((val, j) => {
        vals.push(val);
        if (s.errors && s.errors[j] !== undefined) {
          vals.push(val - s.errors[j], val + s.errors[j]);
        } else if (s.ci && s.ci[j]) {
          vals.push(s.ci[j][0], s.ci[j][1]);
        }
      });
    }
    if (v.baseline) vals.push(v.baseline.value);
    const yDomain: Domain = v.yDomain
      ? [v.yDomain[0], v.yDomain[1]]
      : yScale === 'log'
        ? padLogDomain(vals)
        : padLinearDomain(vals, true);
    const allPrimary = (v.series ?? []).flatMap((s) => s.values ?? []);
    const valueDecimals = Math.min(2, inferDecimals(...allPrimary));
    return {xDomain: [0, Math.max(1, v.categories?.length ?? 1)], yDomain, valueDecimals};
  }

  if (v.kind === 'line') {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of v.series ?? []) {
      for (const [px, py] of s.points ?? []) {
        xs.push(px);
        ys.push(py);
      }
      for (const [lo, hi] of s.band ?? []) {
        ys.push(lo, hi);
      }
    }
    if (v.baseline) ys.push(v.baseline.value);
    const xDomain: Domain = v.xDomain
      ? [v.xDomain[0], v.xDomain[1]]
      : xScale === 'log'
        ? padLogDomain(xs)
        : [Math.min(...xs), Math.max(...xs) === Math.min(...xs) ? Math.min(...xs) + 1 : Math.max(...xs)];
    const yDomain: Domain = v.yDomain
      ? [v.yDomain[0], v.yDomain[1]]
      : yScale === 'log'
        ? padLogDomain(ys)
        : padLinearDomain(ys, false);
    return {xDomain, yDomain, valueDecimals: 2};
  }

  // scatter
  const pts = v.points ?? [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  if (v.baseline) ys.push(v.baseline.value);
  const xDomain: Domain = v.xDomain
    ? [v.xDomain[0], v.xDomain[1]]
    : xScale === 'log'
      ? padLogDomain(xs)
      : padLinearDomain(xs, false);
  const yDomain: Domain = v.yDomain
    ? [v.yDomain[0], v.yDomain[1]]
    : yScale === 'log'
      ? padLogDomain(ys)
      : padLinearDomain(ys, false);
  return {xDomain, yDomain, valueDecimals: 2};
}

export type ScatterProjectedPt = {
  idx: number;
  id?: string;
  label: string;
  cx: number;
  cy: number;
  r: number;
  x: number;
  y: number;
  highlight: boolean;
  onFrontier: boolean;
};

/**
 * Compute non-dominated Pareto frontier indices sorted strictly left-to-right along x.
 */
export function computeParetoFrontier(
  points: readonly {x: number; y: number}[],
  betterX: 'min' | 'max' = 'min',
  betterY: 'min' | 'max' = 'max',
): number[] {
  const isBetterX = (a: number, b: number) => (betterX === 'min' ? a <= b : a >= b);
  const isBetterY = (a: number, b: number) => (betterY === 'min' ? a <= b : a >= b);

  const frontier: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let dominated = false;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const q = points[j];
      const condBetter = isBetterX(q.x, p.x) && isBetterY(q.y, p.y);
      const condStrict = (betterX === 'min' ? q.x < p.x : q.x > p.x) || (betterY === 'min' ? q.y < p.y : q.y > p.y);
      if (condBetter && condStrict) {
        dominated = true;
        break;
      }
    }
    if (!dominated) frontier.push(i);
  }
  return frontier.sort((a, b) => points[a].x - points[b].x || points[a].y - points[b].y);
}

export type LabelBox = {
  idx: number;
  tx: number;
  ty: number;
  anchor: 'start' | 'end' | 'middle';
  bx: number;
  by: number;
  bw: number;
  bh: number;
};

/** Deterministic collision-aware label placement for scatter points inside `px` bounds. */
export function layoutScatterLabels(
  pts: readonly ScatterProjectedPt[],
  px: {x: number; y: number; w: number; h: number},
): LabelBox[] {
  const placed: LabelBox[] = [];
  const charW = 9.2;
  const bh = 25;
  const candidates: Array<{dx: number; dy: number; anchor: 'start' | 'end' | 'middle'}> = [
    {dx: 14, dy: -10, anchor: 'start'},
    {dx: -14, dy: -10, anchor: 'end'},
    {dx: 14, dy: 20, anchor: 'start'},
    {dx: -14, dy: 20, anchor: 'end'},
    {dx: 0, dy: -20, anchor: 'middle'},
    {dx: 0, dy: 28, anchor: 'middle'},
  ];

  for (const pt of pts) {
    const bw = Math.max(44, displayCells(pt.label) * charW + 12);
    let best: LabelBox | null = null;
    let bestPenalty = Infinity;

    for (const c of candidates) {
      const tx = pt.cx + c.dx;
      const ty = pt.cy + c.dy;
      const bx = c.anchor === 'start' ? tx - 4 : c.anchor === 'end' ? tx - bw + 4 : tx - bw / 2;
      const by = ty - 18;
      let penalty = 0;

      // Keep inside plot frame
      if (bx < px.x + 6) penalty += (px.x + 6 - bx) * 20;
      if (bx + bw > px.x + px.w - 6) penalty += (bx + bw - (px.x + px.w - 6)) * 20;
      if (by < px.y + 6) penalty += (px.y + 6 - by) * 20;
      if (by + bh > px.y + px.h - 6) penalty += (by + bh - (px.y + px.h - 6)) * 20;

      // Avoid overlapping other point dots
      for (const other of pts) {
        if (other.idx === pt.idx) continue;
        const ox = Math.max(bx, Math.min(other.cx, bx + bw));
        const oy = Math.max(by, Math.min(other.cy, by + bh));
        const d2 = (ox - other.cx) ** 2 + (oy - other.cy) ** 2;
        if (d2 < (other.r + 8) ** 2) penalty += 600;
      }

      // Avoid overlapping previously placed label boxes
      for (const prev of placed) {
        const overlapX = Math.max(0, Math.min(bx + bw, prev.bx + prev.bw) - Math.max(bx, prev.bx));
        const overlapY = Math.max(0, Math.min(by + bh, prev.by + prev.bh) - Math.max(by, prev.by));
        if (overlapX > 0 && overlapY > 0) penalty += overlapX * overlapY * 2;
      }

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = {idx: pt.idx, tx, ty, anchor: c.anchor, bx, by, bw, bh};
      }
    }
    placed.push(best ?? {idx: pt.idx, tx: pt.cx + 14, ty: pt.cy - 10, anchor: 'start', bx: pt.cx + 10, by: pt.cy - 28, bw, bh});
  }
  return placed;
}
