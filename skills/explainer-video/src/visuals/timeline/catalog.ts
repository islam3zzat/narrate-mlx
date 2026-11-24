import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'timeline'> = {
  type: 'timeline',
  title: 'Timeline Rail',
  default: {
    id: 'default',
    label: '2D Horizontal Rail',
    narration: 'Alerts triggered at ten oh two, engineers mitigated the spike at ten eighteen, and traffic recovered by ten forty.',
    focus: [{atFrac: 0.45, on: ['mit']}],
    visual: {
      type: 'timeline',
      heading: 'Incident Response Timeline',
      events: [
        {id: 'det', at: '10:02 UTC', label: 'Alerts triggered', detail: 'Error rate exceeded 2%', status: 'confirmed', marker: 'detected'},
        {id: 'mit', at: '10:18 UTC', label: 'Engineers mitigated', detail: 'Rolled back router config', status: 'confirmed', marker: 'mitigated'},
        {id: 'res', at: '10:40 UTC', label: 'Traffic recovered', detail: 'Latency back inside SLO', status: 'confirmed', marker: 'resolved'},
      ],
      caption: 'Timestamps reflect UTC production telemetry logs.',
    },
  },
};
