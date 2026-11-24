import {fresh, type Semantics} from '../../semantics/types';

// Each stage moves the synchronized cursor when its label is spoken.
export const describe: Semantics<'linked-plot'> = (v) => fresh(v.stages.map((s) => s.label));
