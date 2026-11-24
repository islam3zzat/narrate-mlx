import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {locateInOrder, normWord} from '../../words';
import {bidiIn} from '../chars';

const keywords = (s: string) =>
  s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

export const meta: Meta<'plot2d'> = {
  type: 'plot2d',
  capabilities,
  docs: {
    fields: '`heading`, `xDomain`, `yDomain`, `xLabel?`, `yLabel?`, `curves[{id?, label, expr?|points?, tone?, dashed?}]` (1 to 4), `stages?[{kind, label, ...}]` (1 to 6), `caption?`',
    use: 'animated 2D function plots: curve drawing, secant-to-tangent zoom (including non-differentiable corners), and Riemann slices with signed positive/negative area',
    rules: [
      'Each curve supplies either a safe math `expr` in `x` (max 160 chars; `+ - * / ^`, `sin cos tan asin acos atan sinh cosh tanh exp ln log10 log2 sqrt cbrt abs floor ceil sign round min max pow atan2 hypot clamp`, constants `pi e`; no `eval`) or 2 to 200 sorted `[x, y]` `points`.',
      'Optional `stages` (`point`, `secant`, `tangent`, `riemann`, `zoom`) animate when their `label` is spoken; without `stages`, curves reveal in order when their `label` is spoken. Say a keyword from each label in order, or supply `cues`.',
      '`focus` names curve `id`s (dims non-focused curves; camera zoom is controlled by `stages`). No `continues`, no 3D, and plot coordinates always draw left to right.',
    ],
  },
  lint: (v, ctx) => {
    const words = ctx.narration.split(/\s+/).map(normWord).filter(Boolean);
    const warnings: string[] = [];
    const items = v.stages?.length ? v.stages.map((s) => ({what: 'stage', label: s.label})) : v.curves.map((c) => ({what: 'curve', label: c.label}));
    let prev = -1, prevLabel = '';
    items.forEach((it, i) => {
      const ks = keywords(it.label);
      if (!ks.length) return;
      const hit = locateInOrder(words, ks, prev);
      if (!hit) {
        warnings.push(`plot2d ${it.what} ${i + 1}: label "${it.label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`);
        return;
      }
      if (hit.late) warnings.push(`plot2d ${it.what} ${i + 1} "${it.label}" is listed after "${prevLabel}" but spoken first; list items in spoken order`);
      else { prev = hit.at; prevLabel = it.label; }
    });

    v.stages?.forEach((st, i) => {
      if (('x' in st) && (st.x < v.xDomain[0] || st.x > v.xDomain[1])) {
        warnings.push(`plot2d stage ${i + 1} "${st.label}": x=${st.x} is outside xDomain [${v.xDomain[0]}, ${v.xDomain[1]}]`);
      }
      if (st.kind === 'riemann' && (st.range[0] < v.xDomain[0] || st.range[1] > v.xDomain[1])) {
        warnings.push(`plot2d stage ${i + 1} "${st.label}": riemann range [${st.range[0]}, ${st.range[1]}] extends outside xDomain`);
      }
    });

    if (ctx.lang === 'ar') {
      warnings.push('plot2d axes and formulas are drawn left to right and not mirrored');
    }
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`plot2d ${what} contains direction-control characters (${b.join(', ')}): check that it reads as intended`);
    }
    return {errors: [], warnings};
  },
  focusTargets: (v) => ({ids: v.curves.flatMap((c) => (c.id ? [c.id] : []))}),
};
