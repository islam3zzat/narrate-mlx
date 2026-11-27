import {fresh, type Semantics} from '../../sdk/pure';

// Each step in `steps[]` reveals in narration order.
export const describe: Semantics<'array-algo'> = (v) => fresh(v.steps.map((s) => s.label));
