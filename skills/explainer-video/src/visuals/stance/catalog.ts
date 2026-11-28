import type {CatalogEntry} from '../catalog-types';

const speakers = {a: {name: 'Dana', role: 'Principal Security Engineer'}, b: {name: 'Omar', role: 'Principal Architect'}};
const question = 'Should the login service sit in front of every request?';
const open = [
  {by: 'a', text: 'Yes, one missed check is a breach', kind: 'claim'},
  {by: 'b', text: 'Another hop blows the 200 ms budget', kind: 'disagree', ref: 0},
] as const;
const settled = [
  ...open,
  {by: 'a', text: 'Verify signed tokens at the edge', kind: 'claim'},
  {by: 'b', text: 'Fine, if tokens stay short-lived', kind: 'resolve', ref: 1},
] as const;

export const catalog: CatalogEntry<'stance'> = {
  type: 'stance',
  title: 'Stance (positions of two speakers)',
  default: {
    id: 'default',
    label: 'A disagreement, settled',
    narration: 'Yes, one missed check is a breach. But another hop blows the budget. So verify signed tokens at the edge. Fine, if tokens stay short-lived.',
    speakers,
    speaker: 'b',
    visual: {type: 'stance', question, entries: [...settled]},
  },
  variants: [
    {
      id: 'slides',
      label: 'Slides layout (cel-sky)',
      theme: 'cel-sky',
      narration: 'Yes, one missed check is a breach. But another hop blows the budget. So verify signed tokens at the edge. Fine, if tokens stay short-lived.',
      speakers,
      speaker: 'b',
      visual: {type: 'stance', question, entries: [...settled]},
    },
    {
      id: 'opening',
      label: 'The opening of the disagreement',
      narration: 'Yes, one missed check is a breach. But another hop blows the budget.',
      speakers,
      speaker: 'a',
      visual: {type: 'stance', question, entries: [...open]},
    },
    {
      id: 'continued',
      label: 'Continues the opening',
      narration: 'So verify signed tokens at the edge. Fine, if tokens stay short-lived.',
      speakers,
      speaker: 'b',
      prev: {type: 'stance', question, entries: [...open]},
      visual: {type: 'stance', question, entries: [...settled]},
    },
  ],
};
