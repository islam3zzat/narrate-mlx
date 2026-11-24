import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'flow'> = {
  type: 'flow',
  capabilities,
  docs: {
    fields: "`heading`, `nodes[{label, sub?}]`",
    use: "2 to 5 boxes with arrows",
  },
  lint: () => ({errors: [], warnings: []}),
};
