import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'ablation'> = {
  type: 'ablation',
  capabilities,
  docs: {
    fields: '`heading`, `metric?`, `unit?`, `decimals?`, `higherIsBetter?`, `baseline{id?, label, value}`, `steps[{id?, label, delta, tone?, note?}]` (1 to 8), `showTotal?`, `totalId?`, `totalLabel?`, `yDomain?`, `caption?`',
    use: 'animated component-contribution waterfall charts from baseline through signed `+`/`-` ablation deltas to final system result',
    rules: [
      'Bars reveal in order: `baseline.label`, each `steps[].label`, and `totalLabel` (default `"Full System"`, when `showTotal` is not `false`). Mention a word from each label in order, or set `cues`.',
      '`tone: "auto"` (default) colours improvements with `accent` and regressions with `danger` according to `higherIsBetter` (default `true`); set `higherIsBetter: false` for latency, loss, or error metrics.',
      '`focus` highlights `baseline.id`, `steps[].id`, or `totalId` while dimming unfocused bars. Waterfall reads left to right.',
    ],
  },
  lint: (v, ctx) => {
    const slots: {what: string; label: string}[] = [
      {what: 'baseline', label: v.baseline.label},
      ...v.steps.map((s, i) => ({what: `step ${i + 1}`, label: s.label})),
      ...(v.showTotal !== false ? [{what: 'total', label: v.totalLabel ?? 'Full System'}] : []),
    ];
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    return {
      errors: [],
      warnings: [
        ...lintOrderedSlots(ctx.narration, slots, {
          missed: (what, label) => `ablation ${what}: label "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`,
          late: (what, label, prevLabel) => `ablation ${what} "${label}" is listed after "${prevLabel}" but spoken first; list items in spoken order`,
        }),
        ...lintRtlAndBidi(ctx.lang, {
          prefix: 'ablation',
          arWarning: 'ablation waterfall bars progress left to right and are not mirrored',
          texts,
        }),
      ],
    };
  },
  focusTargets: (v) => ({
    ids: [
      ...(v.baseline.id ? [v.baseline.id] : []),
      ...v.steps.flatMap((s) => (s.id ? [s.id] : [])),
      ...(v.totalId ? [v.totalId] : []),
    ],
  }),
};
