import {carriedIds, join, sameType} from '../../semantics/carry';
import type {Semantics} from '../../semantics/types';
// Carried nodes (same id as in the previous scene's graph) are on screen from the start. Mirrors continuity use in graph/View2D.tsx (GraphView).
export const describe: Semantics<'graph'> = (v, prev) => {
  const p = sameType(v, prev);
  const ids = carriedIds(p?.nodes.map((n) => n.id));
  return {slots: v.nodes.map((n) => join(n.label, n.sub)), carried: v.nodes.map((n) => !!p && ids.has(n.id))};
};
