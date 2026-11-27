import {lintOrderedSlots, lintRtlAndBidi, type Meta} from '../../sdk/pure';
import {capabilities} from './capabilities';
import {collectFocusIds} from './compute';

export const meta: Meta<'array-algo'> = {
  type: 'array-algo',
  capabilities,
  docs: {
    fields: '`heading`, `mode?` (`cells`|`bars`), `showIndices?`, `steps[{id?, label, items[{id, value, state?, subLabel?}], pointers?, window?, aux?, note?}]` (1 to 12), `caption?`',
    use: 'animated step-by-step array and sorting algorithms (swaps, partitions, two pointers, sliding windows, binary search) synced to narration',
    rules: [
      'Reuse stable element `items[].id` across steps so swapped elements animate along symmetric arcs (`cells` allows numbers or short strings; `bars` requires non-negative numbers scaled across all steps).',
      'Optional `pointers` (`name`, 0-based `index`, `tone?`) glide between indices and auto-stack on collisions; `window` (`start..end`, `label?`) brackets an active subarray; `aux` renders a bottom auxiliary state tray.',
      'Steps advance when each `steps[].label` is spoken in listed order (or via `cues`). `focus` targets step IDs or item IDs (2D only). Array indices always draw left to right.',
    ],
  },
  lint: (v, ctx) => ({
    errors: [],
    warnings: [
      ...lintOrderedSlots(
        ctx.narration,
        v.steps.map((s, i) => ({what: `step ${i + 1}`, label: s.label})),
        {
          missed: (w, l) => `${w} "${l}" shares no word with the narration; say a word from it or add cues`,
          late: (w, l, p) => `${w} "${l}" is spoken before "${p}"; list steps in narration order`,
        },
      ),
      ...lintRtlAndBidi(ctx.lang, {
        prefix: 'array-algo',
        arWarning: 'array-algo draws array indices left to right and is not mirrored',
        texts: [
          ['heading', v.heading],
          ...(v.caption ? [['caption', v.caption] as [string, string]] : []),
        ],
      }),
    ],
  }),
  focusTargets: (v) => ({ids: collectFocusIds(v)}),
};
