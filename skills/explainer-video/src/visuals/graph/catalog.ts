import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'graph'> = {
  type: 'graph',
  title: 'Node-Edge Graph',
  default: {
    id: 'default',
    label: '2D Directed DAG + Focus',
    narration: 'Tokens enter the embedder, hit the router gate, split to attention or shortcut residual, and merge cleanly.',
    focus: [
      {atFrac: 0.25, on: ['gate']},
      {atFrac: 0.65, on: ['attn', 'merge']},
    ],
    visual: {
      type: 'graph',
      heading: 'Dynamic Routing DAG',
      direction: 'LR',
      nodes: [
        {id: 'emb', label: 'Embedder', sub: 'd = 4096'},
        {id: 'gate', label: 'Router Gate', sub: 'Top-K', tone: 'primary'},
        {id: 'attn', label: 'Full Attention', sub: 'Heavy path', tone: 'secondary'},
        {id: 'res', label: 'Skip Shortcut', sub: 'Zero compute', tone: 'accent'},
        {id: 'merge', label: 'Residual Merge', sub: 'Output'},
      ],
      edges: [
        {from: 'emb', to: 'gate', label: 'x'},
        {from: 'gate', to: 'attn', label: 'top-k', tone: 'secondary'},
        {from: 'gate', to: 'res', label: 'skip', dashed: true, tone: 'accent'},
        {from: 'attn', to: 'merge'},
        {from: 'res', to: 'merge'},
      ],
      animate: true,
      caption: 'Only selected tokens traverse the heavy attention branch.',
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Terraced Graph',
      mode: '3d',
      narration: 'Signals enter the encoder, branch into attention and skip, and converge at output.',
      visual: {
        type: 'graph',
        heading: '3D Computation Terraces',
        direction: 'TB',
        nodes: [
          {id: 'in', label: 'Input'},
          {id: 'att', label: 'Attention', tone: 'primary'},
          {id: 'skip', label: 'Bypass', tone: 'accent'},
          {id: 'out', label: 'Output'},
        ],
        edges: [
          {from: 'in', to: 'att'},
          {from: 'in', to: 'skip'},
          {from: 'att', to: 'out'},
          {from: 'skip', to: 'out'},
        ],
        animate: true,
      },
    },
  ],
};
