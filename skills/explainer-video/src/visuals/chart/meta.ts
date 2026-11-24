import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'chart'> = {
  type: 'chart',
  capabilities,
  docs: {
    fields: '`heading`, `kind` (`bar` | `line` | `scatter`), `layout?`, `xLabel?`, `yLabel?`, `unit?`, `xDomain?`, `yDomain?`, `xScale?`, `yScale?`, `categories?`, `series?`, `points?`, `betterX?`, `betterY?`, `showFrontier?`, `baseline?`, `caption?`',
    use: 'empirical benchmark bar charts (with error bars/CIs), multi-series scaling curves (with log axes & variance bands), and Pareto trade-off scatter plots (use `stat` for 1–4 KPI counters and `ablation` for +/- cumulative waterfalls)',
    rules: [
      '`kind: "bar"` uses `categories` (1..8 datasets) and `series[{id?, label, values, errors?|ci?, tone?, highlight?}]` (1..8 methods), with `layout: "grouped"` (default) or `"horizontal"`. Multi-series charts reveal series by series; single-series charts reveal category by category.',
      '`kind: "line"` uses `series[{id?, label, points, band?, tone?, dashed?, highlight?}]`, optional `xScale`/`yScale: "log"` (all coordinates > 0), and optional `[low, high]` `band` shading.',
      '`kind: "scatter"` uses `points[{id?, label, x, y, tone?, size?, highlight?}]` (2..20) and highlights the computed Pareto frontier (`betterX` default `"min"`, `betterY` default `"max"`, `showFrontier` default `true`). `focus` dims unfocused series/points by `id`. LTR layout only.',
    ],
  },
  lint: (v, ctx) => {
    const slotLabels =
      v.kind === 'scatter'
        ? (v.points ?? []).map((p, i) => ({what: `point ${i + 1}`, label: p.label}))
        : v.kind === 'bar' && (v.series?.length ?? 0) <= 1
          ? (v.categories ?? []).map((c, i) => ({what: `category ${i + 1}`, label: c}))
          : (v.series ?? []).map((s, i) => ({what: `series ${i + 1}`, label: s.label}));
    const texts: [string, string][] = [['heading', v.heading], ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    return {
      errors: [],
      warnings: [
        ...lintOrderedSlots(ctx.narration, slotLabels, {
          missed: (what, label) => `chart ${what}: label "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`,
          late: (what, label, prevLabel) => `chart ${what} "${label}" is listed after "${prevLabel}" but spoken first; list items in spoken order`,
        }),
        ...lintRtlAndBidi(ctx.lang, {
          prefix: 'chart',
          arWarning: 'chart axes and data plots are drawn left to right and not mirrored',
          texts,
        }),
      ],
    };
  },
  focusTargets: (v) => ({
    ids:
      v.kind === 'scatter'
        ? (v.points ?? []).flatMap((p) => (p.id ? [p.id] : []))
        : (v.series ?? []).flatMap((s) => (s.id ? [s.id] : [])),
  }),
};
