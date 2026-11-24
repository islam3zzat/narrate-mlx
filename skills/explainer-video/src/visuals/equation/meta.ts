import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'equation'> = {
  type: 'equation',
  capabilities,
  docs: {
    fields: '`heading`, `equations[{label?, latex}]` (1 to 2), `terms[{id, label, gloss, tone?}]` (1 to 8), `caption?`',
    use: 'offline KaTeX-rendered mathematical equations with narration-timed term spotlights and plain-English gloss cards',
    rules: [
      'Wrap spotlighted sub-expressions inside `equations[].latex` using `\\term{id}{...}`; every `id` must match `terms[].id` and vice versa.',
      'Strict LaTeX safety enforcement: raw HTML tags, URI schemes, `\\href`/`\\url`/`\\html*`/`\\def`/`\\catcode`/`\\input`/`\\include`, unbalanced braces, and >400 chars are rejected.',
      'Spotlight moves across `terms` in listed order when their `label` is spoken (or controlled directly via `focus` targeting term `id`s), displaying each active term\'s plain-English `gloss`. LTR formula layout only.',
    ],
  },
  lint: (v, ctx) => {
    const slots = v.terms.map((t, i) => ({what: `term ${i + 1}`, label: t.label}));
    const texts: [string, string][] = [
      ['heading', v.heading],
      ...v.terms.map((t, i) => [`terms[${i}].gloss`, t.gloss] as [string, string]),
      ...(v.caption ? [['caption', v.caption] as [string, string]] : []),
    ];
    return {
      errors: [],
      warnings: [
        ...lintOrderedSlots(ctx.narration, slots, {
          missed: (what, label) => `equation ${what}: label "${label}" shares no word with the narration, so its spotlight moves at a guessed time; use words the narration says, or add "cues"`,
          late: (what, label, prevLabel) => `equation ${what} "${label}" is listed after "${prevLabel}" but spoken first; list terms in spoken order`,
        }),
        ...lintRtlAndBidi(ctx.lang, {
          prefix: 'equation',
          arWarning: 'equation math formulas are rendered left to right and not mirrored',
          texts,
        }),
      ],
    };
  },
  focusTargets: (v) => ({ids: v.terms.map((t) => t.id)}),
};
