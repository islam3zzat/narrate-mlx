import assert from 'node:assert/strict';
import {ArrayAlgoVisual} from '../../src/visuals/array-algo/schema';
import {describe} from '../../src/visuals/array-algo/semantics';
import {
  barHeightFor,
  collectFocusIds,
  computeBarMax,
  formatItemValue,
  interpolatePointers,
  interpolateWindow,
  maxPointerStackRows,
} from '../../src/visuals/array-algo/compute';

// 1. Schema validation & semantics slots
{
  const vis = ArrayAlgoVisual.parse({
    type: 'array-algo',
    heading: 'Partition',
    mode: 'bars',
    steps: [
      {
        id: 's1',
        label: 'Pick pivot',
        items: [{id: 'a', value: 8}, {id: 'b', value: 3}],
        pointers: [{name: 'i', index: 0}, {name: 'j', index: 0}],
      },
      {
        id: 's2',
        label: 'Swap pair',
        items: [{id: 'b', value: 3}, {id: 'a', value: 8}],
        pointers: [{name: 'i', index: 0}, {name: 'j', index: 1}],
      },
    ],
  });
  assert.deepEqual(describe(vis, undefined).slots, ['Pick pivot', 'Swap pair']);
  assert.equal(computeBarMax(vis.steps), 8);
  assert.equal(barHeightFor(4, 8, 200), 100);
  assert.equal(barHeightFor(0, 8, 200), 28);
  assert.equal(maxPointerStackRows(vis.steps), 2);
  assert.deepEqual(collectFocusIds(vis).sort(), ['a', 'b', 's1', 's2']);
}

// 2. Pointer glide & window slide interpolation
{
  const slotCenterX = (i: number) => 50 + i * 100;
  const slotLeftX = (i: number) => i * 100;
  const ptrs = interpolatePointers(
    [{name: 'L', index: 0}],
    [{name: 'L', index: 2}, {name: 'R', index: 4}],
    slotCenterX,
    0.5,
  );
  assert.equal(ptrs[0].x, 150);
  assert.equal(ptrs[0].opacity, 1);
  assert.equal(ptrs[1].x, 450);
  assert.equal(ptrs[1].opacity, 0.5);

  const win = interpolateWindow({start: 0, end: 2}, {start: 2, end: 4, label: 'sum'}, slotLeftX, 80, 0.5)!;
  assert.equal(win.leftX, 100);
  assert.equal(win.rightX, 380);
  assert.equal(formatItemValue(1200), '1,200');
  assert.equal(formatItemValue('INF'), 'INF');
}

console.log('array-algo vector tests ok');
