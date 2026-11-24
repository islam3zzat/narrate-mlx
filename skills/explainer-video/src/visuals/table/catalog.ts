import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'table'> = {
  type: 'table',
  title: 'Data Table',
  default: {
    id: 'default',
    label: '2D Table',
    narration: 'Dense seven-billion takes forty milliseconds, quantized runs in eighteen, and routed sparse finishes in eleven.',
    visual: {
      type: 'table',
      heading: 'Serving Footprint Summary',
      headers: ['Variant', 'Memory', 'P95 Latency', 'Score'],
      rows: [
        ['Dense 7B', '14.2 GB', '40 ms', '79.4%'],
        ['Quantized 4-bit', '4.1 GB', '18 ms', '78.1%'],
        ['Routed Sparse', '4.3 GB', '11 ms', '82.6%'],
      ],
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Table',
      mode: '3d',
      narration: 'CPU baseline trails GPU throughput.',
      visual: {
        type: 'table',
        heading: 'Hardware Tiers',
        headers: ['Target', 'Tokens/sec'],
        rows: [
          ['CPU', '18'],
          ['GPU', '240'],
        ],
      },
    },
  ],
};
