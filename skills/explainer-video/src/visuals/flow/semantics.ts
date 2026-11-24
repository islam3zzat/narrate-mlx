import {join} from '../../semantics/carry';
import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'flow'> = (v) => fresh(v.nodes.map((n) => join(n.label, n.sub)));
