import {carriedLeading, sameType} from '../../semantics/carry';
import type {Semantics, SpeakerRefs} from '../../semantics/types';
// Slots are the note texts, in reveal order. Only the whiteboard layout continues a list (capabilities.boardContinues): the leading notes
// shared with the previous scene (same text and same speaker) stay drawn, in place.
type Item = {text: string; by?: string};
const keyOf = (items: Item[]) => items.map((i) => `${i.by ?? ''}\u0000${i.text}`);
export const describe: Semantics<'notes'> = (v, prev) => {
  const p = sameType(v, prev);
  return {slots: v.items.map((i) => i.text), carried: carriedLeading(p && keyOf(p.items), keyOf(v.items))};
};
export const speakerRefs: SpeakerRefs<'notes'> = (v) => v.items.flatMap((i) => (i.by ? [i.by] : []));
