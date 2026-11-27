import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {parseExpr} from '../math-expr';
import {domainIssue, PLOT_TONES} from '../plot-kit';

export const FIELD2D_LIMITS = {
  heading: 60,
  caption: 160,
  label: 40,
  tag: 24,
  minLevels: 4,
  maxLevels: 14,
  minDensity: 5,
  maxDensity: 12,
  maxOverlays: 6,
  maxPathSteps: 80,
} as const;

const DomainTuple = z.tuple([z.number(), z.number()]);
const PtTuple = z.tuple([z.number(), z.number()]);

const SliceOverlay = z.strictObject({
  kind: z.literal('slice'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  axis: z.enum(['x', 'y']).describe('Fix x=at (vary y) or y=at (vary x)'),
  at: z.number(),
});

const GradientOverlay = z.strictObject({
  kind: z.literal('gradient'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  points: z.array(PtTuple).min(1).max(12).optional(),
});

const PathOverlay = z.strictObject({
  kind: z.literal('path'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  direction: z.enum(['ascent', 'descent']),
  starts: z.array(PtTuple).min(1).max(3),
  steps: z.number().int().min(10).max(FIELD2D_LIMITS.maxPathSteps).optional(),
});

const ExtremaOverlay = z.strictObject({
  kind: z.literal('extrema'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  points: z.array(z.strictObject({
    at: PtTuple,
    tag: text('Short label, e.g. "Local max"'),
    tone: z.enum(PLOT_TONES).optional(),
  })).min(1).max(6),
});

const JacobianOverlay = z.strictObject({
  kind: z.literal('jacobian'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  at: PtTuple,
  size: z.number().min(0.1).max(4).optional(),
});

const DivergenceOverlay = z.strictObject({
  kind: z.literal('divergence'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  at: PtTuple,
  radius: z.number().min(0.1).max(4).optional(),
});

const CurlOverlay = z.strictObject({
  kind: z.literal('curl'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  at: PtTuple,
  radius: z.number().min(0.1).max(4).optional(),
});

const LineIntegralOverlay = z.strictObject({
  kind: z.literal('line-integral'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  points: z.array(PtTuple).min(2).max(40),
});

const FluxOverlay = z.strictObject({
  kind: z.literal('flux'),
  id: ID.optional(),
  label: text('Narration-timed overlay label'),
  points: z.array(PtTuple).min(2).max(20),
});

export const FieldOverlay = z.discriminatedUnion('kind', [
  SliceOverlay,
  GradientOverlay,
  PathOverlay,
  ExtremaOverlay,
  JacobianOverlay,
  DivergenceOverlay,
  CurlOverlay,
  LineIntegralOverlay,
  FluxOverlay,
]);

const SCALAR_KINDS = new Set(['slice', 'gradient', 'path', 'extrema']);
const VECTOR_KINDS = new Set(['jacobian', 'divergence', 'curl', 'line-integral', 'flux']);

export const Field2DVisual = z.strictObject({
  type: z.literal('field2d'),
  heading: text('Scene heading').max(FIELD2D_LIMITS.heading),
  mode: z.enum(['scalar', 'vector']).describe('"scalar" (contour map + gradient/paths) or "vector" (flow + divergence/curl/integrals)'),
  xDomain: DomainTuple,
  yDomain: DomainTuple,
  xLabel: text('Optional horizontal axis label').optional(),
  yLabel: text('Optional vertical axis label').optional(),
  expr: z.string().trim().min(1).optional().describe('Scalar mode: safe math expression f(x, y)'),
  levels: z.number().int().min(FIELD2D_LIMITS.minLevels).max(FIELD2D_LIMITS.maxLevels).optional().describe('Scalar mode: contour level count (4..14)'),
  fx: z.string().trim().min(1).optional().describe('Vector mode: x-component expression Fx(x, y)'),
  fy: z.string().trim().min(1).optional().describe('Vector mode: y-component expression Fy(x, y)'),
  density: z.number().int().min(FIELD2D_LIMITS.minDensity).max(FIELD2D_LIMITS.maxDensity).optional().describe('Vector mode: arrow grid density (5..12)'),
  particles: z.boolean().optional().describe('Vector mode: animate deterministic advected particles (default true)'),
  overlays: z.array(FieldOverlay).max(FIELD2D_LIMITS.maxOverlays).optional(),
  caption: text('Optional caption line').max(FIELD2D_LIMITS.caption).optional(),
}).describe('2D scalar contour map or vector field with narration-timed multivariable calculus overlays (2D only)').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  textCharIssues('heading', v.heading, true).forEach((m) => add(['heading'], m));
  if (v.caption) textCharIssues('caption', v.caption, true).forEach((m) => add(['caption'], m));
  if (v.xLabel) {
    textCharIssues('xLabel', v.xLabel).forEach((m) => add(['xLabel'], m));
    if (displayCells(v.xLabel) > FIELD2D_LIMITS.label) add(['xLabel'], `xLabel exceeds ${FIELD2D_LIMITS.label} display cells`);
  }
  if (v.yLabel) {
    textCharIssues('yLabel', v.yLabel).forEach((m) => add(['yLabel'], m));
    if (displayCells(v.yLabel) > FIELD2D_LIMITS.label) add(['yLabel'], `yLabel exceeds ${FIELD2D_LIMITS.label} display cells`);
  }
  const xi = domainIssue('xDomain', v.xDomain);
  if (xi) add(['xDomain'], xi);
  const yi = domainIssue('yDomain', v.yDomain);
  if (yi) add(['yDomain'], yi);

  if (v.mode === 'scalar') {
    if (!v.expr) add(['expr'], 'scalar mode requires "expr"');
    else {
      const r = parseExpr(v.expr, ['x', 'y']);
      if (!r.ok) add(['expr'], r.error);
    }
    if (v.fx !== undefined) add(['fx'], 'fx is only valid in vector mode');
    if (v.fy !== undefined) add(['fy'], 'fy is only valid in vector mode');
    if (v.density !== undefined) add(['density'], 'density is only valid in vector mode');
    if (v.particles !== undefined) add(['particles'], 'particles is only valid in vector mode');
  } else {
    if (!v.fx) add(['fx'], 'vector mode requires "fx"');
    else {
      const rx = parseExpr(v.fx, ['x', 'y']);
      if (!rx.ok) add(['fx'], rx.error);
    }
    if (!v.fy) add(['fy'], 'vector mode requires "fy"');
    else {
      const ry = parseExpr(v.fy, ['x', 'y']);
      if (!ry.ok) add(['fy'], ry.error);
    }
    if (v.expr !== undefined) add(['expr'], 'expr is only valid in scalar mode');
    if (v.levels !== undefined) add(['levels'], 'levels is only valid in scalar mode');
  }

  const seenIds = new Set<string>();
  const checkPt = (pt: readonly [number, number], path: (string | number)[]) => {
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) add(path, 'coordinates must be finite');
  };

  v.overlays?.forEach((ov, i) => {
    const p = ['overlays', i];
    if (typeof ov.label === 'string') {
      textCharIssues('label', ov.label).forEach((m) => add([...p, 'label'], m));
      if (displayCells(ov.label) > FIELD2D_LIMITS.label) add([...p, 'label'], `overlay label exceeds ${FIELD2D_LIMITS.label} display cells`);
    }
    if (ov.id) {
      if (seenIds.has(ov.id)) add([...p, 'id'], `duplicate overlay id "${ov.id}"`);
      seenIds.add(ov.id);
    }
    if (v.mode === 'scalar' && !SCALAR_KINDS.has(ov.kind)) {
      add([...p, 'kind'], `overlay kind "${ov.kind}" is only valid in vector mode`);
    }
    if (v.mode === 'vector' && !VECTOR_KINDS.has(ov.kind)) {
      add([...p, 'kind'], `overlay kind "${ov.kind}" is only valid in scalar mode`);
    }
    if (ov.kind === 'slice' && !Number.isFinite(ov.at)) add([...p, 'at'], 'at must be finite');
    if (ov.kind === 'gradient' && ov.points) ov.points.forEach((pt, j) => checkPt(pt, [...p, 'points', j]));
    if (ov.kind === 'path') ov.starts.forEach((pt, j) => checkPt(pt, [...p, 'starts', j]));
    if (ov.kind === 'extrema') {
      ov.points.forEach((ep, j) => {
        checkPt(ep.at, [...p, 'points', j, 'at']);
        textCharIssues('tag', ep.tag).forEach((m) => add([...p, 'points', j, 'tag'], m));
        if (displayCells(ep.tag) > FIELD2D_LIMITS.tag) add([...p, 'points', j, 'tag'], `tag exceeds ${FIELD2D_LIMITS.tag} display cells`);
      });
    }
    if (ov.kind === 'jacobian' || ov.kind === 'divergence' || ov.kind === 'curl') checkPt(ov.at, [...p, 'at']);
    if (ov.kind === 'line-integral' || ov.kind === 'flux') ov.points.forEach((pt, j) => checkPt(pt, [...p, 'points', j]));
  });
});

export {Field2DVisual as schema};
