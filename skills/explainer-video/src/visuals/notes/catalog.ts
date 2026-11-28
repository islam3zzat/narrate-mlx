import type {CatalogEntry} from '../catalog-types';

const speakers = {a: {name: 'Dana', role: 'Principal Security Engineer'}, b: {name: 'Omar', role: 'Principal Architect'}};
const first = [
  {text: 'Verify tokens at the edge', by: 'a'},
  {text: 'Keep tokens short-lived', by: 'b'},
];

export const catalog: CatalogEntry<'notes'> = {
  type: 'notes',
  title: 'Notes (takeaways)',
  default: {
    id: 'default',
    label: 'Takeaways with speakers',
    narration: 'Remember three things. Verify tokens at the edge, keep tokens short-lived, and check every write in full.',
    speakers,
    speaker: 'a',
    visual: {type: 'notes', heading: 'Takeaways', items: [...first, {text: 'Check every write in full', by: 'a'}]},
  },
  variants: [
    {
      id: 'slides',
      label: 'Slides layout (cel-sky)',
      theme: 'cel-sky',
      narration: 'Remember three things. Verify tokens at the edge, keep tokens short-lived, and check every write in full.',
      speakers,
      speaker: 'a',
      visual: {type: 'notes', heading: 'Takeaways', items: [...first, {text: 'Check every write in full', by: 'a'}]},
    },
    {
      id: 'continued',
      label: 'Continues the three takeaways',
      narration: 'And one more, which both of us agree on. Measure the added latency, so the next review has numbers.',
      speakers,
      speaker: 'b',
      prev: {type: 'notes', heading: 'Takeaways', items: [...first, {text: 'Check every write in full', by: 'a'}]},
      visual: {type: 'notes', heading: 'Takeaways', items: [...first, {text: 'Check every write in full', by: 'a'}, {text: 'Measure the added latency'}]},
    },
  ],
};
