import {carriedLeading, sameType} from '../../semantics/carry';
import type {Semantics, SpeakerRefs} from '../../semantics/types';
// Slots in reveal order: the question, then each entry's text. Only the whiteboard layout continues a stance map
// (capabilities.boardContinues): the leading question and entries shared with the previous scene (same speaker, kind, ref and text)
// stay drawn, in place.
type V = {question: string; entries: {by: string; text: string; kind: string; ref?: number}[]};
const keysOf = (v: V) => [v.question, ...v.entries.map((e) => [e.by, e.kind, e.ref ?? '', e.text].join('\u0000'))];
export const describe: Semantics<'stance'> = (v, prev) => {
  const p = sameType(v, prev);
  return {slots: [v.question, ...v.entries.map((e) => e.text)], carried: carriedLeading(p && keysOf(p), keysOf(v))};
};
export const speakerRefs: SpeakerRefs<'stance'> = (v) => v.entries.map((e) => e.by);
