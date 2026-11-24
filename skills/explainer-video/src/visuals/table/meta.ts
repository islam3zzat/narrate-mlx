import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'table'> = {
  type: 'table',
  capabilities,
  docs: {
    fields: "`heading`, `headers[]`, `rows[[...]]`",
    use: "owners, tools, comparisons (rows match the headers)",
  },
  lint: () => ({errors: [], warnings: []}),
};
