import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'compare'> = (v) => fresh(v.columns.map((c) => [c.title, c.tag, ...c.items].join(' ')));
