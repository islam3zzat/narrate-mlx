import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'fanout'> = {
  type: 'fanout',
  title: 'Fanout Router',
  default: {
    id: 'default',
    label: '2D Fanout',
    narration: 'The event dispatcher fans incoming updates into metrics telemetry, search indexing, and cold backups.',
    visual: {
      type: 'fanout',
      heading: 'Parallel Downstream Fanout',
      source: {label: 'Event Dispatcher'},
      targets: [
        {label: 'Metrics Telemetry', sub: 'Real-time counters'},
        {label: 'Search Indexing', sub: 'Inverted vectors'},
        {label: 'Cold Backups', sub: 'Immutable ledger'},
      ],
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Fanout',
      mode: '3d',
      narration: 'Our router dispatches requests to coding experts and logic experts.',
      visual: {
        type: 'fanout',
        heading: 'Expert Dispatch',
        source: {label: 'Router'},
        targets: [
          {label: 'Coding', sub: 'Syntax specialist'},
          {label: 'Logic', sub: 'Reasoning specialist'},
        ],
      },
    },
  ],
};
