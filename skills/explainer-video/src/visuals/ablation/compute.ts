// Pure cumulative waterfall math and deterministic value formatting (reusing stat/format.ts rules).
// Pure TS leaf (no React, Remotion, or Three).
import type {AblationVisualT, AblationToneT} from './schema';
import {niceTicks, type Domain} from '../plot-kit';
import {formatNumber, formatStat, inferDecimals} from '../stat/format';

export type ResolvedTone = 'accent' | 'danger' | 'neutral' | 'primary';

export type WaterfallBar = {
  idx: number;
  id?: string;
  kind: 'base' | 'delta' | 'total';
  label: string;
  note?: string;
  from: number;
  to: number;
  delta: number;
  tone: ResolvedTone;
  tagText: string;
  totalText: string;
};

export type WaterfallLayout = {
  bars: WaterfallBar[];
  yDomain: Domain;
  anchorFloor: number;
  decimals: number;
  netDelta: number;
  netText: string;
};

export function resolveStepTone(delta: number, tone: AblationToneT | undefined, higherIsBetter: boolean): ResolvedTone {
  if (tone && tone !== 'auto') return tone;
  if (Math.abs(delta) < 1e-12) return 'neutral';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'accent' : 'danger';
}

export function formatSignedDelta(delta: number, decimals: number, unit?: string): string {
  const z = Math.abs(delta) < 0.5 * Math.pow(10, -decimals) ? 0 : delta;
  const sign = z > 0 ? '+' : z < 0 ? '-' : '';
  const body = formatStat(Math.abs(z), decimals, unit);
  return `${sign}${body}`;
}

export function computeWaterfall(v: AblationVisualT): WaterfallLayout {
  const higher = v.higherIsBetter !== false;
  const nums = [v.baseline.value, ...v.steps.map((s) => s.delta)];
  const decimals = v.decimals ?? Math.min(2, inferDecimals(...nums));

  let running = v.baseline.value;
  const cumulatives = [running];
  for (const s of v.steps) {
    running += s.delta;
    cumulatives.push(running);
  }
  const finalTotal = running;
  const showTotal = v.showTotal !== false;

  // Determine natural yDomain before setting baseline floor
  const minVal = Math.min(...cumulatives);
  const maxVal = Math.max(...cumulatives);
  const fullSpan = Math.max(1e-6, maxVal - minVal);
  const includeZero = minVal <= 0 && maxVal >= 0 ? true : minVal >= 0 && minVal <= maxVal * 0.35;

  let yDomain: Domain;
  if (v.yDomain) {
    yDomain = [v.yDomain[0], v.yDomain[1]];
  } else {
    const rawLo = includeZero ? Math.min(0, minVal - fullSpan * 0.14) : minVal - fullSpan * 0.25;
    const rawHi = includeZero && maxVal < 0 ? Math.max(0, maxVal + fullSpan * 0.14) : maxVal + fullSpan * 0.22;
    const ticks = niceTicks(rawLo, rawHi, 5);
    const lo = ticks.length ? Math.min(rawLo, ticks[0]) : rawLo;
    let hi = rawHi;
    if (ticks.length >= 2) {
      const step = ticks[1] - ticks[0];
      const topTick = ticks[ticks.length - 1];
      hi = topTick < rawHi ? topTick + step : topTick;
    }
    yDomain = [lo, hi <= lo ? lo + 1 : hi];
  }

  const anchorFloor = yDomain[0] <= 0 && yDomain[1] >= 0 ? 0 : yDomain[0];

  const bars: WaterfallBar[] = [];
  bars.push({
    idx: 0,
    id: v.baseline.id,
    kind: 'base',
    label: v.baseline.label,
    from: anchorFloor,
    to: v.baseline.value,
    delta: v.baseline.value,
    tone: 'neutral',
    tagText: formatStat(v.baseline.value, decimals, v.unit),
    totalText: formatNumber(v.baseline.value, decimals),
  });

  let cur = v.baseline.value;
  v.steps.forEach((s, i) => {
    const next = cur + s.delta;
    bars.push({
      idx: i + 1,
      id: s.id,
      kind: 'delta',
      label: s.label,
      note: s.note,
      from: cur,
      to: next,
      delta: s.delta,
      tone: resolveStepTone(s.delta, s.tone, higher),
      tagText: formatSignedDelta(s.delta, decimals, v.unit),
      totalText: formatNumber(next, decimals),
    });
    cur = next;
  });

  if (showTotal) {
    bars.push({
      idx: bars.length,
      id: v.totalId,
      kind: 'total',
      label: v.totalLabel ?? 'Full System',
      from: anchorFloor,
      to: finalTotal,
      delta: finalTotal - v.baseline.value,
      tone: 'primary',
      tagText: formatStat(finalTotal, decimals, v.unit),
      totalText: formatNumber(finalTotal, decimals),
    });
  }

  const netDelta = finalTotal - v.baseline.value;
  return {
    bars,
    yDomain,
    anchorFloor,
    decimals,
    netDelta,
    netText: `${formatSignedDelta(netDelta, decimals, v.unit)} net`,
  };
}
