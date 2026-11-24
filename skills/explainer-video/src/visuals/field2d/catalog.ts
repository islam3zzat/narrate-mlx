import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'field2d'> = {
  type: 'field2d',
  title: '2D Scalar & Vector Field',
  default: {
    id: 'default',
    label: 'Scalar Contours + Gradient',
    narration: 'Level contours circle the mountain peak while gradient arrows point straight uphill along steepest ascent paths.',
    focus: [{atFrac: 0.45, on: ['grad']}],
    visual: {
      type: 'field2d',
      heading: 'Gaussian Peak & Gradient Ascent',
      mode: 'scalar',
      xDomain: [-3, 3],
      yDomain: [-2, 2],
      expr: 'exp(-(x^2 + y^2))',
      overlays: [
        {id: 'grad', kind: 'gradient', label: 'Gradient arrows'},
        {id: 'asc', kind: 'path', label: 'Ascent paths', direction: 'ascent', starts: [[-2, -1], [2, 1]]},
      ],
      caption: 'Gradient vectors always stand perpendicular to level curves.',
    },
  },
  variants: [
    {
      id: 'vector',
      label: 'Vector Curl Field',
      narration: 'A swirling vortex rotates counterclockwise everywhere, spinning a local curl paddle wheel.',
      visual: {
        type: 'field2d',
        heading: 'Rotational Vortex Field',
        mode: 'vector',
        xDomain: [-2.5, 2.5],
        yDomain: [-2, 2],
        fx: '-y',
        fy: 'x',
        overlays: [
          {id: 'curl', kind: 'curl', label: 'Curl wheel', at: [0, 0]},
        ],
      },
    },
  ],
};
