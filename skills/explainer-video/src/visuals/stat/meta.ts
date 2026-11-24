import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {normWord, locateInOrder} from '../../words';
import {bidiIn} from '../chars';
import {axisMax, type StatT} from './count';

/** Words of a label that can be matched to narration (3+ letters once normalised). */
const keywords = (s: string) => s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

const NUMBER = /^\d[\d,.]*%?$/;
/** Narration tokens that are plain numbers ("12,500", "99.9%"), as numbers. */
const spokenNumbers = (narration: string): number[] =>
  narration.split(/\s+/).map((t) => t.replace(/^[("'“]+|[)"'”.,;:!?]+$/g, '')).filter((t) => NUMBER.test(t)).map((t) => Number(t.replace(/,/g, '').replace(/%$/, ''))).filter(Number.isFinite);

export const meta: Meta<'stat'> = {
  type: 'stat',
  capabilities,
  docs: {
    fields: "`heading`, `stats[{id?, label, value, unit?, decimals?, from?, max?, better?, tone?}]` (1 to 4), `caption?`",
    use: "one to four hero KPI headline numbers (or a before/after counter improvement): each counts up when its label is spoken; use `chart` for multi-series empirical plots, `ablation` for cumulative +/- deltas, `table` for lookups, and `compare` for options",
    rules: [
      "Numbers are shown with fixed decimals on every frame (default: as many as `value` and `from` have; `decimals` 0 to 4 never rounds, so a value with more places is an error: round it in the source), \",\" grouping from 1,000 and the `unit` after the number as a suffix only (no space for % ‰ ° x ×; write USD, not $). Limits, all errors and never trimmed: `value` at most 1e12, `label` 40 display cells on one line, `unit` 12 characters, `heading` 50, `caption` 160, no invisible or direction-changing characters.",
      "`from` makes the counter run from it to `value` and adds before/after bars and a change chip (percent change against `from`; when `from` is 0 the absolute change). Both must be 0 or more. Set `better: \"down\"` for latency or errors, `\"up\"` for throughput: the change is named in words (up or down, better or worse), never by colour alone, and `tone` overrides it. Bars share one scale when the units match, otherwise each stat has its own; `max` sets the end of the axis (100 for a percentage).",
      "Stats appear (and count) when their `label` is spoken, so say a word of each label and the number itself as digits, in the order listed, with at most 2 numbers per sentence. `id` is only needed for `focus` (dims the other stats, 2D only). No `continues`, no 3D, and English only (not mirrored in Arabic).",
    ],
  },
  lint: (v, ctx) => {
    const words = ctx.narration.split(/\s+/).map(normWord).filter(Boolean);
    const warnings: string[] = [];
    let prev = -1, prevLabel = '';
    v.stats.forEach((s, i) => {
      const ks = keywords(s.label);
      if (!ks.length) return;
      const hit = locateInOrder(words, ks, prev);
      if (!hit) {
        warnings.push(`stat ${i + 1}: its label "${s.label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`);
        return;
      }
      if (hit.late) warnings.push(`stat ${i + 1} "${s.label}" is listed after "${prevLabel}" but is spoken first, so it will appear late; list the stats in the order the narration names them`);
      else { prev = hit.at; prevLabel = s.label; }
    });
    // numbers: the screen must not show a number the voice does not say (only checked when the narration uses digits at all)
    const said = spokenNumbers(ctx.narration);
    v.stats.forEach((s, i) => {
      if (said.length) {
        for (const [k, x] of [['value', s.value], ['from', s.from]] as const) {
          if (x !== undefined && !said.includes(x)) warnings.push(`stat ${i + 1} "${s.label}": the narration never says ${k} ${x}, so the screen shows a number the voice does not`);
        }
      }
      const inLabel = s.label.split(/\s+/).filter((t) => NUMBER.test(t)).map((t) => Number(t.replace(/,/g, '').replace(/%$/, '')));
      if (inLabel.some((x) => x !== s.value && x !== s.from)) warnings.push(`stat ${i + 1}: the label "${s.label}" has a number that is neither value nor from: keep numbers out of labels, or make them match`);
      if (s.from !== undefined && s.from === s.value) warnings.push(`stat ${i + 1} "${s.label}": from equals value, so the chip says "no change"; drop \`from\` for a plain stat`);
      if (s.from === undefined) {
        if (s.better) warnings.push(`stat ${i + 1} "${s.label}": \`better\` is ignored without \`from\``);
        if (s.max !== undefined) warnings.push(`stat ${i + 1} "${s.label}": \`max\` is ignored without \`from\``);
      }
      if (s.tone && s.better && s.from !== undefined && s.from !== s.value) {
        const natural = (s.value > s.from ? 'up' : 'down') === s.better ? 'good' : 'bad';
        if (s.tone !== natural && s.tone !== 'neutral') warnings.push(`stat ${i + 1} "${s.label}": tone "${s.tone}" overrides better "${s.better}", which makes this change ${natural}`);
      }
      if (s.unit && /[$€£¥]/.test(s.unit)) warnings.push(`stat ${i + 1} "${s.label}": unit "${s.unit}" is drawn after the number ("12 $"); write the currency as a word (USD) or put it in the label`);
    });
    // bars: units that differ cannot share a scale; a tiny bar under a shared scale
    const barred = v.stats.map((s, i) => [s, i] as [StatT, number]).filter(([s]) => s.from !== undefined);
    if (new Set(barred.map(([s]) => s.unit ?? '')).size > 1) warnings.push('stat bars with different units each have their own scale and cannot be compared by length: say so in the narration, or split the scene');
    else if (barred.length > 1) {
      const axes = axisMax(v.stats);
      for (const [s, i] of barred) if (Math.max(s.from!, s.value) < axes[i] / 10) warnings.push(`stat ${i + 1} "${s.label}": its bars are under a tenth of the shared scale and will be tiny; give it its own scene or a different unit`);
    }
    if (ctx.lang === 'ar') warnings.push('stat is English only: labels and numbers are drawn left to right and not mirrored; use `table` or `callout` for Arabic');
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`stat ${what} contains direction-control characters (${b.join(', ')}): check that it reads as intended`);
    }
    return {errors: [], warnings};
  },
  focusTargets: (v) => ({ids: v.stats.flatMap((s) => (s.id ? [s.id] : []))}),
};
