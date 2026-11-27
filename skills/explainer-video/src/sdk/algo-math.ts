// Pure deterministic math & geometry helpers for state-driven animated algorithms.
// Zero React, Remotion, Three, or Intl imports (Node-safe and deterministic across Node/Chrome).
import constants from '../constants.json';
import {formatNumber, inferDecimals} from '../visuals/stat/format';

export const ALGO_STATE_TONES = [
  'default',
  'active',
  'compare',
  'swap',
  'pivot',
  'sorted',
  'visited',
  'frontier',
  'dim',
] as const;
export type AlgoStateTone = (typeof ALGO_STATE_TONES)[number];

export const DEFAULT_STEP_TRANSITION_FRAMES = 18;

export const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const easeOutCubic = (t: number): number => {
  const u = clamp01(t);
  return 1 - (1 - u) ** 3;
};

export const easeInOutCubic = (t: number): number => {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};

export type StepTimeline = {
  prevIndex: number;
  index: number;
  progress: number;
  eased: number;
  isTransitioning: boolean;
  startFrame: number;
};

/** Frame at which step `index` of `count` begins, aligned to narration `reveal[]` seconds when available. */
export const stepStartFrame = (
  index: number,
  count: number,
  lead: number,
  audioFrames: number,
  reveal?: readonly number[],
): number =>
  reveal && reveal[Math.floor(index)] !== undefined
    ? lead + Math.round(reveal[Math.floor(index)] * constants.fps)
    : lead + Math.round((index / Math.max(count, 1)) * audioFrames * 0.8);

/** Map `frame` onto discrete state-machine transitions `[prevIndex -> index]` with eased progress `0..1`. */
export const stepTimeline = (
  frame: number,
  lead: number,
  audioFrames: number,
  count: number,
  reveal?: readonly number[],
  transitionFrames = DEFAULT_STEP_TRANSITION_FRAMES,
): StepTimeline => {
  if (count <= 1) {
    return {prevIndex: 0, index: 0, progress: 1, eased: 1, isTransitioning: false, startFrame: lead};
  }
  const starts = Array.from({length: count}, (_, i) => stepStartFrame(i, count, lead, audioFrames, reveal));
  let k = -1;
  for (let i = 0; i < count; i++) {
    if (frame >= starts[i]) k = i;
  }
  if (k <= 0) {
    return {prevIndex: 0, index: 0, progress: 1, eased: 1, isTransitioning: false, startFrame: starts[0]};
  }
  const len = Math.max(1, transitionFrames);
  const raw = clamp01((frame - starts[k]) / len);
  return {
    prevIndex: k - 1,
    index: k,
    progress: raw,
    eased: easeInOutCubic(raw),
    isTransitioning: raw < 1,
    startFrame: starts[k],
  };
};

/** Sorted, merged active [start, end] intervals covering entrance and step transitions for 2D frame dedup. */
export const stepActiveIntervals = (
  count: number,
  lead: number,
  audioFrames: number,
  reveal?: readonly number[],
  transitionFrames = DEFAULT_STEP_TRANSITION_FRAMES,
): [number, number][] => {
  const len = Math.max(1, transitionFrames);
  const raw: [number, number][] = [[0, Math.max(0, lead + 12)]];
  for (let i = 1; i < count; i++) {
    const start = stepStartFrame(i, count, lead, audioFrames, reveal);
    raw.push([Math.max(0, start), Math.max(0, start + len + 1)]);
  }
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], iv[1]);
    } else {
      merged.push([iv[0], iv[1]]);
    }
  }
  return merged;
};

export type KeyedPos = {
  id: string;
  x: number;
  y: number;
  fromIndex: number;
  toIndex: number;
  moved: boolean;
  swapped: boolean;
  arcSign: -1 | 0 | 1;
  opacity: number;
};

/**
 * Deterministic FLIP positions between `prevIds` and `nextIds`.
 * Items whose trajectories cross another moving item arc symmetrically above/below `baseY` so swaps never collide.
 */
export const interpolateKeyedPositions = (
  prevIds: readonly string[],
  nextIds: readonly string[],
  slotX: (index: number) => number,
  baseY: number,
  eased: number,
  opts?: {arcHeight?: number},
): KeyedPos[] => {
  const t = clamp01(eased);
  const arcH = opts?.arcHeight ?? 52;
  const prevIndexOf = new Map(prevIds.map((id, i) => [id, i]));
  const moving: {id: string; from: number; to: number}[] = [];
  nextIds.forEach((id, to) => {
    const from = prevIndexOf.get(id);
    if (from !== undefined && from !== to) moving.push({id, from, to});
  });

  const crosses = (from: number, to: number): boolean =>
    moving.some((o) => (o.from - from) * (o.to - to) < 0);

  return nextIds.map((id, toIndex) => {
    const fromIndex = prevIndexOf.get(id);
    if (fromIndex === undefined) {
      return {id, x: slotX(toIndex), y: baseY, fromIndex: -1, toIndex, moved: false, swapped: false, arcSign: 0, opacity: t};
    }
    if (fromIndex === toIndex) {
      return {id, x: slotX(toIndex), y: baseY, fromIndex, toIndex, moved: false, swapped: false, arcSign: 0, opacity: 1};
    }
    const x0 = slotX(fromIndex);
    const x1 = slotX(toIndex);
    const x = x0 + (x1 - x0) * t;
    const swapped = crosses(fromIndex, toIndex);
    const arcSign: -1 | 0 | 1 = swapped ? (toIndex > fromIndex ? -1 : 1) : 0;
    const dy = arcSign === 0 ? 0 : arcSign * arcH * Math.sin(Math.PI * t);
    return {id, x, y: baseY + dy, fromIndex, toIndex, moved: true, swapped, arcSign, opacity: 1};
  });
};

export type ArrayViewport = {x: number; y: number; width: number; height: number};

export type ArrayLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  gap: number;
  rowY: number;
  barBaseY: number;
  barMaxH: number;
  slotLeftX: (index: number) => number;
  slotCenterX: (index: number) => number;
};

/** Compute centered array cell/bar slots inside `viewport` with headroom for swap arcs and pointer badges. */
export const computeArrayLayout = (
  count: number,
  viewport: ArrayViewport,
  opts?: {
    mode?: 'cells' | 'bars';
    maxCellW?: number;
    gap?: number;
    arcHeadroom?: number;
    pointerHeadroom?: number;
    topHeadroom?: number;
  },
): ArrayLayout => {
  const n = Math.max(1, Math.floor(count));
  const mode = opts?.mode ?? 'cells';
  const gap = opts?.gap ?? (n > 12 ? 8 : n > 8 ? 12 : 16);
  const maxCellW = opts?.maxCellW ?? (mode === 'bars' ? 116 : 124);
  const cellW = Math.max(24, Math.min(maxCellW, Math.floor((viewport.width - gap * (n - 1)) / n)));
  const totalW = cellW * n + gap * (n - 1);
  const startX = viewport.x + Math.round((viewport.width - totalW) / 2);

  const topHeadroom = opts?.topHeadroom ?? 56;
  const pointerHeadroom = opts?.pointerHeadroom ?? 96;
  const arcHeadroom = opts?.arcHeadroom ?? (mode === 'bars' ? 24 : 56);
  const availH = Math.max(80, viewport.height - topHeadroom - pointerHeadroom);
  const cellH = Math.min(116, Math.max(58, Math.min(cellW, availH - arcHeadroom)));
  const rowY = viewport.y + topHeadroom + Math.round(Math.max(0, availH - cellH) / 2);
  const barBaseY = viewport.y + viewport.height - pointerHeadroom;
  const barMaxH = Math.max(80, barBaseY - (viewport.y + topHeadroom + 26));

  return {
    x: viewport.x,
    y: viewport.y,
    width: viewport.width,
    height: viewport.height,
    cellW,
    cellH,
    gap,
    rowY,
    barBaseY,
    barMaxH,
    slotLeftX: (index: number) => startX + index * (cellW + gap),
    slotCenterX: (index: number) => startX + index * (cellW + gap) + cellW / 2,
  };
};

export type StackedPointer<T extends {index: number}> = T & {stackRow: number; stackCount: number};

/** Assign deterministic vertical `stackRow` offsets so pointers sharing an array index never collide. */
export const stackPointers = <T extends {index: number}>(pointers: readonly T[]): StackedPointer<T>[] => {
  const counts = new Map<number, number>();
  for (const p of pointers) counts.set(p.index, (counts.get(p.index) ?? 0) + 1);
  const seen = new Map<number, number>();
  return pointers.map((p) => {
    const stackRow = seen.get(p.index) ?? 0;
    seen.set(p.index, stackRow + 1);
    return {...p, stackRow, stackCount: counts.get(p.index) ?? 1};
  });
};

/** Deterministic compact number formatter (no Intl dependency). */
export const formatCompactNumber = (n: number, decimals?: number): string => {
  if (!Number.isFinite(n)) return '0';
  if (decimals !== undefined) {
    const d = Math.max(0, Math.min(4, Math.floor(decimals)));
    return formatNumber(n, d);
  }
  const inferred = inferDecimals(n);
  const d = inferred === 99 ? 2 : Math.min(4, inferred);
  return formatNumber(n, d);
};
