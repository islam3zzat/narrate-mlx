import {z} from 'zod';
import {ID, text} from '../common';

export const STANCE_LIMITS = {question: 90, entry: 60, maxEntries: 8, perSpeaker: 4} as const;
export const STANCE_KINDS = ['claim', 'agree', 'disagree', 'resolve'] as const;

const StanceEntry = z.strictObject({
  by: ID.describe('Id of the speaker (a key of the script\'s `speakers`) who says it: it goes in that speaker\'s column'),
  text: text('What they say, in a few words').max(STANCE_LIMITS.entry),
  kind: z.enum(STANCE_KINDS).describe('"claim" a position, "agree" or "disagree" with another entry (set `ref`), "resolve" settles a disagreement (`ref` must be a "disagree" entry)'),
  ref: z.number().int().min(0).optional().describe('Zero-based index of an earlier entry this one answers'),
});

export const StanceVisual = z.strictObject({
  type: z.literal('stance'),
  question: text('The question being argued').max(STANCE_LIMITS.question),
  entries: z.array(StanceEntry).min(1).max(STANCE_LIMITS.maxEntries).describe('The positions in the order they are spoken, one column per speaker (at most 4 each)'),
}).describe('Who holds which position on a question, two columns by speaker, with the disagreements and their resolution (dialogue videos)').superRefine((v, ctx) => {
  const perSpeaker = new Map<string, number>();
  v.entries.forEach((e, i) => {
    const n = (perSpeaker.get(e.by) ?? 0) + 1;
    perSpeaker.set(e.by, n);
    if (n === STANCE_LIMITS.perSpeaker + 1) ctx.addIssue({code: 'custom', path: ['entries', i, 'by'], message: `speaker "${e.by}" has more than ${STANCE_LIMITS.perSpeaker} entries; a column holds ${STANCE_LIMITS.perSpeaker}`});
    if (e.ref !== undefined && e.ref >= i) ctx.addIssue({code: 'custom', path: ['entries', i, 'ref'], message: `ref ${e.ref} must be the index of an earlier entry (0..${Math.max(0, i - 1)})`});
    if (e.kind === 'resolve') {
      if (e.ref === undefined) ctx.addIssue({code: 'custom', path: ['entries', i, 'ref'], message: 'a "resolve" entry needs `ref`: the index of the "disagree" entry it settles'});
      else if (e.ref < i && v.entries[e.ref].kind !== 'disagree') ctx.addIssue({code: 'custom', path: ['entries', i, 'ref'], message: `a "resolve" entry must reference a "disagree" entry; entry ${e.ref} is a "${v.entries[e.ref].kind}"`});
    }
  });
});

export {StanceVisual as schema};
