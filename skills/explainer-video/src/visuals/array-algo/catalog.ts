import type {CatalogEntry} from '../../sdk/pure';

export const catalog: CatalogEntry<'array-algo'> = {
  type: 'array-algo',
  title: 'Animated Array & Sorting Algorithms',
  default: {
    id: 'default',
    label: 'Quicksort Partition (Bars)',
    durationSec: 10,
    narration:
      'Pick five as the pivot on the right. First compare elements and swap seven with four, then swap nine with one, and finally place pivot five into its sorted slot.',
    visual: {
      type: 'array-algo',
      heading: 'Lomuto Partition Around Pivot 5',
      mode: 'bars',
      steps: [
        {
          id: 'pick',
          label: 'Pick pivot 5',
          note: 'i starts at 0',
          items: [
            {id: 'v7', value: 7, state: 'compare'},
            {id: 'v2', value: 2},
            {id: 'v9', value: 9},
            {id: 'v4', value: 4},
            {id: 'v1', value: 1},
            {id: 'v5', value: 5, state: 'pivot'},
          ],
          pointers: [
            {name: 'i', index: 0, tone: 'active'},
            {name: 'j', index: 0, tone: 'compare'},
            {name: 'pivot', index: 5, tone: 'pivot'},
          ],
          aux: {
            label: 'Invariant',
            items: [{text: '< 5: []', tone: 'sorted'}, {text: 'pivot = 5', tone: 'pivot'}],
          },
        },
        {
          id: 'swap1',
          label: 'Swap 7 and 4',
          items: [
            {id: 'v4', value: 4, state: 'swap'},
            {id: 'v2', value: 2, state: 'sorted'},
            {id: 'v9', value: 9},
            {id: 'v7', value: 7, state: 'swap'},
            {id: 'v1', value: 1},
            {id: 'v5', value: 5, state: 'pivot'},
          ],
          pointers: [
            {name: 'i', index: 1, tone: 'active'},
            {name: 'j', index: 3, tone: 'swap'},
            {name: 'pivot', index: 5, tone: 'pivot'},
          ],
          aux: {
            label: 'Invariant',
            items: [{text: '< 5: [4, 2]', tone: 'sorted'}, {text: '>= 5: [9, 7]', tone: 'default'}],
          },
        },
        {
          id: 'swap2',
          label: 'Swap 9 and 1',
          items: [
            {id: 'v4', value: 4, state: 'sorted'},
            {id: 'v2', value: 2, state: 'sorted'},
            {id: 'v1', value: 1, state: 'swap'},
            {id: 'v7', value: 7},
            {id: 'v9', value: 9, state: 'swap'},
            {id: 'v5', value: 5, state: 'pivot'},
          ],
          pointers: [
            {name: 'i', index: 2, tone: 'active'},
            {name: 'j', index: 4, tone: 'swap'},
            {name: 'pivot', index: 5, tone: 'pivot'},
          ],
          aux: {
            label: 'Invariant',
            items: [{text: '< 5: [4, 2, 1]', tone: 'sorted'}, {text: '>= 5: [7, 9]', tone: 'default'}],
          },
        },
        {
          id: 'place',
          label: 'Place pivot 5',
          note: 'index 3 fixed',
          items: [
            {id: 'v4', value: 4, state: 'sorted'},
            {id: 'v2', value: 2, state: 'sorted'},
            {id: 'v1', value: 1, state: 'sorted'},
            {id: 'v5', value: 5, state: 'pivot'},
            {id: 'v9', value: 9, state: 'dim'},
            {id: 'v7', value: 7, state: 'dim'},
          ],
          pointers: [{name: 'pivot', index: 3, tone: 'pivot'}],
          aux: {
            label: 'Result',
            items: [{text: 'pivotIdx = 3', tone: 'pivot'}, {text: 'O(n) swaps', tone: 'active'}],
          },
        },
      ],
      caption: 'Stable element IDs animate swaps smoothly across partition steps.',
    },
  },
  variants: [
    {
      id: 'sliding-window',
      label: 'Sliding Window (Cells)',
      theme: 'paper',
      durationSec: 9,
      narration:
        'Start with the first window summing to eight. Slide right to reach fourteen, then jump to the maximum window summing to nineteen.',
      visual: {
        type: 'array-algo',
        heading: 'Maximum Sum of Subarray Size 3',
        mode: 'cells',
        steps: [
          {
            id: 'w0',
            label: 'First window',
            items: [
              {id: 'c0', value: 2, state: 'active'},
              {id: 'c1', value: 5, state: 'active'},
              {id: 'c2', value: 1, state: 'active'},
              {id: 'c3', value: 8},
              {id: 'c4', value: 2},
              {id: 'c5', value: 9},
              {id: 'c6', value: 1},
            ],
            window: {start: 0, end: 2, label: 'sum = 8', tone: 'active'},
            pointers: [{name: 'L', index: 0, tone: 'active'}, {name: 'R', index: 2, tone: 'active'}],
            aux: {label: 'Best', items: [{text: 'cur = 8', tone: 'active'}, {text: 'max = 8', tone: 'sorted'}]},
          },
          {
            id: 'w1',
            label: 'Slide right',
            items: [
              {id: 'c0', value: 2, state: 'dim'},
              {id: 'c1', value: 5, state: 'active'},
              {id: 'c2', value: 1, state: 'active'},
              {id: 'c3', value: 8, state: 'active'},
              {id: 'c4', value: 2},
              {id: 'c5', value: 9},
              {id: 'c6', value: 1},
            ],
            window: {start: 1, end: 3, label: 'sum = 14', tone: 'active'},
            pointers: [{name: 'L', index: 1, tone: 'active'}, {name: 'R', index: 3, tone: 'active'}],
            aux: {label: 'Best', items: [{text: 'cur = 14', tone: 'active'}, {text: 'max = 14', tone: 'sorted'}]},
          },
          {
            id: 'w2',
            label: 'Maximum window',
            items: [
              {id: 'c0', value: 2, state: 'dim'},
              {id: 'c1', value: 5, state: 'dim'},
              {id: 'c2', value: 1, state: 'dim'},
              {id: 'c3', value: 8, state: 'sorted'},
              {id: 'c4', value: 2, state: 'sorted'},
              {id: 'c5', value: 9, state: 'sorted'},
              {id: 'c6', value: 1, state: 'dim'},
            ],
            window: {start: 3, end: 5, label: 'sum = 19', tone: 'sorted'},
            pointers: [{name: 'L', index: 3, tone: 'sorted'}, {name: 'R', index: 5, tone: 'sorted'}],
            aux: {label: 'Best', items: [{text: 'cur = 19', tone: 'sorted'}, {text: 'max = 19', tone: 'sorted'}]},
          },
        ],
        caption: 'Add the entering element and subtract the leaving one in O(1).',
      },
    },
  ],
};
