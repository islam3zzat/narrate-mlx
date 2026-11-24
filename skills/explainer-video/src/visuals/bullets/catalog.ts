import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'bullets'> = {
  type: 'bullets',
  title: 'Bullets List',
  default: {
    id: 'default',
    label: '2D Cel-Sky',
    narration: 'First, fixed budgets make inference predictable. Second, per-token gating skips easy filler words. Third, residual highways keep gradients clean.',
    visual: {
      type: 'bullets',
      heading: 'Why Dynamic Routing Wins',
      items: [
        'Predictable compute budgets per step',
        'Per-token gating skips trivial tokens',
        'Residual highways preserve gradient flow',
      ],
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Mode',
      mode: '3d',
      narration: 'Latency stays flat, throughput doubles, and quality matches dense training.',
      visual: {
        type: 'bullets',
        heading: 'Measured Production Impact',
        items: [
          'Flat tail latency under load',
          'Twice the token throughput',
          'Dense parity on reasoning tasks',
        ],
      },
    },
  ],
};
