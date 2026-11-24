import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {locateInOrder, normWord} from '../../words';
import {bidiIn} from '../chars';

const keywords = (s: string) =>
  s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

export const meta: Meta<'field2d'> = {
  type: 'field2d',
  capabilities,
  docs: {
    fields: '`heading`, `mode` (`scalar`|`vector`), `xDomain`, `yDomain`, `xLabel?`, `yLabel?`, `expr?`+`levels?` (scalar), `fx?`+`fy?`+`density?`+`particles?` (vector), `overlays?[{id?, kind, label, ...}]` (0 to 6), `caption?`',
    use: '2D scalar contour landscapes (slices, gradients, ascent/descent paths, extrema) and animated vector fields (Jacobian stretch, divergence, curl paddlewheel, line & flux integrals)',
    rules: [
      'Scalar mode requires `expr` in `x, y` and allows `slice`, `gradient`, `path`, `extrema` overlays. Vector mode requires `fx`, `fy` in `x, y` and allows `jacobian`, `divergence`, `curl`, `line-integral`, `flux` overlays.',
      'Overlays appear when their `label` is spoken; list them in spoken order with a keyword from each label (or add `cues`).',
      '`focus` names overlay `id`s (dims other overlays). No `continues`, no 3D, drawn left to right.',
    ],
  },
  lint: (v, ctx) => {
    const words = ctx.narration.split(/\s+/).map(normWord).filter(Boolean);
    const warnings: string[] = [];
    let prev = -1, prevLabel = '';
    (v.overlays ?? []).forEach((ov, i) => {
      const ks = keywords(ov.label);
      if (ks.length) {
        const hit = locateInOrder(words, ks, prev);
        if (!hit) {
          warnings.push(`field2d overlay ${i + 1}: label "${ov.label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`);
        } else if (hit.late) {
          warnings.push(`field2d overlay ${i + 1} "${ov.label}" is listed after "${prevLabel}" but spoken first; list overlays in spoken order`);
        } else {
          prev = hit.at;
          prevLabel = ov.label;
        }
      }
      const inBox = ([x, y]: readonly [number, number]) =>
        x >= v.xDomain[0] && x <= v.xDomain[1] && y >= v.yDomain[0] && y <= v.yDomain[1];
      if (ov.kind === 'slice') {
        const dom = ov.axis === 'x' ? v.xDomain : v.yDomain;
        if (ov.at < dom[0] || ov.at > dom[1]) warnings.push(`field2d overlay ${i + 1} "${ov.label}": slice at ${ov.at} is outside domain`);
      } else if ('at' in ov && !inBox(ov.at)) {
        warnings.push(`field2d overlay ${i + 1} "${ov.label}": point [${ov.at[0]}, ${ov.at[1]}] is outside plot domain`);
      } else if (ov.kind === 'path' && ov.starts.some((p) => !inBox(p))) {
        warnings.push(`field2d overlay ${i + 1} "${ov.label}": path start is outside plot domain`);
      }
    });

    if (ctx.lang === 'ar') warnings.push('field2d axes and formulas are drawn left to right and not mirrored');
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`field2d ${what} contains direction-control characters (${b.join(', ')})`);
    }
    return {errors: [], warnings};
  },
  focusTargets: (v) => ({ids: (v.overlays ?? []).flatMap((o) => (o.id ? [o.id] : []))}),
};
