import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {PLOT_TONES} from '../plot-kit';

export const MATRIX_LIMITS = {
  heading: 60,
  caption: 160,
  label: 24,
  axisLabel: 36,
  unit: 10,
  minDim: 2,
  maxDim: 10,
  maxHighlights: 6,
  maxAbs: 1e6,
} as const;

export const MatrixHighlight = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can highlight this region'),
  label: text('Highlight / reveal slot label (matched in narration)'),
  kind: z.enum(['row', 'col', 'cell', 'block']).describe('Highlighted matrix target kind'),
  row: z.number().int().min(0).max(MATRIX_LIMITS.maxDim - 1).optional().describe('0-based row index (for row/cell)'),
  col: z.number().int().min(0).max(MATRIX_LIMITS.maxDim - 1).optional().describe('0-based col index (for col/cell)'),
  rows: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional().describe('[startRow, endRow] inclusive range for kind="block"'),
  cols: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional().describe('[startCol, endCol] inclusive range for kind="block"'),
  tone: z.enum(PLOT_TONES).optional().describe('Highlight frame colour token from theme'),
});

export const MatrixVisual = z.strictObject({
  type: z.literal('matrix'),
  heading: text('Scene heading').max(MATRIX_LIMITS.heading),
  rows: z.array(text('Row label')).min(MATRIX_LIMITS.minDim).max(MATRIX_LIMITS.maxDim),
  cols: z.array(text('Column label')).min(MATRIX_LIMITS.minDim).max(MATRIX_LIMITS.maxDim),
  values: z.array(z.array(z.number()).min(MATRIX_LIMITS.minDim).max(MATRIX_LIMITS.maxDim))
    .min(MATRIX_LIMITS.minDim)
    .max(MATRIX_LIMITS.maxDim)
    .describe('2D grid of numeric intensities matching rows.length x cols.length'),
  scale: z.enum(['sequential', 'diverging']).optional().describe('Colour encoding: "sequential" (default) or symmetric "diverging" around 0'),
  tone: z.enum(['secondary', 'primary', 'accent', 'danger']).optional().describe('High-value theme colour token (default "secondary")'),
  domain: z.tuple([z.number(), z.number()]).optional().describe('Optional explicit [min, max] intensity domain'),
  rowLabel: text('Optional Y/row axis tensor annotation (e.g. "Query Token")').optional(),
  colLabel: text('Optional X/column axis tensor annotation (e.g. "Key Token")').optional(),
  unit: text('Optional cell value unit suffix (e.g. "%", "ms")').optional(),
  decimals: z.number().int().min(0).max(4).optional().describe('Optional fixed decimal places for cell numbers'),
  showValues: z.boolean().optional().describe('Show numeric values inside cells (default true)'),
  highlights: z.array(MatrixHighlight).min(1).max(MATRIX_LIMITS.maxHighlights).optional()
    .describe('Optional narration-timed highlights over rows, columns, cells, or blocks'),
  caption: text('Optional bottom takeaway note').max(MATRIX_LIMITS.caption).optional(),
}).superRefine((v, ctx) => {
  const addErr = (path: (string | number)[], message: string) =>
    ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

  const checkTxt = (path: (string | number)[], name: string, s: string | undefined, max: number) => {
    if (s === undefined) return;
    if (displayCells(s) > max) addErr(path, `${name} must be <= ${max} display cells`);
    for (const msg of textCharIssues(name, s)) addErr(path, msg);
  };

  checkTxt(['heading'], 'heading', v.heading, MATRIX_LIMITS.heading);
  checkTxt(['caption'], 'caption', v.caption, MATRIX_LIMITS.caption);
  checkTxt(['rowLabel'], 'rowLabel', v.rowLabel, MATRIX_LIMITS.axisLabel);
  checkTxt(['colLabel'], 'colLabel', v.colLabel, MATRIX_LIMITS.axisLabel);
  checkTxt(['unit'], 'unit', v.unit, MATRIX_LIMITS.unit);

  const nRows = v.rows.length;
  const nCols = v.cols.length;
  v.rows.forEach((r, i) => checkTxt(['rows', i], `rows[${i}]`, r, MATRIX_LIMITS.label));
  v.cols.forEach((c, j) => checkTxt(['cols', j], `cols[${j}]`, c, MATRIX_LIMITS.label));

  if (v.values.length !== nRows) {
    addErr(['values'], `values row count (${v.values.length}) must match rows length (${nRows})`);
  }
  v.values.forEach((rowArr, r) => {
    if (rowArr.length !== nCols) {
      addErr(['values', r], `values[${r}] column count (${rowArr.length}) must match cols length (${nCols})`);
    }
    rowArr.forEach((val, c) => {
      if (!Number.isFinite(val) || Math.abs(val) > MATRIX_LIMITS.maxAbs) {
        addErr(['values', r, c], `values[${r}][${c}] must be finite within ±${MATRIX_LIMITS.maxAbs}`);
      }
    });
  });

  if (v.domain) {
    const [d0, d1] = v.domain;
    if (!Number.isFinite(d0) || !Number.isFinite(d1) || Math.abs(d0) > MATRIX_LIMITS.maxAbs || Math.abs(d1) > MATRIX_LIMITS.maxAbs) {
      addErr(['domain'], `domain bounds must be finite within ±${MATRIX_LIMITS.maxAbs}`);
    } else if (d0 >= d1) {
      addErr(['domain'], `domain min (${d0}) must be strictly less than max (${d1})`);
    }
  }

  const seen = new Set<string>();
  v.highlights?.forEach((h, i) => {
    if (h.id) {
      if (seen.has(h.id)) addErr(['highlights', i, 'id'], `duplicate highlight id "${h.id}"`);
      seen.add(h.id);
    }
    checkTxt(['highlights', i, 'label'], `highlights[${i}].label`, h.label, MATRIX_LIMITS.label);
    if (h.kind === 'row') {
      if (h.row === undefined) addErr(['highlights', i, 'row'], 'kind="row" requires row index');
      else if (h.row >= nRows) addErr(['highlights', i, 'row'], `row ${h.row} out of range (0..${nRows - 1})`);
    } else if (h.kind === 'col') {
      if (h.col === undefined) addErr(['highlights', i, 'col'], 'kind="col" requires col index');
      else if (h.col >= nCols) addErr(['highlights', i, 'col'], `col ${h.col} out of range (0..${nCols - 1})`);
    } else if (h.kind === 'cell') {
      if (h.row === undefined || h.col === undefined) addErr(['highlights', i], 'kind="cell" requires both row and col');
      else {
        if (h.row >= nRows) addErr(['highlights', i, 'row'], `row ${h.row} out of range (0..${nRows - 1})`);
        if (h.col >= nCols) addErr(['highlights', i, 'col'], `col ${h.col} out of range (0..${nCols - 1})`);
      }
    } else if (h.kind === 'block') {
      if (!h.rows || !h.cols) addErr(['highlights', i], 'kind="block" requires rows and cols tuples');
      else {
        const [r0, r1] = h.rows;
        const [c0, c1] = h.cols;
        if (r0 > r1 || r1 >= nRows) addErr(['highlights', i, 'rows'], `rows range [${r0}, ${r1}] invalid for 0..${nRows - 1}`);
        if (c0 > c1 || c1 >= nCols) addErr(['highlights', i, 'cols'], `cols range [${c0}, ${c1}] invalid for 0..${nCols - 1}`);
      }
    }
  });
});

export type MatrixVisualT = z.infer<typeof MatrixVisual>;
export type MatrixHighlightT = z.infer<typeof MatrixHighlight>;

export {MatrixVisual as schema};
