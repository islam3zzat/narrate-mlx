import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'callout'> = {
  type: 'callout',
  title: 'Callout Card',
  default: {
    id: 'default',
    label: 'Key Insight',
    narration: 'Only twelve percent of tokens require full quadratic attention.',
    visual: {
      type: 'callout',
      heading: 'Core Takeaway',
      big: '88% of tokens skip heavy attention',
      text: 'Simple function words follow cheap linear residual shortcuts without losing coherence.',
    },
  },
  variants: [
    {
      id: 'warn',
      label: 'Warning Tone',
      narration: 'Never trust uncalibrated confidence weights under distribution shift.',
      visual: {
        type: 'callout',
        heading: 'Failure Mode',
        big: 'Router collapse silences rare experts',
        text: 'Auxiliary load-balancing losses prevent every token from crowding onto a single path.',
        tone: 'warn',
      },
    },
    {
      id: '3d',
      label: '3D Plinth',
      mode: '3d',
      narration: 'Constant memory keeps generation speed steady on arbitrarily long documents.',
      visual: {
        type: 'callout',
        heading: 'Invariant',
        big: 'O(1) State Per Step',
        text: 'Bounded state lets streaming decoding sustain throughput over million-token streams.',
      },
    },
  ],
};
