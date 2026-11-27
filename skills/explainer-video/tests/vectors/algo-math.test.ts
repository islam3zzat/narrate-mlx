import assert from 'node:assert/strict';
import {
  computeArrayLayout,
  formatCompactNumber,
  interpolateKeyedPositions,
  stackPointers,
  stepActiveIntervals,
  stepTimeline,
} from '../../src/sdk/algo-math';

let checks = 0;

// 1. stepTimeline: single-step, pre-lead, step boundaries, mid-transition, steady hold
{
  const single = stepTimeline(20, 10, 120, 1);
  assert.deepEqual(single, {prevIndex: 0, index: 0, progress: 1, eased: 1, isTransitioning: false, startFrame: 10});

  const reveal = [0, 1, 2]; // lead=10 -> starts [10, 40, 70] at 30fps
  const before = stepTimeline(5, 10, 120, 3, reveal, 18);
  assert.equal(before.index, 0);
  assert.equal(before.isTransitioning, false);

  const atStep1 = stepTimeline(40, 10, 120, 3, reveal, 18);
  assert.equal(atStep1.prevIndex, 0);
  assert.equal(atStep1.index, 1);
  assert.equal(atStep1.progress, 0);
  assert.equal(atStep1.eased, 0);
  assert.equal(atStep1.isTransitioning, true);

  const midStep1 = stepTimeline(49, 10, 120, 3, reveal, 18);
  assert.equal(midStep1.prevIndex, 0);
  assert.equal(midStep1.index, 1);
  assert.equal(midStep1.progress, 0.5);
  assert.ok(midStep1.eased > 0 && midStep1.eased < 1);
  assert.equal(midStep1.isTransitioning, true);

  const steadyStep1 = stepTimeline(65, 10, 120, 3, reveal, 18);
  assert.equal(steadyStep1.prevIndex, 0);
  assert.equal(steadyStep1.index, 1);
  assert.equal(steadyStep1.eased, 1);
  assert.equal(steadyStep1.isTransitioning, false);

  // Degenerate identical reveal timestamps settle cleanly at latest active step
  const sameReveal = stepTimeline(40, 10, 120, 3, [1, 1, 2], 18);
  assert.equal(sameReveal.index, 1);
  assert.equal(sameReveal.prevIndex, 0);
}
checks++;

// 2. stepActiveIntervals produces sorted, non-overlapping merged ranges
{
  const ivs = stepActiveIntervals(4, 10, 120, [0, 0.2, 2, 3.5], 18);
  assert.ok(ivs.length >= 2);
  for (let i = 1; i < ivs.length; i++) {
    assert.ok(ivs[i][0] > ivs[i - 1][1] + 1, 'intervals should be merged and strictly increasing');
  }
  assert.equal(ivs[0][0], 0);
}
checks++;

// 3. interpolateKeyedPositions: stationary, opposing swap arcs, non-crossing shift, new entry
{
  const slotX = (i: number) => 100 + i * 100;
  const midSwap = interpolateKeyedPositions(['a', 'b', 'c'], ['c', 'b', 'a'], slotX, 200, 0.5, {arcHeight: 40});
  const c = midSwap.find((p) => p.id === 'c')!;
  const b = midSwap.find((p) => p.id === 'b')!;
  const a = midSwap.find((p) => p.id === 'a')!;

  assert.equal(b.moved, false);
  assert.equal(b.arcSign, 0);
  assert.equal(b.y, 200);

  assert.equal(a.swapped, true);
  assert.equal(c.swapped, true);
  assert.equal(a.arcSign, -c.arcSign);
  assert.ok(Math.abs(a.y - (200 - 40)) < 1e-6);
  assert.ok(Math.abs(c.y - (200 + 40)) < 1e-6);

  const endSwap = interpolateKeyedPositions(['a', 'b', 'c'], ['c', 'b', 'a'], slotX, 200, 1, {arcHeight: 40});
  assert.ok(Math.abs(endSwap[0].y - 200) < 1e-6);
  assert.equal(endSwap[0].x, slotX(0));

  // Non-crossing shift: both move right without crossing each other
  const shift = interpolateKeyedPositions(['x', 'a', 'b'], ['a', 'b', 'n'], slotX, 200, 0.5);
  assert.equal(shift[0].swapped, false);
  assert.equal(shift[0].arcSign, 0);
  assert.equal(shift[0].y, 200);
  assert.equal(shift[2].fromIndex, -1);
  assert.equal(shift[2].opacity, 0.5);
}
checks++;

// 4. computeArrayLayout stays strictly inside viewport for N = 1..16 in both modes
{
  const vp = {x: 40, y: 20, width: 1620, height: 500};
  for (const mode of ['cells', 'bars'] as const) {
    for (const n of [1, 5, 8, 12, 16]) {
      const lay = computeArrayLayout(n, vp, {mode});
      assert.ok(lay.cellW >= 24 && lay.cellH >= 58 && lay.barMaxH >= 80);
      assert.ok(lay.slotLeftX(0) >= vp.x);
      assert.ok(lay.slotLeftX(n - 1) + lay.cellW <= vp.x + vp.width);
      for (let i = 1; i < n; i++) {
        assert.ok(lay.slotLeftX(i) >= lay.slotLeftX(i - 1) + lay.cellW + lay.gap);
      }
    }
  }
}
checks++;

// 5. stackPointers resolves same-index collisions deterministically
{
  const stacked = stackPointers([
    {name: 'L', index: 0},
    {name: 'i', index: 2},
    {name: 'j', index: 2},
    {name: 'pivot', index: 2},
  ]);
  assert.deepEqual(
    stacked.map((p) => [p.name, p.stackRow, p.stackCount]),
    [
      ['L', 0, 1],
      ['i', 0, 3],
      ['j', 1, 3],
      ['pivot', 2, 3],
    ],
  );
}
checks++;

// 6. formatCompactNumber without Intl
{
  assert.equal(formatCompactNumber(1250), '1,250');
  assert.equal(formatCompactNumber(-0), '0');
  assert.equal(formatCompactNumber(-42.5, 1), '-42.5');
  assert.equal(formatCompactNumber(Number.NaN), '0');
  assert.equal(formatCompactNumber(1e-7), '0.00');
}
checks++;

console.log(`algo-math checks: ${checks}/${checks} passed`);
