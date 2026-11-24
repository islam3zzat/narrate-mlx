import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {locateInOrder, normWord} from '../../words';
import {bidiIn} from '../chars';
import {CANCELLATION_PHASES} from './schema';

const keywords = (s: string) =>
  s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

export const meta: Meta<'cancellation-grid'> = {
  type: 'cancellation-grid',
  capabilities,
  docs: {
    fields: '`heading`, `theorem` (`ftc-1d` | `curl-2d` | `divergence-2d` | `divergence-3d`), `cols?`, `rows?`, `depth?`, `stages[{label, phase, note?}]` (1 to 6), `caption?`',
    use: 'interior-cancellation tessellations illustrating why interior contributions cancel to leave only the outer boundary (FTC, Green/Stokes curl, 2D/3D divergence)',
    rules: [
      'Grid bounds: `ftc-1d` `cols` 2..8; `curl-2d`/`divergence-2d` `cols` 2..5, `rows` 2..4; `divergence-3d` `cols`/`rows` 2..3, `depth` 2.',
      'Stages advance through `cells` -> `interior` -> `cancel` -> `boundary` when their `label` is spoken. List stages in spoken order with a keyword from each label (or supply `cues`).',
      'No `focus`, no `continues`, no 3D mode (even `divergence-3d` draws in crisp 2D isometric SVG), and diagrams always draw left to right.',
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
        warnings.push(`cancellation-grid stage ${i + 1}: label "${st.label}" shares no word with the narration, so it runs at a guessed time; use words the narration says, or add "cues"`);
        return;
      }
      if (hit.late) warnings.push(`cancellation-grid stage ${i + 1} "${st.label}" is listed after "${prevLabel}" but spoken first; list stages in spoken order`);
      else { prev = hit.at; prevLabel = st.label; }
    });

    let lastRank = -1;
    v.stages.forEach((st, i) => {
      const rank = CANCELLATION_PHASES.indexOf(st.phase);
      if (rank < lastRank) {
        warnings.push(`cancellation-grid stage ${i + 1}: phase "${st.phase}" goes backwards after "${CANCELLATION_PHASES[lastRank]}"`);
      }
      lastRank = Math.max(lastRank, rank);
    });

    if (ctx.lang === 'ar') warnings.push('cancellation-grid diagrams are drawn left to right and not mirrored');
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`cancellation-grid ${what} contains direction-control characters (${b.join(', ')})`);
    }
    return {errors: [], warnings};
  },
};
