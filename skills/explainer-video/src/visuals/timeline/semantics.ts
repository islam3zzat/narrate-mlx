import {fresh, type Semantics} from '../../semantics/types';
// One reveal slot per event, in the order listed: the event appears when its label is spoken.
export const describe: Semantics<'timeline'> = (v) => fresh(v.events.map((e) => e.label));
