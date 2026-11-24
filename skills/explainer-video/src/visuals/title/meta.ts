import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'title'> = {
  type: 'title',
  capabilities,
  docs: {
    fields: "`kicker`, `headline`, `sub`",
    use: "opening scene (keep the headline under about 35 characters)",
  },
  lint: () => ({errors: [], warnings: []}),
};
