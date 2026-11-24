import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'equation'> = {
  type: 'equation',
  title: 'KaTeX Equation Spotlight',
  default: {
    id: 'default',
    label: 'Scaled Dot-Product Attention',
    narration: 'First take the query-key product, scale by root dimension, normalize via softmax, and combine with weighted values.',
    focus: [{atFrac: 0.45, on: ['scale']}],
    visual: {
      type: 'equation',
      heading: 'Scaled Dot-Product Attention',
      equations: [
        {
          label: 'Attention Core',
          latex: String.raw`\operatorname{Attn}(Q,K,V)=\term{soft}{\operatorname{softmax}}\!\left(\frac{\term{qk}{QK^\top}}{\term{scale}{\sqrt{d_k}}}\right)\term{val}{V}`,
        },
      ],
      terms: [
        {id: 'qk', label: 'Query-key product', gloss: 'Scores pairwise similarity between every query and key vector.', tone: 'primary'},
        {id: 'scale', label: 'Root dimension', gloss: 'Stabilizes logit variance before softmax saturates.', tone: 'accent'},
        {id: 'soft', label: 'Softmax normalize', gloss: 'Converts logits cleanly into positive weights summing to one.', tone: 'secondary'},
        {id: 'val', label: 'Weighted values', gloss: 'Aggregates value vectors proportional to attention probabilities.', tone: 'primary'},
      ],
      caption: 'Offline KaTeX rendering with strict macro/HTML sanitization.',
    },
  },
};
