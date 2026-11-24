import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'steps'> = {
  type: 'steps',
  capabilities,
  docs: {
    fields: "`heading`, `active?`, `items[]`",
    use: "a sequence. One scene narrating several steps: **omit `active`** and the highlight advances with the narration (step i lights up when it is spoken, earlier ones turn into checkmarks). One scene per step: same `items`, fixed `active` = 0, 1, 2... Never fix `active` in a scene that narrates more than one step: the slide would show a later step highlighted from the first word",
  },
  lint: (v) => ({errors: [], warnings: v.items.length > 6 ? [`${v.items.length} items won't fit well; keep to 6 or fewer`] : []}),
};
