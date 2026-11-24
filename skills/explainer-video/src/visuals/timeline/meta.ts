import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {lintOrderedSlots} from '../meta-lint';
import {TIMELINE_LIMITS} from './schema';

/** Minutes since midnight when `at` starts with HH:MM (a trailing zone or text is fine), else null. */
export const clock = (at: string): number | null => {
  const m = /^\s*(\d{1,2}):(\d{2})(?!\d)/.exec(at);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
};

export const meta: Meta<'timeline'> = {
  type: 'timeline',
  capabilities,
  docs: {
    fields: "`heading`, `events[{id?, at, label, detail?, status?, marker?}]` (2 to 10), `caption?`",
    use: "a chronological sequence of dated events (an incident timeline, a history): a rail with each event's time, label and an optional status tag and milestone badge; up to 5 events sit on a horizontal rail, more on a vertical one",
    rules: [
      "`at` is shown exactly as written (\"14:02 UTC\"); never reformat or translate it. Events are listed in time order and appear when their `label` is spoken, so say a word of each label in the narration, in the same order. Times are not matched to the narration (the voice reads them differently).",
      "`status` (`confirmed`, `reported`, `unknown`) is drawn as a text tag, never colour alone; set it only where certainty differs between events. `marker` (`detected`, `mitigated`, `resolved`, `impact`) badges a milestone. `id` is optional and only needed for `focus` (ids of events, 2D only; the others dim). `continues` and 3D are not supported.",
    ],
  },
  lint: (v, ctx) => {
    const slots = v.events.map((e, i) => ({what: `event ${i + 1}`, label: e.label}));
    const warnings = lintOrderedSlots(ctx.narration, slots, {
      missed: (what, label) => `timeline ${what}: its label "${label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`,
      late: (what, label, prevLabel) => `timeline ${what} "${label}" is listed after "${prevLabel}" but is spoken first, so it will appear late; list the events in the order the narration names them`,
    });
    const times = v.events.map((e) => clock(e.at));
    if (times.every((t) => t !== null)) {
      for (let i = 1; i < times.length; i++) {
        // a drop of 12 h or more is read as a day boundary, not as disorder
        if (times[i]! < times[i - 1]! && times[i - 1]! - times[i]! < 12 * 60) {
          warnings.push(`timeline events are not in time order: "${v.events[i].at}" comes after "${v.events[i - 1].at}"; list them chronologically`);
          break;
        }
      }
    }
    if (v.events.length > TIMELINE_LIMITS.rail + 3 && v.events.some((e) => e.detail)) {
      warnings.push(`timeline with ${v.events.length} events: details are one line each and are cut when long; keep details short or use fewer events`);
    }
    return {errors: [], warnings};
  },
  focusTargets: (v) => ({ids: v.events.flatMap((e) => (e.id ? [e.id] : []))}),
};
