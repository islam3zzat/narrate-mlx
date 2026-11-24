import {z} from 'zod';
import {text} from '../common';

export const CompareVisual = z.strictObject({
  type: z.literal('compare'),
  heading: text('Scene heading'),
  columns: z.array(z.strictObject({
    title: text('Column title'),
    tag: text('Short tag under the title'),
    items: z.array(text('One line')).min(1).describe('Lines in the column'),
  })).min(2).max(4).describe('2 to 4 side-by-side options'),
}).describe('Side-by-side comparison');
