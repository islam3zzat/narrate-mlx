import {z} from 'zod';
import {text} from '../common';

export const FlowVisual = z.strictObject({
  type: z.literal('flow'),
  heading: text('Scene heading'),
  nodes: z.array(z.strictObject({
    label: text('Box title'),
    sub: z.string().trim().min(1).optional().describe('Small text under the title'),
  })).min(2).max(5).describe('2 to 5 boxes joined by arrows, left to right'),
}).describe('A short left-to-right chain');

export {FlowVisual as schema};
