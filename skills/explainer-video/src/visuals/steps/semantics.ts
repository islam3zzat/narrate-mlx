import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'steps'> = (v) => fresh([...v.items]);
