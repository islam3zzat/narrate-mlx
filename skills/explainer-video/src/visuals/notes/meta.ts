import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'notes'> = {
  type: 'notes',
  capabilities,
  docs: {
    fields: "`heading`, `items[{text, by?}]` (1 to 8)",
    use: "the takeaways or notes of a dialogue, each optionally marked with the speaker (`by`) it belongs to; items appear as they are spoken (at most 6). On the whiteboard layout a following scene with `continues` keeps the leading notes and adds new ones",
    rules: [
      '`by` is the id of a speaker declared in the script\'s `speakers`; the script is rejected when the id is unknown or when `by` is used in a video without `speakers`. The note is marked with that speaker\'s avatar, in their colour.',
    ],
  },
  lint: (v, ctx) => ({
    errors: [],
    warnings: [
      ...(v.items.length > 6 ? [`${v.items.length} notes won't fit well; keep to 6 or fewer`] : []),
      ...lintOrderedSlots(ctx.narration, v.items.flatMap((it, i) => (ctx.carried?.[i] ? [] : [{what: `note ${i + 1}`, label: it.text}])), {
        missed: (what, label) => `notes ${what}: "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`,
        late: (what, label, prevLabel) => `notes ${what} "${label}" is listed after "${prevLabel}" but spoken first; list notes in spoken order`,
      }),
      ...lintRtlAndBidi(ctx.lang, {
        prefix: 'notes',
        arWarning: 'notes belong to dialogue videos, which are English only; the list is not mirrored',
        texts: [['heading', v.heading], ...v.items.map((it, i) => [`note ${i + 1}`, it.text] as [string, string])],
      }),
    ],
  }),
};
