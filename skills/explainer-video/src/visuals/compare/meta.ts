import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'compare'> = {
  type: 'compare',
  capabilities,
  docs: {
    fields: "`heading`, `columns[{title, tag, items[]}]`",
    use: "2 to 4 side-by-side options",
  },
  lint: () => ({errors: [], warnings: []}),
};
