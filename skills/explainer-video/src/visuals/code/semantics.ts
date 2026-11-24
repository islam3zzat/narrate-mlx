import {fresh, type Semantics} from '../../semantics/types';
// One reveal slot per highlight, in the order listed: the highlight moves there when its label is spoken.
export const describe: Semantics<'code'> = (v) => fresh(v.highlights.map((h) => h.label));
