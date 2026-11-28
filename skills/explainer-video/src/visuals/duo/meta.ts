import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'duo'> = {
  type: 'duo',
  capabilities,
  docs: {
    fields: "`question`, `quote?`",
    use: "dialogue videos only: the two speakers as figures, the one who speaks this scene lit and the other dimmed, with the question written between them and an optional pull quote. For the opening question, a pivotal claim or the close, not every turn",
    rules: [
      '`duo` needs the script\'s `speakers`: the left figure is the first speaker, the right one the second, and whoever the scene\'s `speaker` names is the one lit. A script without `speakers` is rejected.',
      'Use it at most 3 times per video and never in two scenes in a row; the podcast style checks this. A talking-heads picture says nothing new, so alternate it with pictures that teach.',
    ],
  },
  lint: (v, ctx) => ({
    errors: [],
    warnings: [
      ...lintOrderedSlots(ctx.narration, [{what: 'question', label: v.question}, ...(v.quote ? [{what: 'quote', label: v.quote}] : [])], {
        missed: (what, label) => `duo ${what}: "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says`,
        late: (what, label, prevLabel) => `duo ${what} "${label}" is spoken before "${prevLabel}"; the question comes first`,
      }),
      ...lintRtlAndBidi(ctx.lang, {
        prefix: 'duo',
        arWarning: 'duo belongs to dialogue videos, which are English only; the figures are not mirrored',
        texts: [['question', v.question], ...(v.quote ? [['quote', v.quote] as [string, string]] : [])],
      }),
    ],
  }),
};
