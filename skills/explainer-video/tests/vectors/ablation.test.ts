import assert from 'node:assert/strict';
import {AblationVisual} from '../../src/visuals/ablation/schema';
import {describe} from '../../src/visuals/ablation/semantics';
import {computeWaterfall, formatSignedDelta, resolveStepTone} from '../../src/visuals/ablation/compute';

// 1. Cumulative waterfall math & semantic tones (higherIsBetter = true)
{
  const vis = AblationVisual.parse({
    type: 'ablation',
    heading: 'Component Contributions',
    unit: '%',
    baseline: {id: 'base', label: 'Baseline', value: 64.0},
    steps: [
      {id: 'a', label: 'Sparse Attn', delta: 6.4},
      {id: 'b', label: 'Drop Reg', delta: -1.8},
      {id: 'c', label: 'Pre-Norm', delta: 3.1},
    ],
    totalLabel: 'Full Model',
  });
  const wf = computeWaterfall(vis);
  assert.equal(wf.bars.length, 5);
  assert.equal(wf.bars[1].from, 64.0);
  assert.ok(Math.abs(wf.bars[1].to - 70.4) < 1e-9);
  assert.equal(wf.bars[1].tone, 'accent');
  assert.equal(wf.bars[2].tone, 'danger');
  assert.ok(Math.abs(wf.bars[4].to - 71.7) < 1e-9);
  assert.equal(wf.bars[1].tagText, '+6.4%');
  assert.equal(wf.bars[2].tagText, '-1.8%');
  assert.equal(wf.netText, '+7.7% net');
  assert.deepEqual(describe(vis, undefined).slots, ['Baseline', 'Sparse Attn', 'Drop Reg', 'Pre-Norm', 'Full Model']);
}

// 2. Lower is better (latency / loss) flips auto tone polarity
{
  assert.equal(resolveStepTone(-4.5, 'auto', false), 'accent');
  assert.equal(resolveStepTone(+2.1, 'auto', false), 'danger');
  assert.equal(resolveStepTone(+2.1, 'neutral', false), 'neutral');
  assert.equal(formatSignedDelta(-0.002, 2, 'ms'), '0.00 ms');
  assert.equal(formatSignedDelta(1.5, 1, 'pt'), '+1.5 pt');
}

console.log('ablation vector tests ok');
