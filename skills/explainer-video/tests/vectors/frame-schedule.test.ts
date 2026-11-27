import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {computeFrameSchedule, sceneActiveIntervals} from '../../src/frame-schedule';
import type {Scene, VideoData} from '../../src/types';

// 1. Purity check: frame-schedule.ts must not import react, remotion, or three.
const src = fs.readFileSync(path.resolve(process.cwd(), 'src/frame-schedule.ts'), 'utf8');
assert.ok(!/from\s+['"](react|remotion|three|@remotion)/.test(src), 'frame-schedule.ts must remain pure');

const makeScene = (id: string, visual: Scene['visual'], overrides: Partial<Scene> = {}): Scene => ({
  id,
  narration: 'First sentence here. Second sentence follows.',
  visual,
  audio: `audio/test/${id}.wav`,
  durationSec: 4.0,
  frames: 150,
  leadFrames: 11,
  ...overrides,
});

// 2. 3D mode is always continuous (camera drifts every frame).
{
  const video: VideoData = {
    id: 'v3d',
    title: '3D',
    fps: 30,
    totalFrames: 150,
    mode: '3d',
    scenes: [makeScene('s01', {type: 'title', kicker: 'K', headline: 'H', sub: 'S'})],
  };
  const sched = computeFrameSchedule(video);
  assert.equal(sched.uniqueFrames, 150);
  assert.equal(sched.runs.length, 150);
  assert.ok(sched.runs.every((r) => r.count === 1));
}

// 3. Continuous 2D types (graph, sequence, animated mermaid) keep all frames active.
for (const visual of [
  {type: 'graph', heading: 'G', nodes: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], edges: [{from: 'a', to: 'b'}]},
  {type: 'sequence', heading: 'Q', participants: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], messages: [{from: 'a', to: 'b', label: 'hi'}]},
  {type: 'mermaid', heading: 'M', code: 'flowchart LR\nA-->B', build: true},
] as Scene['visual'][]) {
  const res = sceneActiveIntervals(makeScene('s', visual), false, false);
  assert.equal(res, 'continuous', `${visual.type} should be continuous`);
}

// 4. Discrete 2D types produce compact intervals and exact schedule sums.
{
  const scenes: Scene[] = [
    makeScene('s01', {type: 'title', kicker: 'K', headline: 'H', sub: 'S'}, {chapter: 'Part 1'}),
    makeScene('s02', {type: 'bullets', heading: 'B', items: ['One', 'Two', 'Three']}),
    makeScene('s03', {type: 'code', heading: 'C', language: 'ts', code: 'const x = 1;', highlights: [{lines: '1', label: 'x'}]}),
    makeScene('s04', {type: 'equation', heading: 'E', equations: [{latex: 'x + y'}], terms: [{id: 'x', label: 'x', gloss: 'var'}]}),
    makeScene('s05', {type: 'mermaid', heading: 'M', code: 'flowchart LR\nA-->B'}),
    makeScene('s06', {
      type: 'array-algo',
      heading: 'A',
      steps: [
        {label: 'Init', items: [{id: 'x', value: 1}, {id: 'y', value: 2}]},
        {label: 'Swap', items: [{id: 'y', value: 2}, {id: 'x', value: 1}]},
      ],
    }),
    makeScene('s07', {
      type: 'graph-algo',
      heading: 'G',
      nodes: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}],
      edges: [{from: 'a', to: 'b'}],
      steps: [
        {label: 'Start', nodeStates: {a: 'active'}},
        {label: 'Visit', nodeStates: {a: 'sorted', b: 'active'}, edgeStates: {'a->b': 'active'}},
      ],
    }),
  ];
  // First scene chapter adds chapterFrames (45) - transitionFrames (10) = 35 frames.
  const totalFrames = 35 + scenes.reduce((a, s) => a + s.frames, 0);
  const sched = computeFrameSchedule({id: 'mix', title: 'Mix', fps: 30, totalFrames, scenes});
  const sum = sched.runs.reduce((a, r) => a + r.count, 0);
  assert.equal(sum, totalFrames);
  assert.equal(sched.uniqueFrames, sched.runs.length);
  assert.equal(sched.runs[0].frame, 0);
  for (let i = 1; i < sched.runs.length; i++) {
    assert.ok(sched.runs[i].frame > sched.runs[i - 1].frame);
  }
  // Chapter card + transitions [0..45] must all be active (count === 1).
  for (let f = 0; f <= 45; f++) {
    assert.equal(sched.runs[f].frame, f);
    assert.equal(sched.runs[f].count, 1);
  }
  assert.ok(sched.uniqueFrames < totalFrames * 0.5, `expected >50% savings, got ${sched.uniqueFrames}/${totalFrames}`);
}

// 5. Committed golden corpus data invariants and substantial savings on static-hold 2D videos.
const goldenDir = path.resolve(process.cwd(), 'tests/golden');
for (const [name, maxFrac] of [
  ['example', 0.45],
  ['incident', 0.45],
  ['code', 0.45],
  ['figure', 0.45],
  ['stat', 0.55],
  ['equation', 0.65],
  ['svg', 0.70],
  ['array-algo', 0.50],
  ['graph-algo', 0.55],
] as const) {
  const data = JSON.parse(fs.readFileSync(path.join(goldenDir, name, 'data.json'), 'utf8')) as VideoData;
  const sched = computeFrameSchedule(data);
  const sum = sched.runs.reduce((a, r) => a + r.count, 0);
  assert.equal(sum, data.totalFrames, `${name}: sum of run counts must match totalFrames`);
  assert.equal(sched.runs[0].frame, 0);
  assert.ok(sched.uniqueFrames < data.totalFrames * maxFrac, `${name}: expected <${Math.round(maxFrac * 100)}% unique frames, got ${sched.uniqueFrames}/${data.totalFrames}`);
}

console.log('frame-schedule vector tests ok');
