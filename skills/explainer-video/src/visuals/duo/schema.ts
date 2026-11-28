import {z} from 'zod';
import {text} from '../common';

export const DUO_LIMITS = {question: 90, quote: 80} as const;

export const DuoVisual = z.strictObject({
  type: z.literal('duo'),
  question: text('The question or claim, written on the board').max(DUO_LIMITS.question),
  quote: text('Optional pull quote: one sentence the current speaker says, shown as a speech bubble').max(DUO_LIMITS.quote).optional(),
}).describe('Two speakers facing each other, the current speaker lit and the other dimmed, with a question on the board (dialogue videos)');

export {DuoVisual as schema};
