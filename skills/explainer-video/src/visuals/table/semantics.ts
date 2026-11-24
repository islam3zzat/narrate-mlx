import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'table'> = (v) => fresh(v.rows.map((r) => r.join(' ')));
