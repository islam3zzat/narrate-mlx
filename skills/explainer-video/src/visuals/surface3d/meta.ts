import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {locateInOrder, normWord} from '../../words';
import {bidiIn} from '../chars';

const keywords = (s: string) =>
  s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

export const meta: Meta<'surface3d'> = {
  type: 'surface3d',
  capabilities,
  docs: {
    fields: '`heading`, `xDomain`, `yDomain`, `zDomain?`, `xLabel?`, `yLabel?`, `zLabel?`, `expr?`|`grid?`, `resolution?`, `overlays?[{kind, label, ...}]` (0 to 6), `caption?`',
    use: '3D height surfaces `z = f(x, y)` with partial-derivative slices, translucent tangent planes, and extruded Riemann volume columns or voxels (3D mode only)',
    rules: [
      'Requires `"mode": "3d"` at the top of the script (cannot be mixed into `"mode": "2d"` scripts; pairs with the 3D-capable visual types).',
      'Provide either a safe `expr` in `x, y` or a rectangular 2..32 `grid`. Overlays (`slice`, `tangent`, `columns`) reveal when their `label` is spoken in listed order (or supply `cues`).',
      'No `focus`, no `continues`, and axis labels draw left to right.',
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
          warnings.push(`surface3d overlay ${i + 1}: label "${ov.label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`);
        } else if (hit.late) {
          warnings.push(`surface3d overlay ${i + 1} "${ov.label}" is listed after "${prevLabel}" but spoken first; list overlays in spoken order`);
        } else {
          prev = hit.at;
          prevLabel = ov.label;
        }
      }
      if (ov.kind === 'slice') {
        const dom = ov.axis === 'x' ? v.xDomain : v.yDomain;
        if (ov.at < dom[0] || ov.at > dom[1]) warnings.push(`surface3d overlay ${i + 1} "${ov.label}": slice at ${ov.at} is outside domain`);
      } else if (ov.kind === 'tangent') {
        if (ov.at[0] < v.xDomain[0] || ov.at[0] > v.xDomain[1] || ov.at[1] < v.yDomain[0] || ov.at[1] > v.yDomain[1]) {
          warnings.push(`surface3d overlay ${i + 1} "${ov.label}": tangent point [${ov.at[0]}, ${ov.at[1]}] is outside domain`);
        }
      }
    });

    if (ctx.lang === 'ar') warnings.push('surface3d axes and formulas are drawn left to right and not mirrored');
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`surface3d ${what} contains direction-control characters (${b.join(', ')})`);
    }
    return {errors: [], warnings};
  },
};
