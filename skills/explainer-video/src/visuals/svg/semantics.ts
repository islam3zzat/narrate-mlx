import {join} from '../../semantics/carry';
import {fresh, type Semantics} from '../../semantics/types';
// One reveal slot per part, in the order listed: the part appears when its label is spoken.
export const describe: Semantics<'svg'> = (v) => fresh(v.parts.map((p) => join(p.label)));
