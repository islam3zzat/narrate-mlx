import {z} from 'zod';
import {text} from '../common';
import {displayCells, textCharIssues} from '../chars';

export const CANCELLATION_THEOREMS = ['ftc-1d', 'curl-2d', 'divergence-2d', 'divergence-3d'] as const;
export const CANCELLATION_PHASES = ['cells', 'interior', 'cancel', 'boundary'] as const;

export const CANCELLATION_LIMITS = {
  heading: 60,
  caption: 160,
  label: 40,
  note: 60,
  minStages: 1,
  maxStages: 6,
} as const;

export const CancellationStage = z.strictObject({
  label: text('Narration-timed stage label'),
  phase: z.enum(CANCELLATION_PHASES).describe('cells -> interior -> cancel -> boundary'),
  note: text('Optional short explanation badge for this stage').optional(),
});

export const CancellationGridVisual = z.strictObject({
  type: z.literal('cancellation-grid'),
  heading: text('Scene heading').max(CANCELLATION_LIMITS.heading),
  theorem: z.enum(CANCELLATION_THEOREMS).describe('ftc-1d (1D telescoping), curl-2d (Green/Stokes), divergence-2d, or divergence-3d (isometric cells)'),
  cols: z.number().int().optional().describe('Subdivisions along x (ftc-1d: 2..8; 2D: 2..5; 3D: 2..3)'),
  rows: z.number().int().optional().describe('Subdivisions along y (2D: 2..4; 3D: 2..3; omitted in ftc-1d)'),
  depth: z.number().int().optional().describe('Subdivisions along z (3D only: 2)'),
  stages: z.array(CancellationStage).min(CANCELLATION_LIMITS.minStages).max(CANCELLATION_LIMITS.maxStages),
  caption: text('Optional caption line').max(CANCELLATION_LIMITS.caption).optional(),
}).describe('Interior-cancellation tessellations showing how opposing interior contributions cancel to leave only the outer boundary (2D only)').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  textCharIssues('heading', v.heading, true).forEach((m) => add(['heading'], m));
  if (v.caption) textCharIssues('caption', v.caption, true).forEach((m) => add(['caption'], m));

  if (v.theorem === 'ftc-1d') {
    const c = v.cols ?? 5;
    if (c < 2 || c > 8) add(['cols'], 'ftc-1d cols must be between 2 and 8');
    if (v.rows !== undefined) add(['rows'], 'rows is not used for ftc-1d');
    if (v.depth !== undefined) add(['depth'], 'depth is not used for ftc-1d');
  } else if (v.theorem === 'curl-2d' || v.theorem === 'divergence-2d') {
    const c = v.cols ?? 3;
    const r = v.rows ?? 3;
    if (c < 2 || c > 5) add(['cols'], `${v.theorem} cols must be between 2 and 5`);
    if (r < 2 || r > 4) add(['rows'], `${v.theorem} rows must be between 2 and 4`);
    if (v.depth !== undefined) add(['depth'], `depth is not used for ${v.theorem}`);
  } else if (v.theorem === 'divergence-3d') {
    const c = v.cols ?? 2;
    const r = v.rows ?? 2;
    const d = v.depth ?? 2;
    if (c < 2 || c > 3) add(['cols'], 'divergence-3d cols must be 2 or 3');
    if (r < 2 || r > 3) add(['rows'], 'divergence-3d rows must be 2 or 3');
    if (d !== 2) add(['depth'], 'divergence-3d depth must be 2');
  }

  v.stages.forEach((st, i) => {
    const p = ['stages', i];
    if (typeof st.label === 'string') {
      textCharIssues('label', st.label).forEach((m) => add([...p, 'label'], m));
      if (displayCells(st.label) > CANCELLATION_LIMITS.label) add([...p, 'label'], `stage label exceeds ${CANCELLATION_LIMITS.label} display cells`);
    }
    if (st.note) {
      textCharIssues('note', st.note).forEach((m) => add([...p, 'note'], m));
      if (displayCells(st.note) > CANCELLATION_LIMITS.note) add([...p, 'note'], `stage note exceeds ${CANCELLATION_LIMITS.note} display cells`);
    }
  });
});

export {CancellationGridVisual as schema};
