// Pure geometry of the speaker avatar: a faceless hand-drawn bust (a head circle over a shoulder arc) in a 100x100 box, plus the
// chest badge that carries the speaker's initial. The hand-drawn wobble is seeded from the speaker's index, so the two speakers
// each keep their own slightly different outline and every render draws it identically. Zero React, so it is testable under node.
import {unsupportedGlyph} from '../whiteboard/glyphs';

export const AVATAR_BOX = 100;
export type AvatarSize = 'sm' | 'md';
/** Rendered pixel size of each avatar size. */
export const AVATAR_PX: Record<AvatarSize, number> = {sm: 54, md: 76};

export type AvatarGeom = {
  /** SVG path data (closed) of the head and of the shoulders, in the 100x100 box. */
  head: string;
  shoulders: string;
  badge: {cx: number; cy: number; r: number; font: number};
  /** The same two outlines as point lists in the 100x100 box (the curves sampled), for drawing the bust with pen strokes: the whiteboard. */
  outline: {head: Pt[]; shoulders: Pt[]};
};
export type Pt = [number, number];

// Small seeded PRNG (mulberry32), the same sequence as the board's `rng` in sdk/annotate.tsx; that file imports React, which this
// pure module must not.
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const f = (n: number): string => String(Math.round(n * 100) / 100);

/** The bust of speaker `index` (their position in the script's `speakers`). */
export const avatarGeom = (index: number): AvatarGeom => {
  const rand = seeded(0x5a17 + index * 7919);
  const jit = (amp: number) => (rand() - 0.5) * 2 * amp;
  // head: 16 points around a circle, each nudged in radius, joined by a closed smooth curve through the midpoints
  const N = 16, cx = 50, cy = 34, r = 22;
  const pts = Array.from({length: N}, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const rr = r + jit(0.9);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  });
  const mid = (i: number) => {
    const p = pts[i % N], q = pts[(i + 1) % N];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
  };
  const m0 = mid(N - 1);
  let head = `M${f(m0[0])} ${f(m0[1])}`;
  for (let i = 0; i < N; i++) {
    const m = mid(i);
    head += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  head += 'Z';
  // shoulders: one arc from the left edge up over the shoulders and down the right edge, closed along the bottom
  const L = 8 + jit(1.5), R = 92 + jit(1.5), top = 56 + jit(1.2);
  const lc1x = L + jit(2), lc2x = 26 + jit(2), rc1x = 74 + jit(2), rc2x = R + jit(2);
  const shoulders = `M${f(L)} 100C${f(lc1x)} ${f(top + 14)} ${f(lc2x)} ${f(top)} 50 ${f(top)}`
    + `C${f(rc1x)} ${f(top)} ${f(rc2x)} ${f(top + 14)} ${f(R)} 100Z`;
  // sampled outlines, from the same control points as the paths above
  const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] => Array.from({length: n}, (_, k) => {
    const t = (k + 1) / n, u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  });
  const quad = (p0: Pt, p1: Pt, p2: Pt, n: number): Pt[] => Array.from({length: n}, (_, k) => {
    const t = (k + 1) / n, u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  });
  let prevM: Pt = [m0[0], m0[1]];
  const headPts: Pt[] = [prevM];
  for (let i = 0; i < N; i++) {
    const m = mid(i);
    headPts.push(...quad(prevM, [pts[i][0], pts[i][1]], [m[0], m[1]], 3));
    prevM = [m[0], m[1]];
  }
  const shoulderPts: Pt[] = [[L, 100], ...bez([L, 100], [lc1x, top + 14], [lc2x, top], [50, top], 8), ...bez([50, top], [rc1x, top], [rc2x, top + 14], [R, 100], 8)];
  return {head, shoulders, badge: {cx: 50, cy: 82, r: 16, font: 25}, outline: {head: headPts, shoulders: shoulderPts}};
};

/**
 * The letter drawn on the chest badge: the first letter or digit of the name, upper-cased. The hand font must be able to draw it
 * (schema.ts already rejects names it cannot draw); '?' stands in rather than a missing-glyph box if one ever gets here.
 */
export const speakerInitial = (name: string): string => {
  for (const ch of name) {
    if (!/[\p{L}\p{N}]/u.test(ch)) continue;
    const up = [...ch.toUpperCase()][0];
    if (unsupportedGlyph(up) === null) return up;
    return unsupportedGlyph(ch) === null ? ch : '?';
  }
  return '?';
};
