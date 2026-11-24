import {carriedIds, sameType} from '../../semantics/carry';
import type {Semantics} from '../../semantics/types';
export const describe: Semantics<'class'> = (v, prev) => {
  const p = sameType(v, prev);
  const ids = carriedIds(p?.classes.map((c) => c.id));
  return {slots: v.classes.map((c) => c.name), carried: v.classes.map((c) => !!p && ids.has(c.id))};
};
