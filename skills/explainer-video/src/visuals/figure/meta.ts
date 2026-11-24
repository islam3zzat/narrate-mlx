import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots, lintRtlAndBidi} from '../meta-lint';

export const meta: Meta<'figure'> = {
  type: 'figure',
  capabilities,
  docs: {
    fields: '`heading`, `src` (relative `.png`|`.jpg`|`.jpeg`|`.svg` inside `<workdir>`), `alt`, `aspect?`, `regions?[{id?, label, x, y, w, h, zoom?, tone?, note?}]` (1 to 6 normalized `0..1` boxes), `caption?`',
    use: 'local paper figures, diagrams, qualitative examples, or micrographs with narration-timed dim-outside spotlights, camera pan/zoom, and plain callout labels',
    rules: [
      'Security confinement: `src` must be a relative POSIX path inside `<workdir>` (no `..`, leading `/`, `\\`, symlinks, URL schemes, or >10 MB files) and is validated & staged into `public/figures/` by `explainer.py`. SVG assets render via `<Img>` (never raw inline HTML).',
      '`regions` define normalized `[0..1]` callout boxes that trigger in listed order as each `label` is spoken, dimming outside areas and zooming cleanly (`zoom` 1..3.5).',
      '`focus` accepts region `id`s to jump spotlight & camera zoom directly onto specific regions. Image coordinates stay LTR.',
    ],
  },
  lint: (v, ctx) => {
    const slots = (v.regions ?? []).map((r, i) => ({what: `region ${i + 1}`, label: r.label}));
    const texts: [string, string][] = [
      ['heading', v.heading],
      ['alt', v.alt],
      ...(v.regions ?? []).flatMap((r, i) => [
        [`regions[${i}].label`, r.label] as [string, string],
        ...(r.note ? [[`regions[${i}].note`, r.note] as [string, string]] : []),
      ]),
      ...(v.caption ? [['caption', v.caption] as [string, string]] : []),
    ];
    return {
      errors: [],
      warnings: [
        ...lintOrderedSlots(ctx.narration, slots, {
          missed: (what, label) => `figure ${what}: label "${label}" shares no word with the narration, so its spotlight moves at a guessed time; use words the narration says, or add "cues"`,
          late: (what, label, prevLabel) => `figure ${what} "${label}" is listed after "${prevLabel}" but spoken first; list regions in spoken order`,
        }),
        ...lintRtlAndBidi(ctx.lang, {
          prefix: 'figure',
          arWarning: 'figure coordinates and source imagery remain left to right and not mirrored',
          texts,
        }),
      ],
    };
  },
  focusTargets: (v) => ({ids: (v.regions ?? []).flatMap((r) => (r.id ? [r.id] : []))}),
};
