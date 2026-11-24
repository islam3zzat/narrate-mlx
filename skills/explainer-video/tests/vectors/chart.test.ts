import assert from 'node:assert/strict';
import {describe} from '../../src/visuals/chart/semantics';
import {ChartVisual} from '../../src/visuals/chart/schema';
import {
  computeParetoFrontier,
  formatAxisTick,
  formatChartValue,
  inferChartDomains,
  layoutScatterLabels,
  logTicks,
  type ScatterProjectedPt,
} from '../../src/visuals/chart/compute';

// 1. Pareto frontier computation (min X, max Y)
{
  const pts = [
    {x: 30, y: 80}, // dominated by idx 1 (20, 84)
    {x: 20, y: 84}, // frontier
    {x: 25, y: 82}, // dominated by idx 1
    {x: 10, y: 78}, // frontier (fastest)
    {x: 45, y: 89}, // frontier (highest accuracy)
  ];
  const f = computeParetoFrontier(pts, 'min', 'max');
  assert.deepEqual(f, [3, 1, 4]);
}

// 2. Pareto frontier (max X, min Y)
{
  const pts = [
    {x: 10, y: 5},
    {x: 20, y: 4},
    {x: 15, y: 6},
  ];
  assert.deepEqual(computeParetoFrontier(pts, 'max', 'min'), [1]);
}

// 3. Deterministic log ticks and compact axis formatting (no Intl)
{
  const ticks = logTicks(1e18, 1e22, 5);
  assert.deepEqual(ticks, [1e18, 1e19, 1e20, 1e21, 1e22]);
  assert.equal(formatAxisTick(1e19), '1e19');
  assert.equal(formatAxisTick(2500000), '2.5M');
  assert.equal(formatChartValue(84.2, 1, '%'), '84.2%');
}

// 4. Domain inference and semantics reveal slots
{
  const bar = ChartVisual.parse({
    type: 'chart',
    kind: 'bar',
    heading: 'Benchmarks',
    categories: ['MMLU', 'MATH'],
    series: [
      {id: 'b', label: 'Baseline', values: [68, 42], errors: [2, 3]},
      {id: 'o', label: 'Ours', values: [79, 58], errors: [1.5, 2]},
    ],
  });
  const {yDomain} = inferChartDomains(bar);
  assert.ok(yDomain[0] <= 0 && yDomain[1] >= 80.5);
  assert.deepEqual(describe(bar, undefined), {slots: ['Baseline', 'Ours'], carried: [false, false]});

  const single = ChartVisual.parse({
    type: 'chart',
    kind: 'bar',
    heading: 'Ablated models',
    categories: ['Small', 'Medium', 'Large'],
    series: [{label: 'Score', values: [60, 72, 81]}],
  });
  assert.deepEqual(describe(single, undefined), {slots: ['Small', 'Medium', 'Large'], carried: [false, false, false]});
}

// 5. Collision-free scatter label placement
{
  const pts: ScatterProjectedPt[] = [
    {idx: 0, label: 'Alpha', cx: 200, cy: 200, r: 10, x: 1, y: 1, highlight: false, onFrontier: true},
    {idx: 1, label: 'Beta', cx: 215, cy: 205, r: 10, x: 2, y: 2, highlight: true, onFrontier: true},
  ];
  const boxes = layoutScatterLabels(pts, {x: 100, y: 50, w: 1400, h: 460});
  assert.equal(boxes.length, 2);
  for (const b of boxes) {
    assert.ok(b.bx >= 100 && b.bx + b.bw <= 1500);
    assert.ok(b.by >= 50 && b.by + b.bh <= 510);
  }
}

console.log('chart vector tests ok');
