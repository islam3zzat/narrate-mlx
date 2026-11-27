// Pure computation helpers for array-algo (no React or Remotion imports).
import {clamp01, formatCompactNumber, stackPointers, type AlgoStateTone} from '../../sdk/algo-math';
import type {ArrayAlgoPointerT, ArrayAlgoStepT, ArrayAlgoVisualT, ArrayAlgoWindowT} from './schema';

/** Global maximum numeric item value across all steps (used to scale bars consistently). */
export const computeBarMax = (steps: readonly ArrayAlgoStepT[]): number => {
  let maxVal = 1;
  for (const st of steps) {
    for (const it of st.items) {
      if (typeof it.value === 'number' && Number.isFinite(it.value) && it.value > maxVal) {
        maxVal = it.value;
      }
    }
  }
  return maxVal;
};

/** Proportional bar height clamped cleanly to `[28, barMaxH]`. */
export const barHeightFor = (value: number, maxVal: number, barMaxH: number): number => {
  const ratio = clamp01(value / Math.max(1e-9, maxVal));
  return Math.max(28, Math.round(ratio * barMaxH));
};

/** Format numeric or string item value deterministically without Intl. */
export const formatItemValue = (val: number | string): string =>
  typeof val === 'number' ? formatCompactNumber(val) : val;

export type InterpolatedPointer = {
  name: string;
  x: number;
  tone: AlgoStateTone;
  stackRow: number;
  opacity: number;
};

/** Glide pointers matched by `name` across consecutive steps while keeping collision stacking clean. */
export const interpolatePointers = (
  prevPointers: readonly ArrayAlgoPointerT[] | undefined,
  curPointers: readonly ArrayAlgoPointerT[] | undefined,
  slotCenterX: (index: number) => number,
  eased: number,
): InterpolatedPointer[] => {
  const t = clamp01(eased);
  const prevByName = new Map((prevPointers ?? []).map((p) => [p.name, p]));
  const stacked = stackPointers(curPointers ?? []);
  return stacked.map((p) => {
    const prev = prevByName.get(p.name);
    const x1 = slotCenterX(p.index);
    const x0 = prev ? slotCenterX(prev.index) : x1;
    return {
      name: p.name,
      x: x0 + (x1 - x0) * t,
      tone: p.tone ?? 'active',
      stackRow: p.stackRow,
      opacity: prev ? 1 : t,
    };
  });
};

export type InterpolatedWindow = {
  leftX: number;
  rightX: number;
  label?: string;
  tone: AlgoStateTone;
  opacity: number;
};

/** Smoothly slide/resize a window bracket `[start..end]` across steps. */
export const interpolateWindow = (
  prevWin: ArrayAlgoWindowT | undefined,
  curWin: ArrayAlgoWindowT | undefined,
  slotLeftX: (index: number) => number,
  cellW: number,
  eased: number,
): InterpolatedWindow | null => {
  if (!curWin) return null;
  const t = clamp01(eased);
  const l1 = slotLeftX(curWin.start);
  const r1 = slotLeftX(curWin.end) + cellW;
  const l0 = prevWin ? slotLeftX(prevWin.start) : l1;
  const r0 = prevWin ? slotLeftX(prevWin.end) + cellW : r1;
  return {
    leftX: l0 + (l1 - l0) * t,
    rightX: r0 + (r1 - r0) * t,
    label: curWin.label,
    tone: curWin.tone ?? 'active',
    opacity: prevWin ? 1 : t,
  };
};

/** Maximum stacked pointers on any single index across all steps (for consistent SVG headroom). */
export const maxPointerStackRows = (steps: readonly ArrayAlgoStepT[]): number => {
  let maxRows = 0;
  for (const st of steps) {
    for (const p of stackPointers(st.pointers ?? [])) {
      if (p.stackCount > maxRows) maxRows = p.stackCount;
    }
  }
  return maxRows;
};

/** Collect unique step and item IDs for `focus` validation. */
export const collectFocusIds = (v: ArrayAlgoVisualT): string[] => {
  const ids = new Set<string>();
  for (const st of v.steps) {
    if (st.id) ids.add(st.id);
    for (const it of st.items) ids.add(it.id);
  }
  return [...ids];
};
