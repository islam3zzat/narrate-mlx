import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {parseExpr} from '../math-expr';
import {domainIssue, PLOT_TONES} from '../plot-kit';

export const LINKED_LIMITS = {
  heading: 60,
  caption: 160,
  label: 40,
  note: 50,
  unit: 12,
  minPoints: 2,
  maxPoints: 200,
  minStages: 1,
  maxStages: 6,
} as const;

const DomainTuple = z.tuple([z.number(), z.number()]);

export const LinkedPanel = z.strictObject({
  label: text('Panel title/quantity name, e.g. "Position" or "Speed"'),
  yDomain: DomainTuple.describe('[yMin, yMax] vertical domain for this panel'),
  yLabel: text('Optional vertical axis label').optional(),
  unit: z.string().trim().min(1).optional().describe('Optional unit suffix, e.g. "m", "m/s", "USD"'),
  expr: z.string().trim().min(1).optional().describe('Safe math expression in x; omit on one panel to derive it automatically from the other'),
  points: z.array(z.tuple([z.number(), z.number()])).min(LINKED_LIMITS.minPoints).max(LINKED_LIMITS.maxPoints).optional(),
  tone: z.enum(PLOT_TONES).optional(),
});

export const LinkedStage = z.strictObject({
  id: ID.optional(),
  label: text('Stage label matched to narration (cursor moves to stage.x when spoken)'),
  x: z.number().describe('Target x coordinate inside xDomain'),
  show: z.enum(['tangent', 'area', 'both']).optional().describe('Which correspondence to emphasize (default "both")'),
  note: text('Optional short annotation shown on the bridge bar').optional(),
});

export const LinkedPlotVisual = z.strictObject({
  type: z.literal('linked-plot'),
  heading: text('Scene heading').max(LINKED_LIMITS.heading),
  xDomain: DomainTuple.describe('Shared horizontal [xMin, xMax] domain'),
  xLabel: text('Optional shared horizontal axis label').optional(),
  top: LinkedPanel.describe('Accumulation panel F(x): tangent slope matches bottom panel value'),
  bottom: LinkedPanel.describe('Rate panel f(x) = F\'(x): shaded area matches top panel height change'),
  anchor: z.strictObject({x: z.number(), y: z.number()}).optional()
    .describe('Optional integration anchor {x, y} when top F(x) is derived from bottom f(x) (default F(xMin) = 0)'),
  stages: z.array(LinkedStage).min(LINKED_LIMITS.minStages).max(LINKED_LIMITS.maxStages),
  caption: text('Optional caption line under the plots').max(LINKED_LIMITS.caption).optional(),
}).describe('Dual stacked synchronized plots: top tangent slope equals bottom height, bottom shaded area equals top change (2D only)').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  textCharIssues('heading', v.heading, true).forEach((m) => add(['heading'], m));
  if (v.caption) textCharIssues('caption', v.caption, true).forEach((m) => add(['caption'], m));
  if (v.xLabel) {
    textCharIssues('xLabel', v.xLabel).forEach((m) => add(['xLabel'], m));
    if (displayCells(v.xLabel) > LINKED_LIMITS.label) add(['xLabel'], `xLabel exceeds ${LINKED_LIMITS.label} display cells`);
  }

  const xdErr = domainIssue('xDomain', v.xDomain);
  if (xdErr) add(['xDomain'], xdErr);

  const checkPanel = (pName: 'top' | 'bottom', panel: typeof v.top) => {
    textCharIssues('label', panel.label).forEach((m) => add([pName, 'label'], m));
    if (displayCells(panel.label) > LINKED_LIMITS.label) add([pName, 'label'], `${pName}.label exceeds ${LINKED_LIMITS.label} display cells`);
    if (panel.yLabel) {
      textCharIssues('yLabel', panel.yLabel).forEach((m) => add([pName, 'yLabel'], m));
      if (displayCells(panel.yLabel) > LINKED_LIMITS.label) add([pName, 'yLabel'], `${pName}.yLabel exceeds ${LINKED_LIMITS.label} display cells`);
    }
    if (panel.unit) {
      textCharIssues('unit', panel.unit).forEach((m) => add([pName, 'unit'], m));
      if (panel.unit.length > LINKED_LIMITS.unit) add([pName, 'unit'], `${pName}.unit exceeds ${LINKED_LIMITS.unit} characters`);
    }
    const ydErr = domainIssue(`${pName}.yDomain`, panel.yDomain);
    if (ydErr) add([pName, 'yDomain'], ydErr);
    if (panel.expr !== undefined && panel.points !== undefined) {
      add([pName], `${pName} cannot specify both "expr" and "points"`);
    }
    if (panel.expr !== undefined) {
      const r = parseExpr(panel.expr, ['x']);
      if (!r.ok) add([pName, 'expr'], r.error);
    }
    if (panel.points !== undefined) {
      for (let j = 0; j < panel.points.length; j++) {
        const pt = panel.points[j];
        if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
          add([pName, 'points', j], 'point coordinates must be finite numbers');
          break;
        }
        if (Math.abs(pt[0]) > 1e6 || Math.abs(pt[1]) > 1e6) {
          add([pName, 'points', j], 'point coordinates must stay within ±1e6');
          break;
        }
        if (j > 0 && pt[0] <= panel.points[j - 1][0]) {
          add([pName, 'points', j], 'points must have strictly increasing x');
          break;
        }
      }
    }
  };

  checkPanel('top', v.top);
  checkPanel('bottom', v.bottom);

  const topHas = v.top.expr !== undefined || v.top.points !== undefined;
  const botHas = v.bottom.expr !== undefined || v.bottom.points !== undefined;
  if (!topHas && !botHas) {
    add(['top'], 'at least one of top or bottom must define "expr" or "points"');
  }

  if (v.anchor) {
    if (!Number.isFinite(v.anchor.x) || !Number.isFinite(v.anchor.y)) {
      add(['anchor'], 'anchor coordinates must be finite');
    } else if (!xdErr && (v.anchor.x < v.xDomain[0] || v.anchor.x > v.xDomain[1])) {
      add(['anchor', 'x'], `anchor.x (${v.anchor.x}) must lie inside xDomain`);
    }
  }

  v.stages.forEach((st, i) => {
    const p = ['stages', i];
    if (typeof st.label === 'string') {
      textCharIssues('label', st.label).forEach((m) => add([...p, 'label'], m));
      if (displayCells(st.label) > LINKED_LIMITS.label) add([...p, 'label'], `stage label exceeds ${LINKED_LIMITS.label} display cells`);
    }
    if (st.note) {
      textCharIssues('note', st.note).forEach((m) => add([...p, 'note'], m));
      if (displayCells(st.note) > LINKED_LIMITS.note) add([...p, 'note'], `stage note exceeds ${LINKED_LIMITS.note} display cells`);
    }
    if (!Number.isFinite(st.x)) {
      add([...p, 'x'], 'stage.x must be finite');
    } else if (!xdErr && (st.x < v.xDomain[0] || st.x > v.xDomain[1])) {
      add([...p, 'x'], `stage.x (${st.x}) must lie inside xDomain [${v.xDomain[0]}, ${v.xDomain[1]}]`);
    }
  });
});

export {LinkedPlotVisual as schema};
