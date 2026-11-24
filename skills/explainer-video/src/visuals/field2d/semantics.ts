import {fresh, type Semantics} from '../../semantics/types';

// Overlays reveal in order as their labels are spoken.
export const describe: Semantics<'field2d'> = (v) => fresh((v.overlays ?? []).map((o) => o.label));
