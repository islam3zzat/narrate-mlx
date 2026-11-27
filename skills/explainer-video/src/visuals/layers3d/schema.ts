import {z} from 'zod';
import {text, GRAPH_TONES, ID} from '../common';

export const Layers3DVisual = z.strictObject({
  type: z.literal('layers3d'),
  heading: text('Scene heading'),
  layers: z.array(z.strictObject({
    id: ID.describe('Unique layer id'),
    label: text('Layer name, 28 characters or fewer'),
    sub: z.string().trim().min(1).optional().describe('One short line under the label'),
    tone: z.enum(GRAPH_TONES).optional().describe('Layer colour'),
  })).min(2).max(6).describe('Layers bottom to top, revealed in this order over the narration'),
  caption: z.string().optional().describe('Line under the stack'),
}).describe('3D only (needs "mode": "3d"): an architecture drawn as stacked 3D slabs, bottom layer first').superRefine((v, ctx) => {
  const ids = new Set<string>();
  v.layers.forEach((l, i) => {
    if (ids.has(l.id)) ctx.addIssue({code: 'custom', path: ['layers', i, 'id'], message: `duplicate layer id "${l.id}"`});
    ids.add(l.id);
    if (l.label.length > 28) ctx.addIssue({code: 'custom', path: ['layers', i, 'label'], message: 'label is longer than 28 characters'});
  });
});

export {Layers3DVisual as schema};
