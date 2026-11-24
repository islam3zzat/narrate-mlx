import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'bullets'> = {
  type: 'bullets',
  capabilities,
  docs: {
    fields: "`heading`, `items[]`",
    use: "lists; items appear as they are spoken (at most 6)",
  },
  lint: (v) => ({errors: [], warnings: v.items.length > 6 ? [`${v.items.length} items won't fit well; keep to 6 or fewer`] : []}),
};
