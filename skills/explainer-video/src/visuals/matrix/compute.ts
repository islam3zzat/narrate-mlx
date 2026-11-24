// Pure matrix normalization, deterministic formatting, highlight geometry, and focus resolution.
// Pure TS leaf (no React, Remotion, or Three).
import type {MatrixHighlightT, MatrixVisualT} from './schema';
import {formatStat, inferDecimals} from '../stat/format';
import type {Domain} from '../plot-kit';

export type CellHighlightBounds = {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
};

export function inferMatrixDomain(v: MatrixVisualT): {domain: Domain; decimals: number} {
  const flat = v.values.flat();
  const decimals = v.decimals ?? Math.min(2, inferDecimals(...flat));
  if (v.domain) return {domain: [v.domain[0], v.domain[1]], decimals};
  let min = Infinity;
  let max = -Infinity;
  for (const val of flat) {
    if (val < min) min = val;
    if (val > max) max = val;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {domain: [0, 1], decimals};
  if (v.scale === 'diverging') {
    const bound = Math.max(Math.abs(min), Math.abs(max), 1e-6);
    return {domain: [-bound, bound], decimals};
  }
  if (max === min) return {domain: [min === 0 ? 0 : min - 1, max + 1], decimals};
  return {domain: [min, max], decimals};
}

/** Normalize value to [0, 1] for sequential or [-1, 1] for diverging scales. */
export function normalizeIntensity(val: number, domain: Domain, scale: 'sequential' | 'diverging'): number {
  const [lo, hi] = domain;
  if (scale === 'diverging') {
    const bound = Math.max(Math.abs(lo), Math.abs(hi), 1e-12);
    return Math.max(-1, Math.min(1, val / bound));
  }
  return Math.max(0, Math.min(1, (val - lo) / Math.max(1e-12, hi - lo)));
}

export function formatMatrixCell(val: number, decimals: number, unit?: string): string {
  return formatStat(val, decimals, unit);
}

export function boundsOfHighlight(h: MatrixHighlightT, nRows: number, nCols: number): CellHighlightBounds {
  if (h.kind === 'row') {
    const r = Math.min(nRows - 1, h.row ?? 0);
    return {r0: r, r1: r, c0: 0, c1: nCols - 1};
  }
  if (h.kind === 'col') {
    const c = Math.min(nCols - 1, h.col ?? 0);
    return {r0: 0, r1: nRows - 1, c0: c, c1: c};
  }
  if (h.kind === 'cell') {
    const r = Math.min(nRows - 1, h.row ?? 0);
    const c = Math.min(nCols - 1, h.col ?? 0);
    return {r0: r, r1: r, c0: c, c1: c};
  }
  const [r0, r1] = h.rows ?? [0, 0];
  const [c0, c1] = h.cols ?? [0, 0];
  return {r0, r1: Math.min(nRows - 1, r1), c0, c1: Math.min(nCols - 1, c1)};
}

export function cellInBounds(r: number, c: number, b: CellHighlightBounds): boolean {
  return r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
}

/** Check whether cell (r, c) matches any target inside focus Set `s`. */
export function cellMatchesFocusSet(
  r: number,
  c: number,
  s: Set<string>,
  v: MatrixVisualT,
): boolean {
  if (s.has(`r${r}`) || s.has(`c${c}`) || s.has(`r${r}_c${c}`)) return true;
  for (const h of v.highlights ?? []) {
    if (h.id && s.has(h.id)) {
      if (cellInBounds(r, c, boundsOfHighlight(h, v.rows.length, v.cols.length))) return true;
    }
  }
  return false;
}
