import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'title'> = {
  type: 'title',
  title: 'Title Card',
  default: {
    id: 'default',
    label: 'Default (cel-sky)',
    narration: 'Sparse routing cuts compute cost without hurting accuracy.',
    visual: {
      type: 'title',
      kicker: 'ARCHITECTURE WALKTHROUGH',
      headline: 'Mixture of Depths',
      sub: 'Allocating compute dynamically per token',
    },
  },
  variants: [
    {
      id: 'paper',
      label: 'Paper Theme',
      theme: 'paper',
      narration: 'Sparse routing cuts compute cost without hurting accuracy.',
      visual: {
        type: 'title',
        kicker: 'RESEARCH BRIEF',
        headline: 'Adaptive Compute',
        sub: 'Routing tokens past redundant transformer layers',
      },
    },
  ],
};
