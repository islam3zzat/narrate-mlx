import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'bullets'> = (v) => fresh([...v.items]);
