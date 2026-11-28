import {carriedLeading, join, sameType} from '../../semantics/carry';
import type {Semantics} from '../../semantics/types';
// Only the whiteboard layout continues a flow (capabilities.boardContinues): the leading nodes shared with the previous scene stay drawn.
const slotsOf = (v: {nodes: {label: string; sub?: string}[]}) => v.nodes.map((n) => join(n.label, n.sub));
export const describe: Semantics<'flow'> = (v, prev) => {
  const slots = slotsOf(v), p = sameType(v, prev);
  return {slots, carried: carriedLeading(p && slotsOf(p), slots)};
};
