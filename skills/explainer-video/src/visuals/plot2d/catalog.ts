import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'plot2d'> = {
  type: 'plot2d',
  title: '2D Calculus & Curve Plot',
  default: {
    id: 'default',
    label: 'Secant to Tangent + Riemann',
    narration: 'On our parabola curve, a secant line converges toward the tangent slope, while Riemann slices accumulate the signed area underneath.',
    visual: {
      type: 'plot2d',
      heading: 'Slope and Signed Area on x² / 4',
      xDomain: [-3, 4],
      yDomain: [-1, 5],
      xLabel: 'x',
      yLabel: 'f(x)',
      curves: [
        {id: 'parabola', label: 'Parabola x squared over 4', expr: '0.25 * x^2', tone: 'secondary'},
      ],
      stages: [
        {kind: 'secant', label: 'Secant converges to tangent', x: 2, dx: 1.5, toDx: 0, zoom: 1.6},
        {kind: 'riemann', label: 'Riemann slices accumulate', range: [0, 3], slices: 6, toSlices: 24, method: 'midpoint'},
      ],
      caption: 'Derivatives zoom into local linearity; integrals sum signed slices.',
    },
  },
};
