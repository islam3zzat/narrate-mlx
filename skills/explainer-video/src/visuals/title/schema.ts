import {z} from 'zod';
import {text} from '../common';

export const TitleVisual = z.strictObject({
  type: z.literal('title'),
  kicker: text('Small uppercase line above the headline'),
  headline: text('Main headline; keep under about 35 characters'),
  sub: text('Subtitle under the headline'),
}).describe('Opening scene');
