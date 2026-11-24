import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'steps'> = {
  type: 'steps',
  title: 'Sequential Steps',
  default: {
    id: 'default',
    label: '2D Animated Steps',
    narration: 'Step one embeds tokens. Step two scores router logits. Step three gathers active experts. Step four merges residual state.',
    visual: {
      type: 'steps',
      heading: 'Four Stages per Layer',
      items: [
        'Embed input tokens into hidden state',
        'Score router logits for capacity filtering',
        'Gather selected tokens into compute batch',
        'Merge sparse updates with residual state',
      ],
    },
  },
  variants: [
    {
      id: '3d-staircase',
      label: '3D Staircase',
      mode: '3d',
      narration: 'Encode inputs, route capacity, compute attention, and project output.',
      visual: {
        type: 'steps',
        heading: 'Ascending Execution Pipeline',
        items: ['Encode inputs', 'Route capacity', 'Compute attention', 'Project output'],
      },
    },
  ],
};
