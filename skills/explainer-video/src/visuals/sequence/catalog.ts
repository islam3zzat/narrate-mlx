import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'sequence'> = {
  type: 'sequence',
  title: 'Sequence Diagram',
  default: {
    id: 'default',
    label: '2D Protocol Exchange',
    narration: 'The client submits a challenge, the server signs a nonce, verifies the token proof, and returns session keys.',
    focus: [
      {atFrac: 0.3, on: ['cli', 'srv']},
      {atFrac: 0.7, on: ['auth']},
    ],
    visual: {
      type: 'sequence',
      heading: 'Token Verification Exchange',
      participants: [
        {id: 'cli', label: 'Client', sub: 'Browser'},
        {id: 'srv', label: 'API Gateway', tone: 'primary'},
        {id: 'auth', label: 'Auth Core', tone: 'accent'},
      ],
      messages: [
        {from: 'cli', to: 'srv', label: 'Submit challenge'},
        {from: 'srv', to: 'auth', label: 'Verify signature'},
        {from: 'auth', to: 'srv', label: 'Token valid', reply: true, tone: 'accent'},
        {from: 'srv', to: 'cli', label: 'Session keys ready', reply: true},
      ],
      animate: true,
    },
  },
  variants: [
    {
      id: '3d',
      label: '3D Sequence',
      mode: '3d',
      narration: 'Caller asks worker and gets a reply.',
      visual: {
        type: 'sequence',
        heading: 'Async RPC',
        participants: [
          {id: 'a', label: 'Caller'},
          {id: 'b', label: 'Worker', tone: 'primary'},
        ],
        messages: [
          {from: 'a', to: 'b', label: 'Dispatch job'},
          {from: 'b', to: 'a', label: 'Result ACK', reply: true},
        ],
        animate: true,
      },
    },
  ],
};
