// Whiteboard layout: hand-drawn "whiteboard" primitives. Everything is a pure function of `frame`.
// A board is a flat list of timed Items (strokes and handwritten text). <Annotations> draws them in sync with the narration (no visible pen).
// No Math.random: wobble comes from a seeded PRNG.
import React from 'react';

export const INK = '#1f2a44';
export const BLUE = '#2459c9';
export const RED = '#d23a3a';
export const GREEN = '#1f9d55';
export const YELLOW = '#ffd23f';
export const DIM = '#6b7280';
export const PAPER = '#f6f3ea';
// Gochi Hand (SIL OFL, src/fonts/OFL-GochiHand.txt), registered as "Explainer Hand" by loadFonts in theme.ts. No system font in the
// stack: output must not depend on the machine. Text is measured only after useFontGate has let the fonts settle.
export const HAND = '"Explainer Hand"';

export type Pt = [number, number];
export type StrokeItem = {kind: 'stroke'; pts: Pt[]; color: string; w: number; t0: number; dur: number; op?: number; len: number};
export type TextItem = {kind: 'text'; str: string; x: number; y: number; size: number; color: string; t0: number; dur: number; width: number; rot: number; weight?: number};
export type Item = StrokeItem | TextItem;

// ---------- deterministic noise ----------
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------- text measuring (canvas; cached) ----------
const cache = new Map<string, number>();
const MAX_TEXT = 2000; // no drawn string is longer; bounds measuring work and the cache for pathological input
const capText = (str: string): string => (str.length > MAX_TEXT ? str.slice(0, MAX_TEXT) : str);
let ctx2d: CanvasRenderingContext2D | null = null;
/** True when the hand face is registered and loaded (always true without a DOM, e.g. in Node tests). check() would say true for a face that never registered, so look at the face itself. */
const handFontReady = (): boolean => {
  if (typeof document === 'undefined' || !document.fonts) return true;
  for (const f of document.fonts) if (f.family.replace(/["']/g, '') === 'Explainer Hand') return f.status === 'loaded';
  return false;
};
export const measure = (str: string, size: number, weight = 400): number => {
  str = capText(str);
  const key = `${size}|${weight}|${str}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (!ctx2d && typeof document !== 'undefined') ctx2d = document.createElement('canvas').getContext('2d');
  let w = str.length * size * 0.52;
  if (ctx2d) { ctx2d.font = `${weight} ${size}px ${HAND}`; w = ctx2d.measureText(str).width; }
  // widths measured before the hand font is ready (a load that timed out or failed) come from a fallback font: never cache them
  if (handFontReady()) {
    if (cache.size > 20000) cache.clear();
    cache.set(key, w);
  }
  return w;
};

/** Largest font size <= `size` (never below `min`) at which `str` fits in `maxW`. Width is linear in size, so one measurement is enough. */
export const fitSize = (str: string, size: number, maxW: number, weight = 400, min = 24): number => {
  str = capText(str);
  const w = measure(str, size, weight);
  return w <= maxW ? size : Math.max(min, Math.floor((size * maxW) / w));
};

export const wrapText = (str: string, size: number, maxW: number, weight = 400): string[] => {
  str = capText(str);
  const out: string[] = [];
  let cur = '';
  for (const word of str.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(next, size, weight) > maxW) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
};

/** `str` cut (with "...") until it fits `maxW`; ASCII dots because a hand font may lack the ellipsis glyph. */
export const ellipsize = (str: string, size: number, maxW: number, weight = 400): string => {
  if (measure(str, size, weight) <= maxW) return str;
  let s = str.length > 400 ? str.slice(0, 400) : str; // bound the work for pathological input
  while (s.length > 1 && measure(`${s}...`, size, weight) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
};

/** Keeps at most `maxLines` lines, and makes every kept line fit `maxW` (an unbreakable long word is cut with "..."). */
export const clampLines = (lines: string[], maxLines: number, size: number, maxW: number, weight = 400): string[] => {
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = `${out[maxLines - 1]} ...`;
  return out.map((l) => ellipsize(l, size, maxW, weight));
};

/** Fits arbitrary text into a box: shrink to `min`, then wrap to at most `maxLines`, then cut with "...". Never wider than `maxW`. */
export const fitLines = (str: string, size: number, maxW: number, weight = 400, min = 24, maxLines = 1): {size: number; lines: string[]} => {
  str = capText(str);
  const s = fitSize(str, size, maxW, weight, min);
  if (measure(str, s, weight) <= maxW) return {size: s, lines: [str]};
  return {size: s, lines: clampLines(wrapText(str, s, maxW, weight), maxLines, s, maxW, weight)};
};

// ---------- hand-drawn geometry (returns point lists) ----------
const dens = (a: Pt, b: Pt, r: () => number, amp: number, step = 26): Pt[] => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.max(2, Math.round(len / step));
  const nx = -dy / len, ny = dx / len;
  const ph = r() * 6.28;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = amp * (Math.sin(ph + t * len * 0.012) * 0.7 + (r() - 0.5) * 0.6);
    pts.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]);
  }
  return pts;
};
export const polyline = (corners: Pt[], seed: number, amp = 2.4): Pt[] => {
  const r = rng(seed);
  const out: Pt[] = [];
  for (let i = 0; i < corners.length - 1; i++) out.push(...dens(corners[i], corners[i + 1], r, amp).slice(i ? 1 : 0));
  return out;
};
export const lengthOf = (pts: Pt[]) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
export const pointAt = (pts: Pt[], p: number): Pt => {
  const total = lengthOf(pts);
  let d = clamp01(p) * total;
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= s || i === pts.length - 1) { const t = s ? Math.min(1, d / s) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
    d -= s;
  }
  return pts[pts.length - 1];
};
export const rectPts = (x: number, y: number, w: number, h: number, seed: number): Pt[] =>
  polyline([[x + 6, y + 3], [x + w, y - 2], [x + w + 3, y + h], [x - 2, y + h + 3], [x + 2, y - 4], [x + 22, y + 2]], seed, 2.6);
export const ellipsePts = (cx: number, cy: number, rx: number, ry: number, seed: number): Pt[] => {
  const r = rng(seed);
  const a0 = r() * 6.28, ph = r() * 6.28;
  const pts: Pt[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = a0 + t * 6.28 * 1.13;
    const k = 1 + 0.03 * Math.sin(3 * th + ph) + 0.05 * t;
    pts.push([cx + Math.cos(th) * rx * k, cy + Math.sin(th) * ry * k]);
  }
  return pts;
};
export const underlinePts = (x0: number, x1: number, y: number, seed: number, wave = 3.5): Pt[] => {
  const r = rng(seed);
  const n = Math.max(3, Math.round((x1 - x0) / 16));
  const ph = r() * 6.28, slope = (r() - 0.5) * 8;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y + slope * t + wave * Math.sin(ph + i * 0.9) + (r() - 0.5) * 1.6]); }
  return pts;
};
export const curvePts = (a: Pt, b: Pt, bow: number): Pt[] => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const c: Pt = [mx - (dy / len) * bow, my + (dx / len) * bow];
  const pts: Pt[] = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  return pts;
};

// ---------- the board: builds timed items ----------
export class Board {
  items: Item[] = [];
  private seed = 7;
  constructor(seed = 1) { this.seed = seed * 101; }
  nextSeed() { this.seed += 17; return this.seed; }

  stroke(pts: Pt[], color: string, w: number, t0: number, dur?: number, op?: number): number {
    const len = lengthOf(pts);
    const d = dur ?? Math.max(8, Math.min(40, Math.round(len / 30)));
    this.items.push({kind: 'stroke', pts, color, w, t0, dur: d, op, len});
    return t0 + d;
  }
  text(str: string, x: number, y: number, size: number, color: string, t0: number, o: {anchor?: 'start' | 'middle'; dur?: number; weight?: number} = {}): {end: number; x0: number; x1: number} {
    const weight = o.weight ?? 400;
    const width = measure(str, size, weight);
    const x0 = o.anchor === 'middle' ? x - width / 2 : x;
    const d = o.dur ?? Math.min(75, Math.max(8, Math.round(str.length * 1.5)));
    const r = rng(this.nextSeed());
    this.items.push({kind: 'text', str, x: x0, y, size, color, t0, dur: d, width, rot: (r() - 0.5) * 1.4, weight});
    return {end: t0 + d, x0, x1: x0 + width};
  }
  rect(x: number, y: number, w: number, h: number, color: string, t0: number, dur = 22): number {
    const e = this.stroke(rectPts(x, y, w, h, this.nextSeed()), color, 5, t0, dur);
    this.stroke(rectPts(x + 1, y + 1, w - 1, h - 1, this.nextSeed()), color, 2.5, t0 + 3, dur, 0.55);
    return e;
  }
  circle(cx: number, cy: number, rx: number, ry: number, color: string, t0: number, dur = 20): number {
    return this.stroke(ellipsePts(cx, cy, rx, ry, this.nextSeed()), color, 5, t0, dur);
  }
  underline(x0: number, x1: number, y: number, color: string, t0: number, dur?: number): number {
    return this.stroke(underlinePts(x0, x1, y, this.nextSeed()), color, 6, t0, dur ?? Math.max(8, Math.round((x1 - x0) / 40)));
  }
  highlight(x0: number, x1: number, y: number, h: number, t0: number, color = YELLOW): number {
    return this.stroke(underlinePts(x0 - 6, x1 + 10, y, this.nextSeed(), 1.5), color, h, t0, Math.max(10, Math.round((x1 - x0) / 36)), 0.55);
  }
  arrow(a: Pt, b: Pt, color: string, t0: number, bow = 30, dur?: number): number {
    const shaft = curvePts(a, b, bow);
    const end = this.stroke(shaft, color, 5, t0, dur);
    const [px, py] = shaft[shaft.length - 3];
    const ang = Math.atan2(b[1] - py, b[0] - px);
    for (const s of [-1, 1]) {
      const h: Pt = [b[0] - Math.cos(ang + s * 0.5) * 34, b[1] - Math.sin(ang + s * 0.5) * 34];
      this.stroke(polyline([b, h], this.nextSeed(), 1), color, 5, end, 5);
    }
    return end + 5;
  }
  check(x: number, y: number, s: number, color: string, t0: number): number {
    return this.stroke(polyline([[x, y], [x + s * 0.35, y + s * 0.4], [x + s, y - s * 0.55]], this.nextSeed(), 1.2), color, 7, t0, 10);
  }
}

// ---------- rendering ----------
const strokeD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

export const Annotations: React.FC<{items: Item[]; frame: number; uid: string}> = ({items, frame, uid}) => (
  <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0}}>
    <defs>
      {items.map((it, i) => it.kind === 'text' && frame >= it.t0 && (
        <clipPath key={i} id={`${uid}-c${i}`}>
          <rect x={it.x - 6} y={it.y - it.size * 1.05} width={(it.width + 12) * clamp01((frame - it.t0) / it.dur)} height={it.size * 1.5} />
        </clipPath>
      ))}
    </defs>
    {items.map((it, i) => {
      if (frame < it.t0) return null;
      const p = clamp01((frame - it.t0) / it.dur);
      if (it.kind === 'text') {
        return (
          <text key={i} x={it.x} y={it.y} fontSize={it.size} fontFamily={HAND} fontWeight={it.weight} fill={it.color}
            transform={`rotate(${it.rot} ${it.x} ${it.y})`} clipPath={`url(#${uid}-c${i})`}>{it.str}</text>
        );
      }
      return (
        <path key={i} d={strokeD(it.pts)} pathLength={1} fill="none" stroke={it.color} strokeWidth={it.w} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="1 1" strokeDashoffset={1 - ease(p)} opacity={it.op ?? 1} style={it.op && it.op < 0.9 && it.w > 20 ? {mixBlendMode: 'multiply'} : undefined} />
      );
    })}
  </svg>
);
