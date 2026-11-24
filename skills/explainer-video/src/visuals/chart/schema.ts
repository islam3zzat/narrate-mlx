import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {PLOT_TONES} from '../plot-kit';

export const CHART_LIMITS = {
  heading: 60,
  caption: 160,
  label: 40,
  unit: 12,
  maxCategories: 8,
  maxSeries: 8,
  maxPoints: 100,
  maxScatterPoints: 20,
  maxAbs: 1e30,
  minSpan: 1e-12,
} as const;

const finiteBounded = (name: string, v: number): string | null => {
  if (!Number.isFinite(v)) return `${name} must be finite`;
  if (Math.abs(v) > CHART_LIMITS.maxAbs) return `${name} must stay within ±${CHART_LIMITS.maxAbs}`;
  return null;
};

const DomainTuple = z.tuple([z.number(), z.number()]);

export const ChartBarLineSeries = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can highlight this series'),
  label: text('Series or method legend label (40 display cells max)'),
  tone: z.enum(PLOT_TONES).optional().describe('Series colour token from theme'),
  values: z.array(z.number()).min(1).max(CHART_LIMITS.maxCategories).optional()
    .describe('For kind="bar": one numeric value per category'),
  errors: z.array(z.number().nonnegative()).min(1).max(CHART_LIMITS.maxCategories).optional()
    .describe('For kind="bar": optional symmetric ± half-width error bar per category'),
  ci: z.array(z.tuple([z.number(), z.number()])).min(1).max(CHART_LIMITS.maxCategories).optional()
    .describe('For kind="bar": optional [low, high] confidence interval per category'),
  points: z.array(z.tuple([z.number(), z.number()])).min(2).max(CHART_LIMITS.maxPoints).optional()
    .describe('For kind="line": sorted [x, y] points with strictly increasing x (2..100)'),
  band: z.array(z.tuple([z.number(), z.number()])).min(2).max(CHART_LIMITS.maxPoints).optional()
    .describe('For kind="line": optional [low, high] variance band matching points length'),
  dashed: z.boolean().optional().describe('For kind="line": draw dashed curve'),
  highlight: z.boolean().optional().describe('Emphasize proposed method or primary curve'),
});

export const ChartScatterPoint = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can highlight this point'),
  label: text('Point / method label (40 display cells max)'),
  x: z.number().describe('Horizontal metric value'),
  y: z.number().describe('Vertical metric value'),
  tone: z.enum(PLOT_TONES).optional().describe('Marker colour token from theme'),
  size: z.number().min(0.6).max(2.4).optional().describe('Relative marker size multiplier (0.6..2.4)'),
  highlight: z.boolean().optional().describe('Emphasize this point with a callout halo'),
});

export const ChartBaseline = z.strictObject({
  value: z.number().describe('Reference value threshold line'),
  label: text('Optional baseline reference label').optional(),
  tone: z.enum(PLOT_TONES).optional().describe('Reference line colour token'),
});

export const ChartVisual = z.strictObject({
  type: z.literal('chart'),
  kind: z.enum(['bar', 'line', 'scatter']).describe('Empirical chart mode: benchmark bar, scaling line, or Pareto scatter'),
  heading: text('Scene heading').max(CHART_LIMITS.heading),
  layout: z.enum(['grouped', 'horizontal']).optional().describe('For kind="bar": vertical grouped bars (default) or horizontal bars'),
  xLabel: text('Optional horizontal axis label').optional(),
  yLabel: text('Optional vertical axis label').optional(),
  unit: text('Optional metric unit suffix shown on bar labels (e.g. "%", "ms")').optional(),
  xDomain: DomainTuple.optional().describe('Optional [xMin, xMax] viewport bounds'),
  yDomain: DomainTuple.optional().describe('Optional [yMin, yMax] viewport bounds'),
  xScale: z.enum(['linear', 'log']).optional().describe('Horizontal axis scale for line/scatter (default "linear")'),
  yScale: z.enum(['linear', 'log']).optional().describe('Vertical/value axis scale (default "linear")'),
  categories: z.array(text('Category / benchmark label')).min(1).max(CHART_LIMITS.maxCategories).optional()
    .describe('For kind="bar": benchmark or dataset names along the category axis (1..8)'),
  series: z.array(ChartBarLineSeries).min(1).max(CHART_LIMITS.maxSeries).optional()
    .describe('For kind="bar" or kind="line": data series (1..8)'),
  points: z.array(ChartScatterPoint).min(2).max(CHART_LIMITS.maxScatterPoints).optional()
    .describe('For kind="scatter": trade-off points (2..20)'),
  betterX: z.enum(['min', 'max']).optional().describe('For kind="scatter": optimal X direction for Pareto frontier (default "min")'),
  betterY: z.enum(['min', 'max']).optional().describe('For kind="scatter": optimal Y direction for Pareto frontier (default "max")'),
  showFrontier: z.boolean().optional().describe('For kind="scatter": draw the computed Pareto frontier line (default true)'),
  baseline: ChartBaseline.optional().describe('Optional reference threshold line across the value axis'),
  caption: text('Optional bottom takeaway note').max(CHART_LIMITS.caption).optional(),
}).superRefine((v, ctx) => {
  const addErr = (path: (string | number)[], message: string) =>
    ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

  const checkTxt = (path: (string | number)[], label: string, val: string | undefined, max: number) => {
    if (val === undefined) return;
    if (displayCells(val) > max) addErr(path, `${label} must be <= ${max} display cells`);
    for (const msg of textCharIssues(label, val)) addErr(path, msg);
  };

  checkTxt(['heading'], 'heading', v.heading, CHART_LIMITS.heading);
  checkTxt(['caption'], 'caption', v.caption, CHART_LIMITS.caption);
  checkTxt(['xLabel'], 'xLabel', v.xLabel, CHART_LIMITS.label);
  checkTxt(['yLabel'], 'yLabel', v.yLabel, CHART_LIMITS.label);
  checkTxt(['unit'], 'unit', v.unit, CHART_LIMITS.unit);

  const checkDomain = (path: string, d: [number, number] | undefined, isLog: boolean) => {
    if (!d) return;
    for (const err of [finiteBounded(`${path}[0]`, d[0]), finiteBounded(`${path}[1]`, d[1])]) {
      if (err) { addErr([path], err); return; }
    }
    if (d[0] >= d[1]) addErr([path], `${path} min (${d[0]}) must be strictly less than max (${d[1]})`);
    if (d[1] - d[0] < CHART_LIMITS.minSpan) addErr([path], `${path} span must be at least ${CHART_LIMITS.minSpan}`);
    if (isLog && d[0] <= 0) addErr([path], `${path} bounds must be strictly > 0 for log scale`);
  };

  checkDomain('xDomain', v.xDomain, v.xScale === 'log');
  checkDomain('yDomain', v.yDomain, v.yScale === 'log');

  if (v.baseline) {
    const err = finiteBounded('baseline.value', v.baseline.value);
    if (err) addErr(['baseline', 'value'], err);
    if (v.yScale === 'log' && v.baseline.value <= 0) {
      addErr(['baseline', 'value'], 'baseline.value must be > 0 when yScale is "log"');
    }
    checkTxt(['baseline', 'label'], 'baseline.label', v.baseline.label, CHART_LIMITS.label);
  }

  const seenIds = new Set<string>();
  const recordId = (path: (string | number)[], id: string | undefined) => {
    if (!id) return;
    if (seenIds.has(id)) addErr(path, `duplicate id "${id}"`);
    seenIds.add(id);
  };

  if (v.kind === 'bar') {
    if (!v.categories?.length) addErr(['categories'], 'kind="bar" requires categories');
    if (!v.series?.length) addErr(['series'], 'kind="bar" requires series');
    if (v.points) addErr(['points'], 'points is only valid for kind="scatter"');
    if (v.betterX || v.betterY || v.showFrontier !== undefined) {
      addErr(['kind'], 'betterX/betterY/showFrontier are only valid for kind="scatter"');
    }
    if (v.xScale) addErr(['xScale'], 'xScale is not valid for categorical kind="bar" (use yScale for values)');
    v.categories?.forEach((c, i) => checkTxt(['categories', i], `categories[${i}]`, c, CHART_LIMITS.label));
    const nCat = v.categories?.length ?? 0;
    v.series?.forEach((s, i) => {
      recordId(['series', i, 'id'], s.id);
      checkTxt(['series', i, 'label'], `series[${i}].label`, s.label, CHART_LIMITS.label);
      if (!s.values) addErr(['series', i, 'values'], 'kind="bar" series require values');
      if (s.points) addErr(['series', i, 'points'], 'series[].points is only valid for kind="line"');
      if (s.band) addErr(['series', i, 'band'], 'series[].band is only valid for kind="line"');
      if (s.dashed !== undefined) addErr(['series', i, 'dashed'], 'series[].dashed is only valid for kind="line"');
      if (s.errors && s.ci) addErr(['series', i, 'ci'], 'specify either errors or ci on a bar series, not both');
      if (s.values && nCat > 0 && s.values.length !== nCat) {
        addErr(['series', i, 'values'], `series[${i}].values length (${s.values.length}) must match categories length (${nCat})`);
      }
      s.values?.forEach((val, j) => {
        const err = finiteBounded(`series[${i}].values[${j}]`, val);
        if (err) addErr(['series', i, 'values', j], err);
        if (v.yScale === 'log' && val <= 0) addErr(['series', i, 'values', j], 'bar values must be > 0 for log scale');
      });
      if (s.errors) {
        if (nCat > 0 && s.errors.length !== nCat) {
          addErr(['series', i, 'errors'], `series[${i}].errors length (${s.errors.length}) must match categories (${nCat})`);
        }
        s.errors.forEach((e, j) => {
          const err = finiteBounded(`series[${i}].errors[${j}]`, e);
          if (err) addErr(['series', i, 'errors', j], err);
          if (v.yScale === 'log' && s.values && s.values[j] !== undefined && s.values[j] - e <= 0) {
            addErr(['series', i, 'errors', j], 'bar value - error must remain > 0 for log scale');
          }
        });
      }
      if (s.ci) {
        if (nCat > 0 && s.ci.length !== nCat) {
          addErr(['series', i, 'ci'], `series[${i}].ci length (${s.ci.length}) must match categories (${nCat})`);
        }
        s.ci.forEach(([lo, hi], j) => {
          const e0 = finiteBounded(`series[${i}].ci[${j}][0]`, lo);
          const e1 = finiteBounded(`series[${i}].ci[${j}][1]`, hi);
          if (e0) addErr(['series', i, 'ci', j, 0], e0);
          if (e1) addErr(['series', i, 'ci', j, 1], e1);
          if (lo > hi) addErr(['series', i, 'ci', j], `ci[${j}] low (${lo}) must be <= high (${hi})`);
          if (v.yScale === 'log' && lo <= 0) addErr(['series', i, 'ci', j, 0], 'ci lower bound must be > 0 for log scale');
        });
      }
    });
  } else if (v.kind === 'line') {
    if (!v.series?.length) addErr(['series'], 'kind="line" requires series');
    if (v.categories) addErr(['categories'], 'categories is only valid for kind="bar"');
    if (v.layout) addErr(['layout'], 'layout is only valid for kind="bar"');
    if (v.points) addErr(['points'], 'points is only valid for kind="scatter"');
    if (v.betterX || v.betterY || v.showFrontier !== undefined) {
      addErr(['kind'], 'betterX/betterY/showFrontier are only valid for kind="scatter"');
    }
    v.series?.forEach((s, i) => {
      recordId(['series', i, 'id'], s.id);
      checkTxt(['series', i, 'label'], `series[${i}].label`, s.label, CHART_LIMITS.label);
      if (!s.points) addErr(['series', i, 'points'], 'kind="line" series require points');
      if (s.values) addErr(['series', i, 'values'], 'series[].values is only valid for kind="bar"');
      if (s.errors) addErr(['series', i, 'errors'], 'series[].errors is only valid for kind="bar"');
      if (s.ci) addErr(['series', i, 'ci'], 'series[].ci is only valid for kind="bar"');
      s.points?.forEach(([px, py], j) => {
        const ex = finiteBounded(`series[${i}].points[${j}][0]`, px);
        const ey = finiteBounded(`series[${i}].points[${j}][1]`, py);
        if (ex) addErr(['series', i, 'points', j, 0], ex);
        if (ey) addErr(['series', i, 'points', j, 1], ey);
        if (j > 0 && px <= s.points![j - 1][0]) {
          addErr(['series', i, 'points', j, 0], 'points x coordinates must be strictly increasing');
        }
        if (v.xScale === 'log' && px <= 0) addErr(['series', i, 'points', j, 0], 'x must be > 0 when xScale is "log"');
        if (v.yScale === 'log' && py <= 0) addErr(['series', i, 'points', j, 1], 'y must be > 0 when yScale is "log"');
      });
      if (s.band) {
        if (s.points && s.band.length !== s.points.length) {
          addErr(['series', i, 'band'], `band length (${s.band.length}) must match points length (${s.points.length})`);
        }
        s.band.forEach(([lo, hi], j) => {
          const e0 = finiteBounded(`series[${i}].band[${j}][0]`, lo);
          const e1 = finiteBounded(`series[${i}].band[${j}][1]`, hi);
          if (e0) addErr(['series', i, 'band', j, 0], e0);
          if (e1) addErr(['series', i, 'band', j, 1], e1);
          if (lo > hi) addErr(['series', i, 'band', j], `band[${j}] low (${lo}) must be <= high (${hi})`);
          if (v.yScale === 'log' && lo <= 0) addErr(['series', i, 'band', j, 0], 'band lower bound must be > 0 for log scale');
        });
      }
    });
  } else if (v.kind === 'scatter') {
    if (!v.points?.length) addErr(['points'], 'kind="scatter" requires points');
    if (v.categories) addErr(['categories'], 'categories is only valid for kind="bar"');
    if (v.layout) addErr(['layout'], 'layout is only valid for kind="bar"');
    if (v.series) addErr(['series'], 'series is only valid for kind="bar" or "line"');
    v.points?.forEach((p, i) => {
      recordId(['points', i, 'id'], p.id);
      checkTxt(['points', i, 'label'], `points[${i}].label`, p.label, CHART_LIMITS.label);
      const ex = finiteBounded(`points[${i}].x`, p.x);
      const ey = finiteBounded(`points[${i}].y`, p.y);
      if (ex) addErr(['points', i, 'x'], ex);
      if (ey) addErr(['points', i, 'y'], ey);
      if (v.xScale === 'log' && p.x <= 0) addErr(['points', i, 'x'], 'x must be > 0 when xScale is "log"');
      if (v.yScale === 'log' && p.y <= 0) addErr(['points', i, 'y'], 'y must be > 0 when yScale is "log"');
    });
  }
});

export type ChartVisualT = z.infer<typeof ChartVisual>;
