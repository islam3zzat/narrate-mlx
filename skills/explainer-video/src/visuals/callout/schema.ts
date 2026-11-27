import {z} from 'zod';
import {text} from '../common';

export const CalloutVisual = z.strictObject({
  type: z.literal('callout'),
  heading: text('Small uppercase label'),
  big: text('The key message, large'),
  text: text('One supporting sentence'),
  tone: z.literal('warn').optional().describe('"warn" for a warning or open question'),
}).describe('One key message');

export {CalloutVisual as schema};
