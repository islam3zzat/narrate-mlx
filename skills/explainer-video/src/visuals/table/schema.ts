import {z} from 'zod';
import {text} from '../common';

export const TableVisual = z.strictObject({
  type: z.literal('table'),
  heading: text('Scene heading'),
  headers: z.array(text('Column header')).min(2),
  rows: z.array(z.array(z.string())).min(1).describe('Each row needs exactly one cell per header'),
}).describe('A small table').refine((v) => v.rows.every((r) => r.length === v.headers.length), {
  path: ['rows'], message: 'every row must have the same number of cells as headers',
});

export {TableVisual as schema};
