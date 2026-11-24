import assert from 'node:assert/strict';
import {MatrixVisual} from '../../src/visuals/matrix/schema';
import {describe} from '../../src/visuals/matrix/semantics';
import {
  boundsOfHighlight,
  cellMatchesFocusSet,
  formatMatrixCell,
  inferMatrixDomain,
  normalizeIntensity,
} from '../../src/visuals/matrix/compute';

// 1. Domain inference, sequential & diverging normalization
{
  const seq = MatrixVisual.parse({
    type: 'matrix',
    heading: 'Attention Grid',
    rows: ['Q1', 'Q2', 'Q3'],
    cols: ['K1', 'K2', 'K3'],
    values: [[0.8, 0.1, 0.1], [0.2, 0.6, 0.2], [0.05, 0.15, 0.8]],
  });
  const {domain} = inferMatrixDomain(seq);
  assert.deepEqual(domain, [0.05, 0.8]);
  assert.ok(Math.abs(normalizeIntensity(0.8, domain, 'sequential') - 1) < 1e-9);
  assert.ok(Math.abs(normalizeIntensity(0.05, domain, 'sequential') - 0) < 1e-9);
  assert.deepEqual(describe(seq, undefined).slots, ['Q1', 'Q2', 'Q3']);

  const div = MatrixVisual.parse({
    type: 'matrix',
    heading: 'Logit Shift',
    scale: 'diverging',
    rows: ['A', 'B'],
    cols: ['X', 'Y'],
    values: [[-3.0, 1.5], [0.0, 2.0]],
  });
  const dDiv = inferMatrixDomain(div);
  assert.deepEqual(dDiv.domain, [-3.0, 3.0]);
  assert.equal(normalizeIntensity(-3.0, dDiv.domain, 'diverging'), -1);
  assert.equal(normalizeIntensity(1.5, dDiv.domain, 'diverging'), 0.5);
  assert.equal(formatMatrixCell(1.5, 1, 'ms'), '1.5 ms');
}

// 2. Highlight bounds & focus matching (ids + rN/cN/rN_cM shorthands)
{
  const v = MatrixVisual.parse({
    type: 'matrix',
    heading: 'Confusion',
    rows: ['Cat', 'Dog', 'Bird'],
    cols: ['Cat', 'Dog', 'Bird'],
    values: [[42, 3, 1], [5, 38, 2], [0, 2, 44]],
    highlights: [
      {id: 'confuse', label: 'Confused pair', kind: 'block', rows: [0, 1], cols: [0, 1]},
    ],
  });
  assert.deepEqual(describe(v, undefined).slots, ['Confused pair']);
  assert.deepEqual(boundsOfHighlight(v.highlights![0], 3, 3), {r0: 0, r1: 1, c0: 0, c1: 1});
  assert.equal(cellMatchesFocusSet(1, 0, new Set(['confuse']), v), true);
  assert.equal(cellMatchesFocusSet(2, 2, new Set(['confuse']), v), false);
  assert.equal(cellMatchesFocusSet(2, 1, new Set(['r2']), v), true);
  assert.equal(cellMatchesFocusSet(0, 2, new Set(['c2']), v), true);
  assert.equal(cellMatchesFocusSet(2, 2, new Set(['r2_c2']), v), true);
}

console.log('matrix vector tests ok');
