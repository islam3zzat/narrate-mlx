// Pure 2D plotting primitives: domains, viewports, deterministic ticks/formatting, curve sampling, and easing.
// Pure TS leaf (no React, Remotion, or Three).

export const PLOT_TONES = ['secondary', 'accent', 'primary', 'danger', 'ink'] as const;
export type PlotTone = (typeof PLOT_TONES)[number];

export type Domain = readonly [number, number];
export const DOMAIN_LIMITS = {maxAbs: 1e6, minSpan: 1e-6} as const;

export type PxRect = {x: number; y: number; w: number; h: number};
export type Viewport = {x: Domain; y: Domain; px: PxRect};
export type Pt = {x: number; y: number};

export function domainIssue(name: string, d: unknown): string | null {
  if (!Array.isArray(d) || d.length !== 2) return `${name} must be [min, max]`;
  const [a, b] = d;
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) {
    return `${name} bounds must be finite numbers`;
  }
  if (Math.abs(a) > DOMAIN_LIMITS.maxAbs || Math.abs(b) > DOMAIN_LIMITS.maxAbs) {
    return `${name} bounds must stay within ±${DOMAIN_LIMITS.maxAbs}`;
  }
  if (a >= b) return `${name} min (${a}) must be strictly less than max (${b})`;
  if (b - a < DOMAIN_LIMITS.minSpan) return `${name} span must be at least ${DOMAIN_LIMITS.minSpan}`;
  return null;
}

export const clampPx = (v: number): number => (Number.isFinite(v) ? Math.max(-1e4, Math.min(1e4, v)) : 0);

export const toPxX = (x: number, vp: Viewport): number =>
  clampPx(vp.px.x + ((x - vp.x[0]) / (vp.x[1] - vp.x[0])) * vp.px.w);

export const toPxY = (y: number, vp: Viewport): number =>
  clampPx(vp.px.y + vp.px.h - ((y - vp.y[0]) / (vp.y[1] - vp.y[0])) * vp.px.h);

export const toWorldX = (px: number, vp: Viewport): number =>
  vp.x[0] + ((px - vp.px.x) / vp.px.w) * (vp.x[1] - vp.x[0]);

export const toWorldY = (py: number, vp: Viewport): number =>
  vp.y[0] + ((vp.px.y + vp.px.h - py) / vp.px.h) * (vp.y[1] - vp.y[0]);

export const lerpViewport = (a: Viewport, b: Viewport, t: number): Viewport => {
  const k = Math.max(0, Math.min(1, t));
  const lerp = (u: number, v: number) => u + (v - u) * k;
  return {
    x: [lerp(a.x[0], b.x[0]), lerp(a.x[1], b.x[1])],
    y: [lerp(a.y[0], b.y[0]), lerp(a.y[1], b.y[1])],
    px: a.px,
  };
};

const MAX_TICKS = 20;

/** Clean human-readable ticks inside [min, max], immune to float64 `t += step` infinite loops. */
export function niceTicks(min: number, max: number, maxTicks = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const target = Math.max(2, Math.min(MAX_TICKS, Math.floor(maxTicks)));
  const span = max - min;
  const rawStep = span / (target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const mult = norm <= 1.2 ? 1 : norm <= 2.5 ? 2 : norm <= 5.5 ? 5 : 10;
  const step = mult * mag;
  if (!Number.isFinite(step) || step <= 0) return [];
  const kStart = Math.ceil((min - 1e-12 * span) / step);
  const kEnd = Math.floor((max + 1e-12 * span) / step);
  const count = Math.min(MAX_TICKS, Math.max(0, kEnd - kStart + 1));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const raw = (kStart + i) * step;
    const rounded = Number(raw.toPrecision(12));
    out.push(Object.is(rounded, -0) || Math.abs(rounded) < step * 1e-9 ? 0 : rounded);
  }
  return out;
}

/** Deterministic tick label without Intl (consistent across Node and Chrome). */
export function formatTick(n: number): string {
  if (!Number.isFinite(n)) return '';
  const z = Object.is(n, -0) || Math.abs(n) < 1e-12 ? 0 : n;
  if (z === 0) return '0';
  const abs = Math.abs(z);
  if (abs >= 1e5 || abs < 1e-4) {
    return z.toExponential(1).replace(/\.0e/, 'e').replace(/e\+/, 'e');
  }
  const fixed = abs >= 100 ? z.toFixed(1) : abs >= 1 ? z.toFixed(2) : z.toFixed(4);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  return trimmed === '-0' ? '0' : trimmed;
}

export function formatNum(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  const d = Math.max(0, Math.min(6, decimals));
  const z = Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n;
  const s = z.toFixed(d);
  return s === '-0' || s.startsWith('-0.') && Number(s) === 0 ? s.slice(1) : s;
}

/** Linearly interpolate sorted (x, y) series; returns NaN outside [x0, xN]. */
export function interpolateSeries(points: readonly (readonly [number, number])[], x: number): number {
  const n = points.length;
  if (n < 2 || !Number.isFinite(x)) return NaN;
  if (x < points[0][0] - 1e-9 || x > points[n - 1][0] + 1e-9) return NaN;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];
  const dx = x1 - x0;
  if (dx <= 0) return y0;
  const t = (x - x0) / dx;
  return y0 + (y1 - y0) * t;
}

/**
 * Sample a 1D function into continuous polyline segments across [xMin, xMax].
 * Splits on NaN, extreme off-screen excursions, and true discontinuities (asymptotes / steps like 1/x, tan(x), floor(x))
 * while preserving steep continuous curves (like e^x) by probing the midpoint.
 */
export function sampleCurve(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  samples = 240,
): Pt[][] {
  const n = Math.max(16, Math.min(600, samples));
  const ySpan = Math.max(1e-6, yMax - yMin);
  const clipLo = yMin - ySpan * 4;
  const clipHi = yMax + ySpan * 4;
  const segments: Pt[][] = [];
  let cur: Pt[] = [];
  const flush = () => {
    if (cur.length >= 2) segments.push(cur);
    cur = [];
  };

  let prevX = NaN, prevY = NaN;
  for (let i = 0; i <= n; i++) {
    const x = xMin + (i / n) * (xMax - xMin);
    const y = fn(x);
    const valid = Number.isFinite(y) && y >= clipLo && y <= clipHi;
    if (!valid) {
      flush();
      prevX = NaN;
      prevY = NaN;
      continue;
    }
    if (cur.length > 0 && Number.isFinite(prevY)) {
      const jump = Math.abs(y - prevY);
      if (jump > ySpan * 1.1) {
        // Probe midpoint: if midpoint does not sit roughly between prevY and y (or crosses asymptote), split.
        const ym = fn((prevX + x) * 0.5);
        const lo = Math.min(prevY, y), hi = Math.max(prevY, y);
        const continuous = Number.isFinite(ym) && ym >= lo - ySpan * 0.1 && ym <= hi + ySpan * 0.1;
        if (!continuous || jump > ySpan * 2.5) {
          flush();
        }
      }
    }
    cur.push({x, y});
    prevX = x;
    prevY = y;
  }
  flush();
  return segments;
}

/** Convert world-space polyline segments to SVG path strings (guaranteed >= 2 points per path). */
export function segmentsToPaths(segments: readonly Pt[][], vp: Viewport): string[] {
  const paths: string[] = [];
  for (const seg of segments) {
    if (seg.length < 2) continue;
    const cmds = seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toPxX(p.x, vp).toFixed(2)} ${toPxY(p.y, vp).toFixed(2)}`);
    paths.push(cmds.join(' '));
  }
  return paths;
}

export const easeInOutCubic = (t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};

export const easeOutCubic = (t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - k, 3);
};

export const stageProgress = (frame: number, start: number, dur = 18): number => {
  if (dur <= 0) return frame >= start ? 1 : 0;
  return easeInOutCubic((frame - start) / dur);
};
