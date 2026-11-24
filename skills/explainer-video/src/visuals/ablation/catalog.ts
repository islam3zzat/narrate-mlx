import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'ablation'> = {
  type: 'ablation',
  title: 'Ablation Waterfall',
  default: {
    id: 'default',
    label: 'Accuracy Contributions',
    narration: 'From our baseline model, rotary encoding adds four point eight, normalized gates add three point six, reaching our full system.',
    focus: [{atFrac: 0.5, on: ['rope']}],
    visual: {
      type: 'ablation',
      heading: 'Ablation Component Contributions',
      metric: 'Accuracy (%)',
      unit: '%',
      baseline: {id: 'base', label: 'Baseline', value: 64.0},
      steps: [
        {id: 'rope', label: 'Rotary encoding', delta: 4.8, note: 'Position'},
        {id: 'norm', label: 'Normalized gate', delta: 3.6, note: 'Stability'},
        {id: 'decay', label: 'Hard decay', delta: -0.9, note: 'Over-reg'},
      ],
      totalId: 'full',
      totalLabel: 'Full System',
    },
  },
};
