import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'mermaid'> = {
  type: 'mermaid',
  title: 'Mermaid Diagram',
  default: {
    id: 'default',
    label: 'Offline Sequence SVG',
    narration: 'The client sends a request to the gateway, which asks auth to check the token before forwarding to orders.',
    visual: {
      type: 'mermaid',
      heading: 'One Request, In Order',
      code: 'sequenceDiagram\n  Client->>Gateway: request\n  Gateway->>Auth: check token\n  Auth-->>Gateway: allowed\n  Gateway->>Orders: forward\n  Orders-->>Client: response',
      caption: 'Auth happens before routing',
    },
    mermaidRendered: {
      svg: 'mermaid/catalog.svg',
    },
  },
};
