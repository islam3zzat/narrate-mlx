import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'layers3d'> = {
  type: 'layers3d',
  capabilities,
  docs: {
    fields: "`heading`, `layers[{id, label, sub?, tone?}]` bottom to top, 2 to 6, `caption?`",
    use: "a stack of layers (an architecture, a protocol stack); 3D only: `check` rejects it without `\"mode\": \"3d\"`",
  },
  lint: () => ({errors: [], warnings: []}),
};
