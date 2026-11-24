import {z} from 'zod';
import {text, ID} from '../common';

export const TIMELINE_STATUSES = ['confirmed', 'reported', 'unknown'] as const;
export const TIMELINE_MARKERS = ['detected', 'mitigated', 'resolved', 'impact', 'none'] as const;
export const TIMELINE_LIMITS = {min: 2, max: 10, rail: 5} as const;

export const TimelineEvent = z.strictObject({
  id: ID.optional().describe('Optional id, only so a scene `focus` can name this event; unique within the timeline'),
  at: text('When it happened, exactly as written in the source (e.g. "14:02 UTC", "Day 3"); shown as is, never reformatted'),
  label: text('What happened, in words the narration says: the event appears when they are spoken'),
  detail: z.string().trim().min(1).optional().describe('A line of extra context under the label'),
  status: z.enum(TIMELINE_STATUSES).optional().describe('How sure the source is: "confirmed", "reported" (second-hand) or "unknown". Shown as a text tag; omit when it does not matter'),
  marker: z.enum(TIMELINE_MARKERS).optional().describe('A milestone badge: "detected", "mitigated", "resolved" or "impact"; "none" or omitted for a plain event'),
});

export const TimelineVisual = z.strictObject({
  type: z.literal('timeline'),
  heading: text('Scene heading'),
  events: z.array(TimelineEvent).min(TIMELINE_LIMITS.min).max(TIMELINE_LIMITS.max).describe('Events in time order, each appearing when its label is spoken; up to 5 are laid out on a horizontal rail, more on a vertical one'),
  caption: z.string().optional().describe('Line under the timeline'),
}).describe('A chronological sequence of dated events (incident timelines, histories); 2D only').superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.events.forEach((e, i) => {
    if (!e.id) return;
    if (seen.has(e.id)) ctx.addIssue({code: 'custom', path: ['events', i, 'id'], message: `duplicate event id "${e.id}"`});
    seen.add(e.id);
  });
});
