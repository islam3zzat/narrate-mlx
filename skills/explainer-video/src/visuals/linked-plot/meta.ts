import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {locateInOrder, normWord} from '../../words';
import {bidiIn} from '../chars';
import {compile1D, numDeriv} from '../math-expr';
import {interpolateSeries} from '../plot-kit';

const keywords = (s: string) =>
  s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

export const meta: Meta<'linked-plot'> = {
  type: 'linked-plot',
  capabilities,
  docs: {
    fields: '`heading`, `xDomain`, `xLabel?`, `top{label, yDomain, yLabel?, unit?, expr?|points?, tone?}`, `bottom{...}`, `anchor?{x,y}`, `stages[{id?, label, x, show?, note?}]` (1 to 6), `caption?`',
    use: 'synchronized dual-axis rate and accumulation plots: top tangent slope traces bottom height while bottom shaded area traces top change',
    rules: [
      'Specify `expr` or `points` on at least one panel: omitting `top` derives the integral of `bottom` anchored at `anchor` (default `F(xMin) = 0`); omitting `bottom` derives the derivative of `top`.',
      'Stages advance the shared vertical cursor `x` when their `label` is spoken; list stages in spoken order with a keyword from each label (or add `cues`).',
      '`focus` targets `"top"` or `"bottom"` to highlight one panel. No `continues`, no 3D, drawn left to right.',
    ],
  },
  lint: (v, ctx) => {
    const words = ctx.narration.split(/\s+/).map(normWord).filter(Boolean);
    const warnings: string[] = [];
    let prev = -1, prevLabel = '';
    v.stages.forEach((st, i) => {
      const ks = keywords(st.label);
      if (!ks.length) return;
      const hit = locateInOrder(words, ks, prev);
      if (!hit) {
        warnings.push(`linked-plot stage ${i + 1}: label "${st.label}" shares no word with the narration, so it moves at a guessed time; use words the narration says, or add "cues"`);
        return;
      }
      if (hit.late) warnings.push(`linked-plot stage ${i + 1} "${st.label}" is listed after "${prevLabel}" but spoken first; list stages in spoken order`);
      else { prev = hit.at; prevLabel = st.label; }
    });

    // If both top and bottom curves are authored explicitly, warn if top'(x) disagrees significantly with bottom(x).
    const topHas = v.top.expr !== undefined || v.top.points !== undefined;
    const botHas = v.bottom.expr !== undefined || v.bottom.points !== undefined;
    if (topHas && botHas) {
      const topFn = v.top.expr ? compile1D(v.top.expr) : (x: number) => interpolateSeries(v.top.points!, x);
      const botFn = v.bottom.expr ? compile1D(v.bottom.expr) : (x: number) => interpolateSeries(v.bottom.points!, x);
      if (topFn && botFn) {
        const span = v.xDomain[1] - v.xDomain[0];
        const bSpan = Math.max(1e-6, v.bottom.yDomain[1] - v.bottom.yDomain[0]);
        let maxErr = 0;
        for (let k = 1; k <= 5; k++) {
          const x = v.xDomain[0] + (k / 6) * span;
          const d = numDeriv(topFn, x, span);
          const b = botFn(x);
          if (Number.isFinite(d) && Number.isFinite(b)) {
            maxErr = Math.max(maxErr, Math.abs(d - b));
          }
        }
        if (maxErr > bSpan * 0.15) {
          warnings.push('linked-plot: explicit top derivative differs noticeably from bottom curve; omit one curve to derive it automatically');
        }
      }
    }

    if (ctx.lang === 'ar') warnings.push('linked-plot axes and formulas are drawn left to right and not mirrored');
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`linked-plot ${what} contains direction-control characters (${b.join(', ')})`);
    }
    return {errors: [], warnings};
  },
  focusTargets: () => ({ids: ['top', 'bottom']}),
};
