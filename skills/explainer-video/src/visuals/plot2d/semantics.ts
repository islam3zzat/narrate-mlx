import {fresh, type Semantics} from '../../semantics/types';

// Stages drive reveals when present; otherwise curves reveal one by one as named in narration.
export const describe: Semantics<'plot2d'> = (v) =>
  fresh(v.stages?.length ? v.stages.map((s) => s.label) : v.curves.map((c) => c.label));
