import {z} from 'zod';
import {text} from '../common';

export const FanoutVisual = z.strictObject({
  type: z.literal('fanout'),
  heading: text('Scene heading'),
  source: z.strictObject({label: text('The thing that routes')}),
  targets: z.array(z.strictObject({label: text('Target name'), sub: text('One line about it')})).min(1).max(4),
}).describe('One source routing to 1 to 4 targets');

export {FanoutVisual as schema};
