import {join} from '../../semantics/carry';
import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'layers3d'> = (v) => fresh(v.layers.map((l) => join(l.label, l.sub)));
