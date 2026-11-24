import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'compare'> = {
  type: 'compare',
  title: 'Side-by-Side Compare',
  default: {
    id: 'default',
    label: '2D Comparison',
    narration: 'Dense layers run every token uniformly, whereas sparse routing prioritizes hard tokens cleanly.',
    visual: {
      type: 'compare',
      heading: 'Dense vs Sparse Computation',
      columns: [
        {title: 'Dense Block', tag: 'Fixed Flops', items: ['Processes every token', 'Equal depth per word', 'Scales quadratically']},
        {title: 'Routed Block', tag: 'Adaptive', items: ['Selects top-k tokens', 'Skips redundant updates', 'Faster wall-clock inference']},
      ],
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Columns',
      mode: '3d',
      narration: 'Caching stores key values locally while stateless decoding recomputes them every pass.',
      visual: {
        type: 'compare',
        heading: 'Decoding Trade-offs',
        columns: [
          {title: 'KV Cache', tag: 'Memory Bound', items: ['Reuses past projections', 'Linear token cost']},
          {title: 'Recompute', tag: 'Compute Bound', items: ['Zero extra RAM', 'Quadratic per step']},
        ],
      },
    },
  ],
};
