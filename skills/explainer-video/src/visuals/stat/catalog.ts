import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'stat'> = {
  type: 'stat',
  title: 'Headline Stat Counters',
  default: {
    id: 'default',
    label: 'Before / After Bars',
    narration: 'Tail latency dropped from forty-eight milliseconds down to nineteen milliseconds, while reasoning accuracy climbed to eighty-four percent.',
    focus: [{atFrac: 0.35, on: ['lat']}, {atFrac: 0.72, on: ['acc']}],
    visual: {
      type: 'stat',
      heading: 'Measured Efficiency Gains',
      stats: [
        {id: 'lat', label: 'Tail latency', from: 48, value: 19, unit: 'ms', max: 60, better: 'down'},
        {id: 'acc', label: 'Reasoning accuracy', from: 74, value: 84, unit: '%', max: 100, better: 'up'},
      ],
      caption: 'Evaluated on identical H100 nodes with batch size 32.',
    },
  },
};
