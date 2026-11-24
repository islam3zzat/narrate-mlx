import {fresh, type Semantics} from '../../semantics/types';

// Equation terms spotlight in listed order as the narration explains each component.
export const describe: Semantics<'equation'> = (v) => fresh(v.terms.map((t) => t.label));
