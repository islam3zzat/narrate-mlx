import {fresh, type Semantics} from '../../semantics/types';
export const describe: Semantics<'fanout'> = (v) => fresh(v.targets.map((x) => `${x.label} ${x.sub}`));
