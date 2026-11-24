import {z} from 'zod';
import {text, GRAPH_TONES, ID} from '../common';

export const SequenceVisual = z.strictObject({
  type: z.literal('sequence'),
  heading: text('Scene heading'),
  participants: z.array(z.strictObject({
    id: ID.describe('Unique id used by messages'),
    label: text('Participant name'),
    sub: z.string().trim().min(1).optional().describe('Small text under the name, e.g. its role'),
    tone: z.enum(GRAPH_TONES).optional().describe('Header colour'),
  })).min(2).max(5).describe('Lifelines, left to right'),
  messages: z.array(z.strictObject({
    from: z.string().describe('Id of the sender'),
    to: z.string().describe('Id of the receiver; the same id draws a self-call'),
    label: text('Message text, 40 characters or fewer'),
    reply: z.boolean().optional().describe('Dashed line, for a response'),
    tone: z.enum(GRAPH_TONES).optional().describe('Colours the label and dots'),
  })).min(1).max(10).describe('Messages top to bottom, revealed in this order over the narration'),
  animate: z.boolean().default(true).describe('Dots travel along each message arrow (default true)'),
  caption: z.string().optional().describe('Line under the diagram'),
}).describe('A sequence diagram drawn natively and animated: who sends what to whom, in order').superRefine((v, ctx) => {
  const ids = new Set<string>();
  v.participants.forEach((p, i) => {
    if (ids.has(p.id)) ctx.addIssue({code: 'custom', path: ['participants', i, 'id'], message: `duplicate participant id "${p.id}"`});
    ids.add(p.id);
  });
  v.messages.forEach((m, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!ids.has(m[end])) ctx.addIssue({code: 'custom', path: ['messages', i, end], message: `unknown participant id "${m[end]}"`});
    }
    if (m.label.length > 40) ctx.addIssue({code: 'custom', path: ['messages', i, 'label'], message: 'label is longer than 40 characters'});
  });
});

export type SequenceVisualInput = z.infer<typeof SequenceVisual>;
