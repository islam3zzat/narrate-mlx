// Pure frame functions of the `stat` visual: the counter, the bar scale and the change chip. No React.
import type {z} from 'zod';
import type {Stat} from './schema';
import {formatNumber, formatStat} from './format';

export type StatT = z.infer<typeof Stat>;

export const COUNT_FRAMES = 36; // 1.2 s at 30 fps
export const MIN_COUNT_FRAMES = 8;
const easeOut = (u: number) => 1 - (1 - u) ** 3;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Frames the count takes: 36, shortened so it ends with the audio (never under 8). */
export const countFrames = (start: number, lead: number, audioFrames: number): number =>
  Math.max(MIN_COUNT_FRAMES, Math.min(COUNT_FRAMES, lead + audioFrames - start));

/** The value shown at `frame`: `from0` up to `start`, exactly `to` from `start + len` on (no float tail). */
export const counterValue = (frame: number, start: number, len: number, from0: number, to: number): number => {
  if (frame <= start) return from0;
  if (frame >= start + len) return to;
  return from0 + (to - from0) * easeOut((frame - start) / len);
};

/** Where a stat's counter starts: 0 for a plain stat, `from` for a before/after one. */
export const counterStart = (s: StatT): number => s.from ?? 0;

/** The end of the bar axis of each stat, index-aligned (0 for a stat without bars). Barred stats share one axis when their units
 *  match (no unit counts as one unit), otherwise each has its own; `max` sets the end, else the larger of from and value. */
export const axisMax = (stats: StatT[]): number[] => {
  const own = (s: StatT) => s.max ?? Math.max(s.from ?? 0, s.value);
  const barred = stats.filter((s) => s.from !== undefined);
  const shared = new Set(barred.map((s) => s.unit ?? '')).size <= 1 ? Math.max(0, ...barred.map(own)) : null;
  return stats.map((s) => (s.from === undefined ? 0 : shared ?? own(s)));
};

export const barFraction = (x: number, axis: number): number => (axis > 0 ? clamp01(x / axis) : 0);

/** Percent change, or null when `from` is 0 (undefined; the chip then shows the absolute change). */
export const percentChange = (from: number, to: number): number | null => (from === 0 ? null : ((to - from) / from) * 100);

export type Delta = {dir: 'up' | 'down' | 'none'; text: string; tone: 'good' | 'bad' | 'neutral'; word: string};

/** The change chip of a stat with `from`: direction, text, tone and the words that name it (never colour alone). `d` = decimals shown. */
export const delta = (s: StatT, d: number): Delta => {
  const from = s.from ?? 0;
  const dir = s.value > from ? 'up' : s.value < from ? 'down' : 'none';
  const sign = dir === 'up' ? '+' : '-';
  let text: string;
  if (dir === 'none') text = 'no change';
  else {
    const pct = percentChange(from, s.value);
    if (pct === null) text = sign + formatStat(Math.abs(s.value - from), d, s.unit);
    else {
      const a = Math.abs(pct), k = a < 9.95 ? 1 : 0;
      text = Number(a.toFixed(k)) === 0 ? '<0.1%' : sign + formatNumber(a, k) + '%';
    }
  }
  const tone = s.tone ?? (dir === 'none' || !s.better ? 'neutral' : dir === s.better ? 'good' : 'bad');
  const word = dir === 'none' ? '' : (dir === 'up' ? 'up' : 'down') + (tone === 'good' ? ' · better' : tone === 'bad' ? ' · worse' : '');
  return {dir, text, tone, word};
};
