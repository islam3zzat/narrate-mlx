import assert from 'node:assert/strict';
import {GraphAlgoVisual} from '../../src/visuals/graph-algo/schema';
import {describe} from '../../src/visuals/graph-algo/semantics';
import {
  collectFocusIds,
  computeEdgeGeometry,
  computeGraphLayout,
  edgeKey,
  formatWeight,
} from '../../src/visuals/graph-algo/compute';

// 1. Schema validation, semantics slots, and focus IDs
{
  const vis = GraphAlgoVisual.parse({
    type: 'graph-algo',
    heading: 'Shortest Path',
    directed: true,
    nodes: [
      {id: 'S', label: 'S'},
      {id: 'A', label: 'A'},
      {id: 'B', label: 'B'},
      {id: 'T', label: 'T'},
    ],
    edges: [
      {id: 'eSA', from: 'S', to: 'A', weight: 3},
      {from: 'A', to: 'T', weight: 2},
      {from: 'S', to: 'B', weight: 5},
    ],
    steps: [
      {id: 'st0', label: 'Start S', nodeStates: {S: 'active'}, nodeBadges: {S: 'd=0'}},
      {id: 'st1', label: 'Relax edge', edgeStates: {eSA: 'sorted', 'A->T': 'active'}},
    ],
  });
  assert.deepEqual(describe(vis, undefined).slots, ['Start S', 'Relax edge']);
  assert.deepEqual(collectFocusIds(vis).sort(), ['A', 'B', 'S', 'T', 'eSA', 'st0', 'st1']);
  assert.equal(edgeKey(vis.edges[0]), 'eSA');
  assert.equal(edgeKey(vis.edges[1]), 'A->T');
  assert.equal(formatWeight(1500), '1,500');
  assert.equal(formatWeight('inf'), 'inf');
}

// 2. Auto-layout stays inside viewport with separated nodes; explicit coords pass through
{
  const vp = {x: 20, y: 10, width: 1600, height: 480};
  const nodes = [
    {id: 'S', label: 'S'},
    {id: 'A', label: 'A'},
    {id: 'B', label: 'B'},
    {id: 'C', label: 'C'},
    {id: 'T', label: 'T'},
  ];
  const edges = [
    {from: 'S', to: 'A'},
    {from: 'S', to: 'B'},
    {from: 'A', to: 'C'},
    {from: 'B', to: 'C'},
    {from: 'C', to: 'T'},
  ];
  const pos = computeGraphLayout(nodes, edges, vp, true);
  assert.equal(pos.length, 5);
  for (const p of pos) {
    assert.ok(p.x - p.r >= vp.x && p.x + p.r <= vp.x + vp.width);
    assert.ok(p.y - p.r >= vp.y && p.y + p.r <= vp.y + vp.height);
  }
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const dist = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
      assert.ok(dist > pos[i].r * 2, `nodes ${pos[i].id} and ${pos[j].id} overlap (${dist})`);
    }
  }
}

// 3. Edge geometry handles straight and curved opposite pairs
{
  const a = {x: 100, y: 200};
  const b = {x: 500, y: 200};
  const straight = computeEdgeGeometry(a, b, 36, true, false);
  assert.equal(straight.mid.x, 295.5);
  assert.equal(straight.mid.y, 200);
  const undirected = computeEdgeGeometry(a, b, 36, false, false);
  assert.equal(undirected.mid.x, 300);

  const curvedFwd = computeEdgeGeometry(a, b, 36, true, true);
  const curvedRev = computeEdgeGeometry(b, a, 36, true, true);
  assert.ok(curvedFwd.mid.y !== 200);
  assert.ok(Math.abs(curvedFwd.mid.y - curvedRev.mid.y) > 40, 'opposite curved edges should separate cleanly');
  const p0 = curvedFwd.pointAt(0);
  const p1 = curvedFwd.pointAt(1);
  assert.ok(p0.x > a.x && p1.x < b.x);
}

console.log('graph-algo vector tests ok');
