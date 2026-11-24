import type {CatalogEntry} from '../catalog-types';

export const catalog: CatalogEntry<'chart'> = {
  type: 'chart',
  title: 'Empirical Data Chart',
  default: {
    id: 'default',
    label: 'Benchmark Bar + CI',
    narration: 'Our dense baseline saturates early, whereas sparse routing gains ground across logic, algebra, and coding tasks.',
    focus: [{atFrac: 0.45, on: ['ours']}],
    visual: {
      type: 'chart',
      kind: 'bar',
      heading: 'Reasoning Benchmarks Across Tasks',
      yLabel: 'Accuracy (%)',
      unit: '%',
      categories: ['Logic', 'Algebra', 'Coding'],
      series: [
        {id: 'base', label: 'Dense Baseline', values: [71.4, 73.2, 46.8], errors: [1.2, 1.5, 1.9], tone: 'ink'},
        {id: 'ours', label: 'Sparse Routing', values: [79.8, 86.4, 64.1], errors: [0.9, 1.1, 1.3], tone: 'primary', highlight: true},
      ],
      baseline: {value: 75.0, label: '75% Target', tone: 'danger'},
    },
  },
  variants: [
    {
      id: 'scaling-line',
      label: 'Log Scaling Line + Band',
      narration: 'Dense loss bends slowly over compute, while routed scaling lowers loss faster.',
      visual: {
        type: 'chart',
        kind: 'line',
        heading: 'Compute Scaling Curve',
        xLabel: 'Compute (FLOPs)',
        yLabel: 'Loss',
        xScale: 'log',
        series: [
          {id: 'd', label: 'Dense loss', points: [[1e18, 2.9], [1e19, 2.55], [1e20, 2.25]], band: [[2.8, 3.0], [2.46, 2.64], [2.17, 2.33]], dashed: true, tone: 'ink'},
          {id: 'r', label: 'Routed scaling', points: [[1e18, 2.78], [1e19, 2.34], [1e20, 1.98]], band: [[2.72, 2.84], [2.29, 2.39], [1.94, 2.02]], tone: 'secondary', highlight: true},
        ],
      },
    },
    {
      id: 'pareto-scatter',
      label: 'Pareto Frontier Scatter',
      narration: 'Tiny runs fast, teacher reaches highest accuracy, and routed sits right on the optimal curve.',
      visual: {
        type: 'chart',
        kind: 'scatter',
        heading: 'Accuracy vs Latency Frontier',
        xLabel: 'Latency (ms)',
        yLabel: 'Score (%)',
        betterX: 'min',
        betterY: 'max',
        points: [
          {id: 'tiny', label: 'Tiny', x: 7, y: 69, tone: 'accent'},
          {id: 'routed', label: 'Routed', x: 16, y: 83, tone: 'primary', highlight: true},
          {id: 'teacher', label: 'Teacher', x: 44, y: 86, tone: 'danger'},
        ],
      },
    },
  ],
};
