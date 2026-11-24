import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'figure'> = {
  type: 'figure',
  title: 'Workdir Figure Spotlight',
  default: {
    id: 'default',
    label: 'Region Zoom & Spotlight',
    narration: 'Input arrives at the encoder block, routes through the sparse router gate, and emits from the decoder output.',
    focus: [{atFrac: 0.35, on: ['enc']}, {atFrac: 0.72, on: ['gate']}],
    visual: {
      type: 'figure',
      heading: 'System Schematic Spotlight',
      src: 'assets/sample-figure.png',
      alt: 'Encoder, router gate, and decoder pipeline diagram',
      aspect: 1.7778,
      regions: [
        {id: 'enc', label: 'Encoder block', x: 0.068, y: 0.215, w: 0.26, h: 0.535, zoom: 1.85, tone: 'accent', note: 'Embeds input tokens'},
        {id: 'gate', label: 'Router gate', x: 0.39, y: 0.27, w: 0.22, h: 0.425, zoom: 2.1, tone: 'primary', note: 'Routes active subset'},
        {id: 'dec', label: 'Decoder output', x: 0.672, y: 0.215, w: 0.26, h: 0.535, zoom: 1.85, tone: 'secondary', note: 'Generates logits'},
      ],
      caption: 'Workdir images pan, zoom, and spotlight regions safely via staticFile().',
    },
    figureAsset: 'figures/catalog-sample.png',
  },
};
