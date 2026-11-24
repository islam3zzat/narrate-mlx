import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'flow'> = {
  type: 'flow',
  title: 'Linear Flow',
  default: {
    id: 'default',
    label: '2D Chain',
    narration: 'Requests arrive at the client, validate at the gateway, route through workers, and settle in storage.',
    visual: {
      type: 'flow',
      heading: 'Request Lifecycle',
      nodes: [
        {label: 'Client', sub: 'HTTPS request'},
        {label: 'Gateway', sub: 'Auth + rate limit'},
        {label: 'Workers', sub: 'Stateless compute'},
        {label: 'Storage', sub: 'Durable commit'},
      ],
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Flow',
      mode: '3d',
      narration: 'Source bytes tokenize cleanly, batch statically, then stream decoded tokens.',
      visual: {
        type: 'flow',
        heading: 'Inference Chain',
        nodes: [
          {label: 'Tokenizer'},
          {label: 'Batcher'},
          {label: 'Streamer'},
        ],
      },
    },
  ],
};
