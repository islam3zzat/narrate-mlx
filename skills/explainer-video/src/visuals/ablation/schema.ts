import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';

export const ABLATION_LIMITS = {
  heading: 60,
  caption: 160,
  label: 36,
  metric: 40,
  unit: 12,
  note: 40,
  maxSteps: 8,
  maxAbs: 1e9,
  minSpan: 1e-6,
} as const;

export const AblationTone = z.enum(['auto', 'accent', 'danger', 'neutral', 'primary']);
export type AblationToneT = z.infer<typeof AblationTone>;

export const AblationBaseline = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can highlight the baseline bar'),
  label: text('Baseline label (36 display cells max)').describe('Shown under the starting bar and used as its reveal slot'),
  value: z.number().describe('Starting baseline numeric value'),
});

export const AblationStep = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can highlight this component step'),
  label: text('Component step label (36 display cells max)').describe('Shown below this bar and matched in narration for timing'),
  delta: z.number().describe('Signed contribution (+ or -) added to running total'),
  tone: AblationTone.optional().describe('Semantic tone: "auto" (default), "accent", "danger", "neutral", or "primary"'),
  note: text('Optional short annotation badge').optional(),
});

export const AblationVisual = z.strictObject({
  type: z.literal('ablation'),
  heading: text('Scene heading').max(ABLATION_LIMITS.heading),
  metric: text('Optional metric / vertical axis label').optional(),
  unit: text('Optional unit suffix, e.g. "%", "ms", "pt"').optional(),
  decimals: z.number().int().min(0).max(4).optional().describe('Optional decimal places (auto-inferred when omitted)'),
  higherIsBetter: z.boolean().optional().describe('True (default) if positive deltas are gains; false for loss/latency metrics'),
  baseline: AblationBaseline,
  steps: z.array(AblationStep).min(1).max(ABLATION_LIMITS.maxSteps).describe('Ordered component additions or removals (1..8)'),
  showTotal: z.boolean().optional().describe('Whether to append the cumulative final bar (default true)'),
  totalId: ID.optional().describe('Optional id so `focus` can highlight the final total bar'),
  totalLabel: text('Final total bar label (default "Full System")').optional(),
  yDomain: z.tuple([z.number(), z.number()]).optional().describe('Optional explicit [yMin, yMax] range'),
  caption: text('Optional bottom takeaway note').max(ABLATION_LIMITS.caption).optional(),
}).superRefine((v, ctx) => {
  const addErr = (path: (string | number)[], message: string) =>
    ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

  const checkTxt = (path: (string | number)[], name: string, s: string | undefined, max: number) => {
    if (s === undefined) return;
    if (displayCells(s) > max) addErr(path, `${name} must be <= ${max} display cells`);
    for (const msg of textCharIssues(name, s)) addErr(path, msg);
  };

  const checkNum = (path: (string | number)[], name: string, n: number) => {
    if (!Number.isFinite(n) || Math.abs(n) > ABLATION_LIMITS.maxAbs) {
      addErr(path, `${name} must be finite and within ±${ABLATION_LIMITS.maxAbs}`);
    }
  };

  checkTxt(['heading'], 'heading', v.heading, ABLATION_LIMITS.heading);
  checkTxt(['caption'], 'caption', v.caption, ABLATION_LIMITS.caption);
  checkTxt(['metric'], 'metric', v.metric, ABLATION_LIMITS.metric);
  checkTxt(['unit'], 'unit', v.unit, ABLATION_LIMITS.unit);
  checkTxt(['totalLabel'], 'totalLabel', v.totalLabel, ABLATION_LIMITS.label);
  checkTxt(['baseline', 'label'], 'baseline.label', v.baseline.label, ABLATION_LIMITS.label);
  checkNum(['baseline', 'value'], 'baseline.value', v.baseline.value);

  if (v.yDomain) {
    checkNum(['yDomain', 0], 'yDomain[0]', v.yDomain[0]);
    checkNum(['yDomain', 1], 'yDomain[1]', v.yDomain[1]);
    if (v.yDomain[0] >= v.yDomain[1]) {
      addErr(['yDomain'], `yDomain min (${v.yDomain[0]}) must be < max (${v.yDomain[1]})`);
    } else if (v.yDomain[1] - v.yDomain[0] < ABLATION_LIMITS.minSpan) {
      addErr(['yDomain'], `yDomain span must be >= ${ABLATION_LIMITS.minSpan}`);
    }
  }

  const seen = new Set<string>();
  const recId = (path: (string | number)[], id: string | undefined) => {
    if (!id) return;
    if (seen.has(id)) addErr(path, `duplicate id "${id}"`);
    seen.add(id);
  };
  recId(['baseline', 'id'], v.baseline.id);
  recId(['totalId'], v.totalId);

  v.steps.forEach((s, i) => {
    recId(['steps', i, 'id'], s.id);
    checkTxt(['steps', i, 'label'], `steps[${i}].label`, s.label, ABLATION_LIMITS.label);
    checkTxt(['steps', i, 'note'], `steps[${i}].note`, s.note, ABLATION_LIMITS.note);
    checkNum(['steps', i, 'delta'], `steps[${i}].delta`, s.delta);
  });
});

export type AblationVisualT = z.infer<typeof AblationVisual>;

export {AblationVisual as schema};
