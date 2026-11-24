import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'code'> = {
  type: 'code',
  title: 'Annotated Code Spotlight',
  default: {
    id: 'default',
    label: 'TypeScript Spotlight',
    narration: 'First we score the routing logits, pick the active top-k indices, and scatter sparse updates cleanly back into the tensor.',
    visual: {
      type: 'code',
      heading: 'Mixture-of-Depths Forward Pass',
      language: 'python',
      code: [
        'def forward(x, router, block, cap):',
        '    logits = router(x).squeeze(-1)',
        '    weights, idx = torch.topk(logits, cap, dim=1)',
        '    selected = gather_tokens(x, idx)',
        '    updated = block(selected) * weights.unsqueeze(-1)',
        '    return x.scatter_add(1, idx, updated)',
      ].join('\n'),
      highlights: [
        {lines: '2', label: 'Score routing logits'},
        {lines: '3-4', label: 'Pick top-k indices'},
        {lines: '5-6', label: 'Scatter sparse updates'},
      ],
      caption: 'Skipped tokens keep their residual representation with zero compute.',
    },
  },
};
