import assert from 'node:assert/strict';
import {
  ID,
  SCENE_CANVAS_H,
  SCENE_CANVAS_H_CAPTION,
  SCENE_CANVAS_W,
  displayCells,
  formatNumber,
  fresh,
  lintOrderedSlots,
  sanitizeStableId,
  sceneCanvasSize,
  text,
  z,
} from '../../src/sdk/pure';

let checks = 0;

// 1. SceneCanvas safe-area bounds
assert.deepEqual(sceneCanvasSize(false), {width: 1700, height: 590});
assert.deepEqual(sceneCanvasSize(true), {width: 1700, height: 542});
assert.equal(SCENE_CANVAS_W, 1700);
assert.equal(SCENE_CANVAS_H, 590);
assert.equal(SCENE_CANVAS_H_CAPTION, 542);
checks++;

// 2. Stable ID sanitization strips colons and non-identifier characters
assert.equal(sanitizeStableId('algo-clip', ':r12:'), 'algo-clip-r12');
assert.equal(sanitizeStableId('bad:prefix!', 'a b/c'), 'badprefix-abc');
assert.equal(sanitizeStableId('!!!', ':::'), 'id-0');
checks++;

// 3. Curated pure SDK re-exports work cleanly without React/Remotion
const DemoSchema = z.strictObject({id: ID, title: text('title')});
assert.equal(DemoSchema.safeParse({id: 'n1', title: 'Sort'}).success, true);
assert.equal(DemoSchema.safeParse({id: 'bad id', title: 'Sort'}).success, false);
assert.equal(displayCells('hello'), 5);
assert.deepEqual(fresh(['step one', 'step two']), {slots: ['step one', 'step two'], carried: [false, false]});
assert.equal(formatNumber(1234.5, 1), '1,234.5');
const warnings = lintOrderedSlots(
  'First we pick a pivot and then partition.',
  [
    {what: 'step 1', label: 'pick pivot'},
    {what: 'step 2', label: 'partition'},
  ],
  {
    missed: (w, l) => `${w} missed ${l}`,
    late: (w, l, p) => `${w} ${l} after ${p}`,
  },
);
assert.deepEqual(warnings, []);
checks++;

console.log(`sdk checks: ${checks}/${checks} passed`);
