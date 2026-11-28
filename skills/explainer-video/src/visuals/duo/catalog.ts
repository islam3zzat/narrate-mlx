import type {CatalogEntry} from '../catalog-types';

const speakers = {a: {name: 'Dana', role: 'Principal Security Engineer'}, b: {name: 'Omar', role: 'Principal Architect'}};

export const catalog: CatalogEntry<'duo'> = {
  type: 'duo',
  title: 'Duo (two speakers)',
  default: {
    id: 'default',
    label: 'Question and quote',
    narration: 'Should we put the login service in front of every request? I say yes, because one missed check is a breach.',
    speakers,
    speaker: 'a',
    visual: {
      type: 'duo',
      question: 'Should we gate every request?',
      quote: 'One missed check is a breach.',
    },
  },
  variants: [
    {
      id: 'slides',
      label: 'Slides layout (cel-sky)',
      theme: 'cel-sky',
      narration: 'Should we put the login service in front of every request? I say yes, because one missed check is a breach.',
      speakers,
      speaker: 'a',
      visual: {type: 'duo', question: 'Should we gate every request?', quote: 'One missed check is a breach.'},
    },
    {
      id: 'reply',
      label: 'Other speaker, no quote',
      narration: 'Hold on. Every request means one more network hop, and our budget is two hundred milliseconds in total.',
      speakers,
      speaker: 'b',
      visual: {type: 'duo', question: 'Where does the time budget go?'},
    },
  ],
};
