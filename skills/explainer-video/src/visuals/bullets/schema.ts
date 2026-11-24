import {z} from 'zod';
import {text} from '../common';

export const BulletsVisual = z.strictObject({
  type: z.literal('bullets'),
  heading: text('Scene heading'),
  items: z.array(text('One bullet')).min(1).max(8).describe('Bullets, revealed as they are spoken; 6 or fewer fit well'),
}).describe('A short list');
