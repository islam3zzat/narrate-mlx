import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'surface3d'> = {
  type: 'surface3d',
  title: '3D Height Surface',
  default: {
    id: 'default',
    label: '3D Surface + Overlays',
    mode: '3d',
    narration: 'Cutting along slice x isolates the partial curve, the tangent plane hugs local slope, and integral columns stack volume beneath.',
    visual: {
      type: 'surface3d',
      heading: 'Multivariable Surface z = cos(x) cos(y)',
      xDomain: [-2, 2],
      yDomain: [-2, 2],
      expr: 'cos(x) * cos(y)',
      overlays: [
        {kind: 'slice', label: 'Slice x curve', axis: 'x', at: 0},
        {kind: 'tangent', label: 'Tangent plane', at: [0.6, 0.5]},
        {kind: 'columns', label: 'Integral columns', nx: 5, ny: 5},
      ],
      caption: 'Interactive 3D height field rendered at 30 fps via React Three Fiber.',
    },
  },
};
