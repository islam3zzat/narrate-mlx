import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'sequence'> = {
  type: 'sequence',
  capabilities,
  docs: {
    fields: "`heading`, `participants[{id, label, sub?, tone?}]`, `messages[{from, to, label, reply?, tone?}]`, `animate?`, `caption?`",
    use: "who sends what to whom, in order: protocol exchanges, request/response, auth flows (2 to 5 participants, up to 10 messages)",
    rules: [
      "List `messages` in time order (they appear in that order over the narration); a `from` equal to `to` is a self-call (use it for \"server stores the challenge\"); `reply: true` draws a dashed response; keep labels to 40 characters or fewer; 7 or 8 messages is the comfortable maximum on screen, so split long exchanges across two scenes (\"leg one\", \"leg two\").",
    ],
  },
  lint: () => ({errors: [], warnings: []}),
  focusTargets: (v) => ({ids: v.participants.map((p) => p.id), links: v.messages.map((m) => [m.from, m.to])}),
};
