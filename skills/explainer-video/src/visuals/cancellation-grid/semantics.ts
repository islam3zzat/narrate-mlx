import {fresh, type Semantics} from '../../semantics/types';

// Each stage advances the cancellation phase when its label is spoken.
export const describe: Semantics<'cancellation-grid'> = (v) => fresh(v.stages.map((s) => s.label));
