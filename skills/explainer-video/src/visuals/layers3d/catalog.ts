import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'layers3d'> = {
  type: 'layers3d',
  title: 'Stacked 3D Layers',
  default: {
    id: 'default',
    label: '3D Protocol Stack',
    mode: '3d',
    narration: 'Starting from physical sockets at the bottom, bytes climb through transport frames, JSON envelopes, and application handlers.',
    focus: [
      {atFrac: 0.35, on: ['trans']},
      {atFrac: 0.72, on: ['app']},
    ],
    visual: {
      type: 'layers3d',
      heading: 'Service Stack Architecture',
      layers: [
        {id: 'sock', label: 'TCP Sockets', sub: 'Kernel I/O'},
        {id: 'trans', label: 'TLS Transport', sub: 'Encrypted stream', tone: 'accent'},
        {id: 'json', label: 'RPC Envelope', sub: 'Schema validation', tone: 'primary'},
        {id: 'app', label: 'Application Logic', sub: 'Domain handlers', tone: 'secondary'},
      ],
      caption: 'Each upper slab builds strictly atop guarantees below.',
    },
  },
};
