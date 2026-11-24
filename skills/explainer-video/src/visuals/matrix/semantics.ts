import {fresh, type Semantics} from '../../semantics/types';

// Highlights drive reveals when provided; otherwise rows reveal top-to-bottom as mentioned in narration.
export const describe: Semantics<'matrix'> = (v) =>
  fresh(v.highlights?.length ? v.highlights.map((h) => h.label) : v.rows);
