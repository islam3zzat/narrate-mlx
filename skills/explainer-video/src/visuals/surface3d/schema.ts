import {z} from 'zod';
import {text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {parseExpr} from '../math-expr';
import {domainIssue} from '../plot-kit';

export const SURFACE3D_LIMITS = {
  heading: 60,
  caption: 160,
  label: 40,
  minRes: 8,
  maxRes: 28,
  minGrid: 2,
  maxGrid: 32,
  maxOverlays: 6,
  maxBoxes: 250,
} as const;

const DomainTuple = z.tuple([z.number(), z.number()]);

const SliceOverlay = z.strictObject({
  kind: z.literal('slice'),
  label: text('Narration-timed overlay label'),
  axis: z.enum(['x', 'y']).describe('Fix x=at or y=at to expose partial-derivative curve'),
  at: z.number(),
});

const TangentOverlay = z.strictObject({
  kind: z.literal('tangent'),
  label: text('Narration-timed overlay label'),
  at: z.tuple([z.number(), z.number()]).describe('[x, y] point of tangency'),
  size: z.number().min(0.2).max(3).optional().describe('Relative tangent plane patch half-size'),
});

const ColumnsOverlay = z.strictObject({
  kind: z.literal('columns'),
  label: text('Narration-timed overlay label'),
  nx: z.number().int().min(2).max(10),
  ny: z.number().int().min(2).max(10),
  nz: z.number().int().min(1).max(6).optional().describe('Vertical subdivisions when mode="voxels"'),
  xRange: DomainTuple.optional(),
  yRange: DomainTuple.optional(),
  mode: z.enum(['columns', 'voxels']).optional().describe('Double-integral "columns" (default) or triple-integral "voxels"'),
});

export const SurfaceOverlay = z.discriminatedUnion('kind', [
  SliceOverlay,
  TangentOverlay,
  ColumnsOverlay,
]);

export const Surface3DVisual = z.strictObject({
  type: z.literal('surface3d'),
  heading: text('Scene heading').max(SURFACE3D_LIMITS.heading),
  xDomain: DomainTuple,
  yDomain: DomainTuple,
  zDomain: DomainTuple.optional(),
  xLabel: text('Optional x-axis label').optional(),
  yLabel: text('Optional y-axis label').optional(),
  zLabel: text('Optional z-axis (height) label').optional(),
  expr: z.string().trim().min(1).optional().describe('Safe math expression z = f(x, y)'),
  grid: z.array(z.array(z.number())).min(SURFACE3D_LIMITS.minGrid).max(SURFACE3D_LIMITS.maxGrid).optional()
    .describe('Explicit rectangular height grid grid[iy][ix] (2..32 per side)'),
  resolution: z.number().int().min(SURFACE3D_LIMITS.minRes).max(SURFACE3D_LIMITS.maxRes).optional().describe('Mesh grid subdivisions (8..28, default 20)'),
  overlays: z.array(SurfaceOverlay).max(SURFACE3D_LIMITS.maxOverlays).optional(),
  caption: text('Optional caption line').max(SURFACE3D_LIMITS.caption).optional(),
}).describe('3D height surface z = f(x, y) with partial-derivative slices, tangent planes, and Riemann volume columns/voxels (3D mode only)').superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  textCharIssues('heading', v.heading, true).forEach((m) => add(['heading'], m));
  if (v.caption) textCharIssues('caption', v.caption, true).forEach((m) => add(['caption'], m));
  for (const [k, s] of [['xLabel', v.xLabel], ['yLabel', v.yLabel], ['zLabel', v.zLabel]] as const) {
    if (s) {
      textCharIssues(k, s).forEach((m) => add([k], m));
      if (displayCells(s) > SURFACE3D_LIMITS.label) add([k], `${k} exceeds ${SURFACE3D_LIMITS.label} display cells`);
    }
  }
  const xi = domainIssue('xDomain', v.xDomain);
  if (xi) add(['xDomain'], xi);
  const yi = domainIssue('yDomain', v.yDomain);
  if (yi) add(['yDomain'], yi);
  if (v.zDomain) {
    const zi = domainIssue('zDomain', v.zDomain);
    if (zi) add(['zDomain'], zi);
  }

  const hasExpr = v.expr !== undefined;
  const hasGrid = v.grid !== undefined;
  if (hasExpr === hasGrid) {
    add(['expr'], 'surface3d must specify exactly one of "expr" or "grid"');
  }
  if (hasExpr) {
    const r = parseExpr(v.expr!, ['x', 'y']);
    if (!r.ok) add(['expr'], r.error);
  }
  if (hasGrid && v.grid!.length >= SURFACE3D_LIMITS.minGrid) {
    const cols = v.grid![0]?.length ?? 0;
    if (cols < SURFACE3D_LIMITS.minGrid || cols > SURFACE3D_LIMITS.maxGrid) {
      add(['grid'], `grid columns must be between ${SURFACE3D_LIMITS.minGrid} and ${SURFACE3D_LIMITS.maxGrid}`);
    } else {
      for (let r = 0; r < v.grid!.length; r++) {
        if (v.grid![r].length !== cols) {
          add(['grid', r], 'grid rows must all have equal length');
          break;
        }
        if (v.grid![r].some((val) => !Number.isFinite(val) || Math.abs(val) > 1e6)) {
          add(['grid', r], 'grid values must be finite and within ±1e6');
          break;
        }
      }
    }
  }

  v.overlays?.forEach((ov, i) => {
    const p = ['overlays', i];
    if (typeof ov.label === 'string') {
      textCharIssues('label', ov.label).forEach((m) => add([...p, 'label'], m));
      if (displayCells(ov.label) > SURFACE3D_LIMITS.label) add([...p, 'label'], `overlay label exceeds ${SURFACE3D_LIMITS.label} display cells`);
    }
    if (ov.kind === 'slice' && !Number.isFinite(ov.at)) add([...p, 'at'], 'at must be finite');
    if (ov.kind === 'tangent' && (!Number.isFinite(ov.at[0]) || !Number.isFinite(ov.at[1]))) {
      add([...p, 'at'], 'tangent coordinates must be finite');
    }
    if (ov.kind === 'columns') {
      if (ov.xRange) {
        const xri = domainIssue('xRange', ov.xRange);
        if (xri) add([...p, 'xRange'], xri);
      }
      if (ov.yRange) {
        const yri = domainIssue('yRange', ov.yRange);
        if (yri) add([...p, 'yRange'], yri);
      }
      const totalBoxes = ov.nx * ov.ny * (ov.mode === 'voxels' ? (ov.nz ?? 3) : 1);
      if (totalBoxes > SURFACE3D_LIMITS.maxBoxes) {
        add(p, `columns/voxels count (${totalBoxes}) exceeds limit of ${SURFACE3D_LIMITS.maxBoxes}`);
      }
    }
  });
});

export {Surface3DVisual as schema};
