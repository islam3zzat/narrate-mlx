import {fresh, type Semantics} from '../../semantics/types';

// Callout regions drive narration reveals sequentially when present; otherwise `alt` serves as a single reveal slot.
export const describe: Semantics<'figure'> = (v) =>
  fresh(v.regions?.length ? v.regions.map((r) => r.label) : [v.alt]);
