import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'matrix'> = {
  type: 'matrix',
  title: 'Matrix & Heatmap Grid',
  default: {
    id: 'default',
    label: 'Attention Weights Grid',
    narration: 'In self-attention, the pronoun attends strongly to its own position while linking backward to its verb.',
    focus: [{atFrac: 0.5, on: ['own']}],
    visual: {
      type: 'matrix',
      heading: 'Self-Attention Weight Grid',
      rowLabel: 'Query Token',
      colLabel: 'Key Token',
      rows: ['The', 'robot', 'picked', 'it'],
      cols: ['The', 'robot', 'picked', 'it'],
      values: [
        [0.82, 0.11, 0.05, 0.02],
        [0.14, 0.71, 0.10, 0.05],
        [0.06, 0.34, 0.52, 0.08],
        [0.04, 0.29, 0.12, 0.55],
      ],
      highlights: [
        {id: 'own', label: 'Own position', kind: 'cell', row: 3, col: 3, tone: 'primary'},
      ],
    },
  },
};
