import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'svg'> = {
  type: 'svg',
  title: 'Custom Safe SVG',
  default: {
    id: 'default',
    label: '2D Part Reveal',
    narration: 'The signal starts in the sensor node, travels across the wire link, and lights up the target display.',
    focus: [
      {atFrac: 0.65, on: ['target']},
    ],
    visual: {
      type: 'svg',
      heading: 'Handcrafted SVG Diagram',
      parts: [
        {id: 'sensor', label: 'Sensor node'},
        {id: 'link', label: 'Wire link'},
        {id: 'target', label: 'Target display'},
      ],
      svg: [
        '<svg viewBox="0 0 1700 560">',
        '  <g id="sensor">',
        '    <rect x="180" y="180" width="320" height="180" fill="accent" stroke="ink"/>',
        '    <text x="340" y="282" font="sans" size="label" fill="ink" text-anchor="middle">Sensor</text>',
        '  </g>',
        '  <g id="link">',
        '    <line x1="510" y1="270" x2="1150" y2="270" stroke="ink" arrow="end"/>',
        '  </g>',
        '  <g id="target">',
        '    <rect x="1160" y="180" width="360" height="180" fill="primary" stroke="ink"/>',
        '    <text x="1340" y="282" font="sans" size="label" fill="ink" text-anchor="middle">Display</text>',
        '  </g>',
        '</svg>',
      ].join('\n'),
      caption: 'Custom SVG markup obeys strict element, colour-token, and part rules.',
    },
  },
};
