// Where the `code` spotlight sits at a frame: a pure function of the highlight stops (no React, no remotion).
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const DIM = 0.35;
const ease = (p: number) => p * p * (3 - 2 * p);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export type Stop = {at: number; from: number; to: number; scroll: number; label: string};

/** Where the spotlight sits at `frame`: a pure function of the stops (sorted by time). Before the first stop everything is at full strength. */
export const spotlight = (stops: Stop[], frame: number) => {
  let k = -1;
  stops.forEach((s, i) => { if (frame >= s.at) k = i; });
  if (k < 0) return {band: 0, from: 1, to: 1, scroll: 0, k, p: 1, line: (_: number) => 1};
  const cur = stops[k], prev = k > 0 ? stops[k - 1] : null;
  const p = ease(clamp01((frame - cur.at) / 14));
  const inRange = (s: Stop | null, i: number) => (s ? (i >= s.from && i <= s.to ? 1 : DIM) : 1);
  return {
    band: prev ? 1 : p,
    from: prev ? lerp(prev.from, cur.from, p) : cur.from,
    to: prev ? lerp(prev.to, cur.to, p) : cur.to,
    scroll: lerp(prev ? prev.scroll : 0, cur.scroll, p),
    k, p,
    line: (i: number) => lerp(inRange(prev, i), inRange(cur, i), p),
  };
};

