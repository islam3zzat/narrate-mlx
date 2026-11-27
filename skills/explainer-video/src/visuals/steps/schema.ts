import {z} from 'zod';
import {text} from '../common';

export const StepsVisual = z.strictObject({
  type: z.literal('steps'),
  heading: text('Scene heading'),
  active: z.number().int().min(0).optional().describe('Zero-based index of the highlighted step, fixed for the whole scene; must be < items.length. Omit it to let the highlight advance with the narration (step i lights up when it is spoken), which is right when one scene narrates several steps'),
  items: z.array(text('One step')).min(1).max(8),
}).describe('A sequence with one highlighted step (fixed, or advancing with the narration)').refine((v) => v.active === undefined || v.active < v.items.length, {
  path: ['active'], message: 'active must be a valid index into items (0..items.length-1)',
});

export {StepsVisual as schema};
