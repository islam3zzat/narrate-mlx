import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'matrix'> = {
  type: 'matrix',
  capabilities,
  docs: {
    fields: '`heading`, `rows[]` (2 to 10), `cols[]` (2 to 10), `values[][]`, `scale?` (`sequential` | `diverging`), `tone?`, `domain?`, `rowLabel?`, `colLabel?`, `unit?`, `decimals?`, `showValues?`, `highlights?[{id?, label, kind, row?, col?, rows?, cols?, tone?}]`, `caption?`',
    use: '2D numeric intensity heatmaps, attention weight grids, and confusion matrices with row/column/cell focus highlights (use `table` for text lookups)',
    rules: [
      '`values` is a rectangular `rows.length x cols.length` grid encoded strictly from theme colour tokens (`sequential` from panel to `tone`, or symmetric `diverging` between `danger` and `secondary`).',
      'Optional `highlights` (`row`, `col`, `cell`, or `block`) outline regions as each `label` is spoken; without `highlights`, rows reveal sequentially from top to bottom.',
      '`focus` accepts highlight `id`s as well as shorthand coordinate IDs `r0`..`rN` (row), `c0`..`cM` (column), and `r0_c0` (cell). LTR layout only.',
    ],
  },
  lint: (v, ctx) => {
    const slots = v.highlights?.length
      ? v.highlights.map((h, i) => ({what: `highlight ${i + 1}`, label: h.label}))
      : v.rows.map((r, i) => ({what: `row ${i + 1}`, label: r}));
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    return {
      errors: [],
      warnings: [
        ...lintOrderedSlots(ctx.narration, slots, {
          missed: (what, label) => `matrix ${what}: label "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`,
          late: (what, label, prevLabel) => `matrix ${what} "${label}" is listed after "${prevLabel}" but spoken first; list items in spoken order`,
        }),
        ...lintRtlAndBidi(ctx.lang, {
          prefix: 'matrix',
          arWarning: 'matrix rows and columns are laid out left to right and not mirrored',
          texts,
        }),
      ],
    };
  },
  focusTargets: (v) => {
    const ids: string[] = [];
    for (const h of v.highlights ?? []) {
      if (h.id) ids.push(h.id);
    }
    for (let r = 0; r < v.rows.length; r++) ids.push(`r${r}`);
    for (let c = 0; c < v.cols.length; c++) ids.push(`c${c}`);
    for (let r = 0; r < v.rows.length; r++) {
      for (let c = 0; c < v.cols.length; c++) ids.push(`r${r}_c${c}`);
    }
    return {ids};
  },
};
