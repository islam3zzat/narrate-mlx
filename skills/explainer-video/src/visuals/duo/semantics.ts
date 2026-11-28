import {fresh, type Semantics} from '../../semantics/types';
// Slots in reveal order: the question, then the quote when there is one. A duo is never continued.
export const describe: Semantics<'duo'> = (v) => fresh(v.quote ? [v.question, v.quote] : [v.question]);
