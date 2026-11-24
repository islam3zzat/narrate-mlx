import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'class'> = {
  type: 'class',
  title: 'UML Class Diagram',
  default: {
    id: 'default',
    label: '2D UML + Focus',
    narration: 'Router defines the interface, TopKRouter implements selection, and LayerBlock composes one router per transformer stage.',
    focus: [
      {atFrac: 0.35, on: ['router']},
      {atFrac: 0.7, on: ['layer']},
    ],
    visual: {
      type: 'class',
      heading: 'Routing Abstraction UML',
      direction: 'TB',
      classes: [
        {
          id: 'router',
          name: 'Router',
          stereotype: 'interface',
          attributes: ['capacity: number'],
          methods: ['select(tokens): Mask'],
          tone: 'primary',
        },
        {
          id: 'topk',
          name: 'TopKRouter',
          attributes: ['weights: Tensor'],
          methods: ['select(tokens): Mask'],
          tone: 'accent',
        },
        {
          id: 'layer',
          name: 'LayerBlock',
          attributes: ['router: Router', 'dim: number'],
          methods: ['forward(x): Tensor'],
        },
      ],
      relations: [
        {from: 'topk', to: 'router', type: 'implements'},
        {from: 'layer', to: 'router', type: 'composes', label: 'owns'},
      ],
    },
  },
};
