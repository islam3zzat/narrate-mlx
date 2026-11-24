import {fresh, type Semantics} from '../../semantics/types';
// One reveal slot per stat, in the order listed: the stat appears (and starts counting) when its label is spoken.
export const describe: Semantics<'stat'> = (v) => fresh(v.stats.map((s) => s.label));
