import {z} from 'zod';
import {ID, text} from '../common';

export const NOTES_LIMITS = {heading: 60, item: 70, maxItems: 8} as const;

export const NotesVisual = z.strictObject({
  type: z.literal('notes'),
  heading: text('Scene heading, for example "Takeaways"').max(NOTES_LIMITS.heading),
  items: z.array(z.strictObject({
    text: text('One note').max(NOTES_LIMITS.item),
    by: ID.optional().describe('Id of the speaker (a key of the script\'s `speakers`) the note belongs to: a small avatar marks it. Omit for a note both agree on'),
  })).min(1).max(NOTES_LIMITS.maxItems).describe('Notes, revealed as they are spoken; 6 or fewer fit well'),
}).describe('Takeaways or notes of a dialogue, each optionally attributed to a speaker');

export {NotesVisual as schema};
