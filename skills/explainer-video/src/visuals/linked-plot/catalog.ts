import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'linked-plot'> = {
  type: 'linked-plot',
  title: 'Linked Dual Calculus Plot',
  default: {
    id: 'default',
    label: 'Distance & Velocity Bridge',
    narration: 'At the inflection slope in phase one, the rate panel hits zero, and later accumulated area matches total distance gained.',
    visual: {
      type: 'linked-plot',
      heading: 'Slope Here Equals Height Below',
      xDomain: [0, 4],
      xLabel: 'Time (s)',
      top: {label: 'Position x(t)', yDomain: [-1, 10], expr: '0.25 * x^3 - 0.5 * x^2 + 2', tone: 'secondary'},
      bottom: {label: 'Velocity v(t)', yDomain: [-2, 10], tone: 'accent'},
      stages: [
        {id: 'p1', label: 'Inflection slope zero', x: 1.33, show: 'both', note: 'Peak slope = zero curve value'},
        {id: 'p2', label: 'Accumulated area distance', x: 3.5, show: 'area', note: 'Shaded area matches net rise'},
      ],
      caption: 'Top tangent slope stays numerically equal to bottom curve height.',
    },
  },
};
