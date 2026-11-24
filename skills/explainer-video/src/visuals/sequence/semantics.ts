import {carriedPrefix, sameType} from '../../semantics/carry';
import type {Semantics} from '../../semantics/types';
export const describe: Semantics<'sequence'> = (v, prev) => {
  const p = sameType(v, prev);
  const k = carriedPrefix(p?.messages, v.messages);
  return {slots: v.messages.map((m) => m.label), carried: v.messages.map((_, i) => i < k)};
};
