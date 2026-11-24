import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'fanout'> = {
  type: 'fanout',
  capabilities,
  docs: {
    fields: "`heading`, `source{label}`, `targets[{label, sub}]`",
    use: "one thing routing to 1 to 4 targets",
  },
  lint: () => ({errors: [], warnings: []}),
};
