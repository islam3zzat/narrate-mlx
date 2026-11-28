// Pure helpers for what a "continues" scene carries over (no React, remotion or three imports: semantics/ is read by
// cli.ts under plain node). continuity.ts re-exports these for the renderer.
import type {Visual} from '../types';

/** `at` of a carried part: long before frame 0, so it is fully shown from the first frame. */
export const CARRIED = -1000;

/** The previous scene's visual, when it is the same type as this one (only then is there anything to carry). */
export const sameType = <V extends Visual>(v: V, prev?: Visual): V | undefined => (prev && prev.type === v.type ? (prev as V) : undefined);

/** Ids present in both: the parts that carry over (graph nodes, classes, sequence participants). */
export const carriedIds = (prevIds: string[] | undefined) => new Set(prevIds ?? []);

/** Sequence messages carry over as the longest common prefix (same sender, receiver and label). */
export const carriedPrefix = (prev: {from: string; to: string; label: string}[] | undefined, cur: {from: string; to: string; label: string}[]) => {
  if (!prev) return 0;
  let k = 0;
  while (k < prev.length && k < cur.length && prev[k].from === cur[k].from && prev[k].to === cur[k].to && prev[k].label === cur[k].label) k++;
  return k;
};

/** List-like slots (bullets, steps, flow nodes) carry over as the longest common leading run of identical texts: the first k slots are the previous scene's, unchanged and in place. */
export const carriedLeading = (prev: string[] | undefined, cur: string[]): boolean[] => {
  let k = 0;
  while (prev && k < prev.length && k < cur.length && prev[k] === cur[k]) k++;
  return cur.map((_, i) => i < k);
};

/** Text of a title and its optional sub line, joined the way the narration cues are matched. */
export const join = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ');
