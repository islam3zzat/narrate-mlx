import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'callout'> = {
  type: 'callout',
  capabilities,
  docs: {
    fields: "`heading`, `big`, `text`, `tone?: \"warn\"`",
    use: "one key message, a warning or an open question",
  },
  lint: () => ({errors: [], warnings: []}),
};
