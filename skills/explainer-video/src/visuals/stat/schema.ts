import {z} from 'zod';
import {text, ID} from '../common';
import {textCharIssues, displayCells} from '../chars';
import {inferDecimals} from './format';

export const STAT_TONES = ['good', 'bad', 'neutral'] as const;
export const STAT_BETTER = ['up', 'down'] as const;
// `magnitude`: largest |value|; `scaled`: largest |value| * 10^decimals (stays exact as an integer).
export const STAT_LIMITS = {min: 1, max: 4, heading: 50, caption: 160, label: 40, unit: 12, decimals: 4, magnitude: 1e12, scaled: 1e15} as const;

export const Stat = z.strictObject({
  id: ID.optional().describe('Optional id, only so a scene `focus` can name this stat; unique within the scene'),
  label: text('What is measured, in words the narration says (the stat appears when they are spoken); at most 40 display cells, one line'),
  value: z.number().describe('The number shown, counted up to; finite, at most 1e12 in size; 0 or more when `from` is set'),
  unit: z.string().trim().min(1).optional().describe('Shown after the number: "%", "ms", "req/s", "USD" (a suffix only; at most 12 characters). Stats with bars share one scale only when their units match'),
  decimals: z.number().int().min(0).max(STAT_LIMITS.decimals).optional().describe('Decimal places shown on every frame (0 to 4); default: as many as `value` and `from` have. Never rounds: a value with more places is an error'),
  from: z.number().optional().describe('Earlier value: the counter runs from it to `value`, with before/after bars and a percent-change chip; 0 or more'),
  max: z.number().optional().describe('With `from`: the end of the bar axis (e.g. 100 for a percentage); at least from and value'),
  better: z.enum(STAT_BETTER).optional().describe('With `from`: which direction is good ("down" for latency or errors, "up" for throughput); the change is named better or worse'),
  tone: z.enum(STAT_TONES).optional().describe('Overrides the tone from `better`; on a plain stat, a "good" or "bad" tag'),
});

export const StatVisual = z.strictObject({
  type: z.literal('stat'),
  heading: text('Scene heading').max(STAT_LIMITS.heading),
  stats: z.array(Stat).min(STAT_LIMITS.min).max(STAT_LIMITS.max).describe('1 to 4 headline numbers, each appearing (and counting up) when its label is spoken; 1 or 2 are big tiles, 3 or 4 a row'),
  caption: text('Line under the stats').max(STAT_LIMITS.caption).optional(),
}).describe('One to four headline numbers that count up, optionally before/after with bars and a percent change; 2D only, English only').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  textCharIssues('heading', v.heading, true).forEach((m) => add(['heading'], m));
  if (v.caption) textCharIssues('caption', v.caption, true).forEach((m) => add(['caption'], m));
  const seen = new Set<string>();
  v.stats.forEach((s0, i) => {
    const p = ['stats', i];
    // refinements also run when a field already failed its own check (e.g. decimals -1): only look at well-typed values
    if (typeof s0.label !== 'string' || typeof s0.value !== 'number') return;
    const num = (x: unknown) => (typeof x === 'number' ? x : undefined);
    const s = {...s0, from: num(s0.from), max: num(s0.max), decimals: Number.isInteger(s0.decimals) && s0.decimals! >= 0 && s0.decimals! <= STAT_LIMITS.decimals ? s0.decimals : undefined};
    if (s.id) {
      if (seen.has(s.id)) add([...p, 'id'], `duplicate stat id "${s.id}"`);
      seen.add(s.id);
    }
    textCharIssues('label', s.label).forEach((m) => add([...p, 'label'], m));
    if (typeof s.unit === 'string') textCharIssues('unit', s.unit).forEach((m) => add([...p, 'unit'], m));
    if (!s.label.replace(/[\p{Cf}͏ᅟᅠ᠋-᠏⠀ㅤﾠ︀-️]/gu, '').trim()) add([...p, 'label'], 'label is empty');
    const cells = displayCells(s.label);
    if (cells > STAT_LIMITS.label) add([...p, 'label'], `label is ${cells} display cells wide; the limit is ${STAT_LIMITS.label} (wide characters count 2): shorten it`);
    if (typeof s.unit === 'string' && s.unit.length > STAT_LIMITS.unit) add([...p, 'unit'], `unit is ${s.unit.length} characters; the limit is ${STAT_LIMITS.unit}`);
    // numbers
    const nums: [string, number | undefined][] = [['value', s.value], ['from', s.from], ['max', s.max]];
    let ok = true;
    for (const [k, x] of nums) {
      if (x === undefined) continue;
      if (!Number.isFinite(x)) { add([...p, k], `${k} is not a finite number`); ok = false; }
      else if (Math.abs(x) > STAT_LIMITS.magnitude) { add([...p, k], `${k} ${x} is too large (limit 1e12): show it in a bigger unit, e.g. 3,000 with unit "B" instead of 3e12`); ok = false; }
    }
    if (!ok) return;
    if (s.from !== undefined && (s.value < 0 || s.from < 0)) add([...p, s.from < 0 ? 'from' : 'value'], 'before/after bars need values of 0 or more: drop `from` for a stat that can be negative');
    if (s.max !== undefined && s.from !== undefined && (s.max <= 0 || s.max < Math.max(s.from, s.value))) {
      add([...p, 'max'], `max ${s.max} is below the larger of from (${s.from}) and value (${s.value}): the bars would not fit`);
    }
    const inferred = inferDecimals(s.value, s.from);
    if (s.decimals === undefined) {
      if (inferred > STAT_LIMITS.decimals) add([...p, 'value'], `value ${s.value}${s.from !== undefined ? ` or from ${s.from}` : ''} has more than ${STAT_LIMITS.decimals} decimal places: round it in the source`);
    } else {
      for (const [k, x] of [['value', s.value], ['from', s.from]] as const) {
        if (x !== undefined && Number(x.toFixed(s.decimals)) !== x) add([...p, 'decimals'], `${k} ${x} has more than ${s.decimals} decimal places but decimals is ${s.decimals}: round it in the source (the screen never rounds a number)`);
      }
    }
    const d = s.decimals ?? inferred;
    if (d <= STAT_LIMITS.decimals) {
      for (const [k, x] of nums) if (x !== undefined && Math.abs(x) * 10 ** d > STAT_LIMITS.scaled) add([...p, k], `${k} ${x} with ${d} decimals is too large to show exactly: use fewer decimals or a bigger unit`);
    }
  });
});

export {StatVisual as schema};
