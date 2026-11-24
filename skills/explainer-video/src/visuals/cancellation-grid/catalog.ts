import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'cancellation-grid'> = {
  type: 'cancellation-grid',
  title: 'Cancellation Grid (Stokes / FTC)',
  default: {
    id: 'default',
    label: '2D Curl Cancellation',
    narration: 'Divide the domain into local circulation cells, watch interior edges push in opposite directions and cancel, leaving only the outer perimeter loop.',
    visual: {
      type: 'cancellation-grid',
      heading: 'Interior Edges Cancel Out',
      theorem: 'curl-2d',
      cols: 3,
      rows: 3,
      stages: [
        {phase: 'cells', label: 'Local circulation cells', note: 'Every tile spins clockwise'},
        {phase: 'interior', label: 'Interior edges oppose', note: 'Shared inner seams push oppositely'},
        {phase: 'cancel', label: 'Opposite flows cancel', note: 'Inner contributions vanish identically'},
        {phase: 'boundary', label: 'Outer perimeter remains', note: 'Net curl equals outer boundary integral'},
      ],
      caption: 'Green Theorem reduces a surface sum of curls to its outer boundary.',
    },
  },
  variants: [
    {
      id: 'ftc-1d',
      label: '1D Telescoping FTC',
      narration: 'Split into sub-intervals, cancel interior endpoints, leaving only the start and end bounds.',
      visual: {
        type: 'cancellation-grid',
        heading: 'Telescoping Sum in 1D',
        theorem: 'ftc-1d',
        cols: 5,
        stages: [
          {phase: 'cells', label: 'Sub-intervals'},
          {phase: 'cancel', label: 'Cancel interior'},
          {phase: 'boundary', label: 'End bounds'},
        ],
      },
    },
  ],
};
