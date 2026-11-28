import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'stance'> = {
  type: 'stance',
  capabilities,
  docs: {
    fields: "`question`, `entries[{by, text, kind, ref?}]` (1 to 8, at most 4 per speaker)",
    use: "dialogue videos: who holds which position on a question, one column per speaker with their avatar; `kind` is `claim`, `agree`, `disagree` or `resolve`, and `ref` the earlier entry it answers. Entries appear as they are spoken. On the whiteboard layout a following scene with `continues` keeps the question and the leading entries and adds the next ones, so a disagreement stays on the board while it is argued",
    rules: [
      '`by` is the id of a speaker declared in the script\'s `speakers` (unknown ids, and `by` in a video without `speakers`, are rejected). The first speaker is the left column.',
      'A `resolve` entry needs `ref` pointing at a `disagree` entry: a check mark is drawn over the entry it settles. `ref` always points at an earlier entry. List the full map again in each continued scene, the carried entries first and unchanged.',
      'A stance map is about a disagreement: with no `disagree` entry (once it holds two entries), or entries from one speaker only, use `notes` or `bullets`. The first scene of a continued run may hold a lone claim.',
    ],
  },
  lint: (v, ctx) => {
    const warnings: string[] = [];
    // a lone first entry is how a continued run starts (the disagreement comes in a later scene), so the checks need two entries
    if (v.entries.length >= 2) {
      if (!v.entries.some((e) => e.kind === 'disagree')) warnings.push('stance has no "disagree" entry: a stance map shows a disagreement and how it is settled; for plain points use notes or bullets');
      else if (new Set(v.entries.map((e) => e.by)).size < 2) warnings.push('stance has entries from one speaker only: the second column is empty');
    }
    // the question is the heading (drawn at once), so only the entries follow the narration; a carried entry is already on screen
    const slots = v.entries.map((e, i) => ({what: `entry ${i + 1}`, label: e.text}));
    warnings.push(
      ...lintOrderedSlots(ctx.narration, slots.filter((_, i) => !ctx.carried?.[i + 1]), {
        missed: (what, label) => `stance ${what}: "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`,
        late: (what, label, prevLabel) => `stance ${what} "${label}" is listed after "${prevLabel}" but spoken first; list entries in spoken order`,
      }),
      ...lintRtlAndBidi(ctx.lang, {
        prefix: 'stance',
        arWarning: 'stance belongs to dialogue videos, which are English only; the columns are not mirrored',
        texts: [['question', v.question], ...v.entries.map((e, i) => [`entry ${i + 1}`, e.text] as [string, string])],
      }),
    );
    return {errors: [], warnings};
  },
};
