import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {parseExpr} from '../math-expr';
import {domainIssue, PLOT_TONES} from '../plot-kit';

export const PLOT2D_LIMITS = {
  heading: 60,
  caption: 160,
  label: 40,
  tag: 24,
  minCurves: 1,
  maxCurves: 4,
  minPoints: 2,
  maxPoints: 200,
  maxStages: 6,
  maxSlices: 64,
  maxZoom: 20,
} as const;

const DomainTuple = z.tuple([z.number(), z.number()]);

export const Plot2DCurve = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can highlight this curve'),
  label: text('Curve legend label (40 display cells max)').describe('Shown in the legend and used for narration reveal when no stages are set'),
  expr: z.string().trim().min(1).optional().describe('Safe math expression in x, e.g. "0.5 * x^2" or "sin(x)"'),
  points: z.array(z.tuple([z.number(), z.number()])).min(PLOT2D_LIMITS.minPoints).max(PLOT2D_LIMITS.maxPoints).optional()
    .describe('Explicit [x, y] points with strictly increasing x (2 to 200 points)'),
  tone: z.enum(PLOT_TONES).optional().describe('Curve colour token from theme'),
  dashed: z.boolean().optional().describe('Draw dashed line instead of solid'),
});

const PointStage = z.strictObject({
  kind: z.literal('point'),
  id: ID.optional(),
  label: text('Narration-timed stage label'),
  curve: z.number().int().min(0).max(PLOT2D_LIMITS.maxCurves - 1).optional(),
  x: z.number().describe('Point x coordinate'),
  tag: text('Optional short callout tag next to point').optional(),
});

const SecantStage = z.strictObject({
  kind: z.literal('secant'),
  id: ID.optional(),
  label: text('Narration-timed stage label'),
  curve: z.number().int().min(0).max(PLOT2D_LIMITS.maxCurves - 1).optional(),
  x: z.number().describe('Base x coordinate'),
  dx: z.number().describe('Starting step dx (non-zero)'),
  toDx: z.number().optional().describe('Target step dx at end of stage (may be 0 to converge to tangent)'),
  zoom: z.number().min(1).max(PLOT2D_LIMITS.maxZoom).optional().describe('Optional camera zoom factor around (x, f(x))'),
});

const TangentStage = z.strictObject({
  kind: z.literal('tangent'),
  id: ID.optional(),
  label: text('Narration-timed stage label'),
  curve: z.number().int().min(0).max(PLOT2D_LIMITS.maxCurves - 1).optional(),
  x: z.number().describe('Point x coordinate (auto-detects corners like |x|)'),
  zoom: z.number().min(1).max(PLOT2D_LIMITS.maxZoom).optional().describe('Optional camera zoom factor around (x, f(x))'),
});

const RiemannStage = z.strictObject({
  kind: z.literal('riemann'),
  id: ID.optional(),
  label: text('Narration-timed stage label'),
  curve: z.number().int().min(0).max(PLOT2D_LIMITS.maxCurves - 1).optional(),
  range: DomainTuple.describe('[a, b] integration interval with a < b'),
  slices: z.number().int().min(1).max(PLOT2D_LIMITS.maxSlices).optional().describe('Starting rectangle count (1..64)'),
  toSlices: z.number().int().min(1).max(PLOT2D_LIMITS.maxSlices).optional().describe('Target rectangle count at end of stage (1..64)'),
  method: z.enum(['left', 'right', 'midpoint', 'smooth']).optional().describe('Sampling rule or "smooth" continuous signed area'),
});

const ZoomStage = z.strictObject({
  kind: z.literal('zoom'),
  id: ID.optional(),
  label: text('Narration-timed stage label'),
  xDomain: DomainTuple.optional().describe('Target [xMin, xMax] viewport'),
  yDomain: DomainTuple.optional().describe('Target [yMin, yMax] viewport'),
  center: z.tuple([z.number(), z.number()]).optional().describe('Zoom center [x, y] (used with factor)'),
  factor: z.number().min(1).max(PLOT2D_LIMITS.maxZoom).optional().describe('Zoom multiplier around center'),
});

export const Plot2DStage = z.discriminatedUnion('kind', [
  PointStage,
  SecantStage,
  TangentStage,
  RiemannStage,
  ZoomStage,
]);

export const Plot2DVisual = z.strictObject({
  type: z.literal('plot2d'),
  heading: text('Scene heading').max(PLOT2D_LIMITS.heading),
  xDomain: DomainTuple.describe('[xMin, xMax] horizontal axis domain'),
  yDomain: DomainTuple.describe('[yMin, yMax] vertical axis domain'),
  xLabel: text('Optional horizontal axis label').optional(),
  yLabel: text('Optional vertical axis label').optional(),
  curves: z.array(Plot2DCurve).min(PLOT2D_LIMITS.minCurves).max(PLOT2D_LIMITS.maxCurves),
  stages: z.array(Plot2DStage).min(1).max(PLOT2D_LIMITS.maxStages).optional()
    .describe('Optional narration-timed stages (point, secant, tangent, riemann, zoom)'),
  caption: text('Optional caption line under the plot').max(PLOT2D_LIMITS.caption).optional(),
}).describe('Animated 2D function plot with curves, secant-to-tangent zoom, corner detection, and Riemann slices (2D only)').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  textCharIssues('heading', v.heading, true).forEach((m) => add(['heading'], m));
  if (v.caption) textCharIssues('caption', v.caption, true).forEach((m) => add(['caption'], m));
  if (v.xLabel) {
    textCharIssues('xLabel', v.xLabel).forEach((m) => add(['xLabel'], m));
    if (displayCells(v.xLabel) > PLOT2D_LIMITS.label) add(['xLabel'], `xLabel exceeds ${PLOT2D_LIMITS.label} display cells`);
  }
  if (v.yLabel) {
    textCharIssues('yLabel', v.yLabel).forEach((m) => add(['yLabel'], m));
    if (displayCells(v.yLabel) > PLOT2D_LIMITS.label) add(['yLabel'], `yLabel exceeds ${PLOT2D_LIMITS.label} display cells`);
  }
  const xdIssue = domainIssue('xDomain', v.xDomain);
  if (xdIssue) add(['xDomain'], xdIssue);
  const ydIssue = domainIssue('yDomain', v.yDomain);
  if (ydIssue) add(['yDomain'], ydIssue);

  const curveIds = new Set<string>();
  v.curves.forEach((c, i) => {
    const p = ['curves', i];
    if (typeof c.label === 'string') {
      textCharIssues('label', c.label).forEach((m) => add([...p, 'label'], m));
      if (displayCells(c.label) > PLOT2D_LIMITS.label) add([...p, 'label'], `curve label exceeds ${PLOT2D_LIMITS.label} display cells`);
    }
    if (c.id) {
      if (curveIds.has(c.id)) add([...p, 'id'], `duplicate curve id "${c.id}"`);
      curveIds.add(c.id);
    }
    const hasExpr = typeof c.expr === 'string';
    const hasPts = Array.isArray(c.points);
    if (hasExpr === hasPts) {
      add(p, 'curve must specify exactly one of "expr" or "points"');
    }
    if (hasExpr) {
      const parsed = parseExpr(c.expr!, ['x']);
      if (!parsed.ok) add([...p, 'expr'], parsed.error);
    }
    if (hasPts) {
      for (let j = 0; j < c.points!.length; j++) {
        const pt = c.points![j];
        if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
          add([...p, 'points', j], 'point coordinates must be finite numbers');
          break;
        }
        if (Math.abs(pt[0]) > 1e6 || Math.abs(pt[1]) > 1e6) {
          add([...p, 'points', j], 'point coordinates must stay within ±1e6');
          break;
        }
        if (j > 0 && pt[0] <= c.points![j - 1][0]) {
          add([...p, 'points', j], 'points must have strictly increasing x values');
          break;
        }
      }
    }
  });

  v.stages?.forEach((st, i) => {
    const p = ['stages', i];
    if (typeof st.label === 'string') {
      textCharIssues('label', st.label).forEach((m) => add([...p, 'label'], m));
      if (displayCells(st.label) > PLOT2D_LIMITS.label) add([...p, 'label'], `stage label exceeds ${PLOT2D_LIMITS.label} display cells`);
    }
    if ('curve' in st && st.curve !== undefined && st.curve >= v.curves.length) {
      add([...p, 'curve'], `curve index ${st.curve} is out of range (have ${v.curves.length} curve(s))`);
    }
    if (st.kind === 'point') {
      if (!Number.isFinite(st.x)) add([...p, 'x'], 'x must be finite');
      if (st.tag) {
        textCharIssues('tag', st.tag).forEach((m) => add([...p, 'tag'], m));
        if (displayCells(st.tag) > PLOT2D_LIMITS.tag) add([...p, 'tag'], `tag exceeds ${PLOT2D_LIMITS.tag} display cells`);
      }
    } else if (st.kind === 'secant') {
      if (!Number.isFinite(st.x)) add([...p, 'x'], 'x must be finite');
      if (!Number.isFinite(st.dx) || Math.abs(st.dx) < 1e-6) add([...p, 'dx'], 'dx must be finite and non-zero');
      if (st.toDx !== undefined && !Number.isFinite(st.toDx)) add([...p, 'toDx'], 'toDx must be finite');
    } else if (st.kind === 'tangent') {
      if (!Number.isFinite(st.x)) add([...p, 'x'], 'x must be finite');
    } else if (st.kind === 'riemann') {
      const rIssue = domainIssue('range', st.range);
      if (rIssue) add([...p, 'range'], rIssue);
    } else if (st.kind === 'zoom') {
      const hasDomains = st.xDomain !== undefined || st.yDomain !== undefined;
      const hasCenter = st.center !== undefined || st.factor !== undefined;
      if (hasDomains && hasCenter) {
        add(p, 'zoom stage must use either xDomain+yDomain or center+factor, not both');
      } else if (hasDomains) {
        if (!st.xDomain || !st.yDomain) add(p, 'zoom stage with domains needs both xDomain and yDomain');
        else {
          const xi = domainIssue('xDomain', st.xDomain);
          if (xi) add([...p, 'xDomain'], xi);
          const yi = domainIssue('yDomain', st.yDomain);
          if (yi) add([...p, 'yDomain'], yi);
        }
      } else if (hasCenter) {
        if (!st.center || st.factor === undefined) add(p, 'zoom stage with center needs both center and factor');
        else if (!Number.isFinite(st.center[0]) || !Number.isFinite(st.center[1])) add([...p, 'center'], 'center must be finite');
      } else {
        add(p, 'zoom stage must specify xDomain+yDomain or center+factor');
      }
    }
  });
});

export {Plot2DVisual as schema};
