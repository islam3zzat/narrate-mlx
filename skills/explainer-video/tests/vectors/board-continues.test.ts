import assert from 'node:assert/strict';
import {buildBoard, type Ctx} from '../../src/whiteboard/layouts';
import {boardPlan} from '../../src/whiteboard/chain';
import {resolveLayout, whiteboardBlockers} from '../../src/whiteboard/eligible';
import {BOARD_CONTINUES_TYPES, CAPABILITIES, WHITEBOARD_DRAWN_TYPES} from '../../src/visuals/capabilities';
import {describe} from '../../src/visuals/registry';
import {CARRIED} from '../../src/semantics/carry';
import {ScriptSchema} from '../../src/schema';
import type {Item, StrokeItem} from '../../src/sdk/annotate';
import type {Scene, Visual} from '../../src/types';

/** The whiteboard honours `continues` for the types that opt in (capabilities.boardContinues): the carried slots are drawn finished, in place, with no wipe between the scenes. */

// Opt-in is generated from capabilities; only drawn types may opt in, and diagram types keep their own continues.
assert.deepEqual([...BOARD_CONTINUES_TYPES].sort(), ['bullets', 'flow', 'notes', 'stance', 'steps']);
for (const t of BOARD_CONTINUES_TYPES) {
  assert.ok((WHITEBOARD_DRAWN_TYPES as readonly string[]).includes(t), `${t} opts in without a board drawing`);
  assert.equal((CAPABILITIES as Record<string, {continues: unknown}>)[t].continues, false, `${t}: slide continues stays off`);
}

// ---- eligibility ----
const sc = (type: string, over: Record<string, unknown> = {}) => ({narration: 'Hello there.', visual: {type}, ...over});
const vid = (scenes: ReturnType<typeof sc>[]) => ({language: 'en', mode: '2d', scenes});
for (const t of BOARD_CONTINUES_TYPES) {
  const v = vid([sc(t), sc(t, {continues: true})]);
  assert.deepEqual(whiteboardBlockers(v), [], `${t}: continues no longer blocks the board`);
  assert.equal(resolveLayout(v), 'whiteboard');
}
for (const t of ['table', 'graph', 'callout', 'compare']) {
  const b = whiteboardBlockers(vid([sc(t), sc(t, {continues: true})]));
  assert.equal(b.length, 1, `${t}: still blocked`);
  assert.deepEqual(b[0].path, ['scenes', 1, 'continues']);
  assert.match(b[0].message, new RegExp(`continues on "${t}" scenes is not supported.*only: bullets, steps, flow|only: .*bullets`));
  assert.equal(resolveLayout(vid([sc(t), sc(t, {continues: true})])), 'slides');
}
assert.equal(whiteboardBlockers(vid([sc('bullets'), sc('bullets', {continues: true, chapter: 'Part'})]))[0].path.join('.'), 'scenes.1.chapter', 'a chapter still blocks');

// ---- schema ----
const script = (scenes: unknown[], over: Record<string, unknown> = {}) => ({title: 'T', scenes, ...over});
const bul = (items: string[], id: string, over: Record<string, unknown> = {}) => ({id, narration: 'Some narration here.', visual: {type: 'bullets', heading: 'H', items}, ...over});
const issues = (x: unknown) => { const r = ScriptSchema.safeParse(x); return r.success ? [] : r.error.issues.map((i) => i.message); };
assert.deepEqual(issues(script([bul(['a', 'b'], 's1'), bul(['a', 'b', 'c'], 's2', {continues: true})])), [], 'a growing list continues on the board');
assert.ok(issues(script([bul(['a', 'b'], 's1'), bul(['a', 'b', 'c'], 's2', {continues: true})], {layout: 'slides'})).some((m) => /needs the whiteboard layout/.test(m)), 'slides cannot continue a list');
assert.ok(issues(script([bul(['a', 'b'], 's1'), bul(['x', 'y'], 's2', {continues: true})])).some((m) => /shares no leading items/.test(m)), 'nothing carried');
assert.ok(issues(script([bul(['a', 'b'], 's1'), bul(['b', 'a'], 's2', {continues: true})])).some((m) => /shares no leading items/.test(m)), 'only a leading run carries');
assert.ok(issues(script([{id: 's0', narration: 'n', visual: {type: 'callout', heading: 'H', big: 'b', text: 't'}}, bul(['a'], 's1', {continues: true})])).some((m) => /needs the same type/.test(m)));
assert.ok(issues(script([bul(['a', 'b'], 's1'), bul(['a', 'b', 'c'], 's2', {continues: true})], {language: 'ar'})).length > 0, 'Arabic cannot use the board, so cannot continue a list');
assert.ok(issues(script([{id: 's1', narration: 'n', visual: {type: 'callout', heading: 'H', big: 'b', text: 't'}}, {id: 's2', narration: 'n', continues: true, visual: {type: 'callout', heading: 'H', big: 'b', text: 't'}}])).some((m) => /continues works on/.test(m)), 'other types still reject continues');

// ---- carry semantics (leading identical run) ----
const B = (items: string[], heading = 'H'): Visual => ({type: 'bullets', heading, items} as Visual);
assert.deepEqual(describe(B(['a', 'b', 'c']), B(['a', 'b'])).carried, [true, true, false]);
assert.deepEqual(describe(B(['a', 'x', 'c']), B(['a', 'b', 'c'])).carried, [true, false, false], 'a change ends the carried run');
assert.deepEqual(describe(B(['a', 'b'])).carried, [false, false], 'no previous scene: nothing carried');
const F = (labels: string[]): Visual => ({type: 'flow', heading: 'H', nodes: labels.map((label) => ({label}))} as Visual);
assert.deepEqual(describe(F(['A', 'B', 'C']), F(['A', 'B'])).carried, [true, true, false]);

const narration = 'now the second and then the third point arrives';
const words = narration.split(' ').map((w, i) => ({w, start: 0.3 + i * 0.4, end: 0.6 + i * 0.4}));
const base = {narration, leadFrames: 11, durationSec: 6, frames: 11 + 180 + 16, words, sentences: undefined};
const scene = (visual: Visual, continues?: true): Scene => ({id: 's', audio: '', ...base, visual, ...(continues ? {continues} : {})}) as Scene;

// ---- the plan of a run ----
const run = [B(['a']), B(['a', 'b']), B(['a', 'b', 'c'])].map((visual, i) => scene(visual, i ? true : undefined));
const plans = run.map((_, i) => boardPlan(run, i));
assert.deepEqual(plans.map((p) => p.seedIndex), [1, 1, 1], 'one pen seed for the whole run');
assert.deepEqual(plans.map((p) => p.nextContinues), [true, true, false], 'no wipe until the run ends');
assert.deepEqual(plans.map((p) => p.ctx.carried), [undefined, [true, false], [true, true, false]]);
assert.deepEqual(plans.map((p) => p.ctx.carriedHead), [false, true, true]);
assert.equal(plans[0].ctx.chain!.length, 3);
assert.deepEqual(plans[2].ctx.origin!.map((o) => o === run[0] ? 0 : o === run[1] ? 1 : o === undefined ? -1 : 2), [0, 1, -1], 'a carried slot points at the scene that first drew it');
const alone = boardPlan([scene(B(['a'])), scene(B(['a', 'b']))], 1);
assert.deepEqual(alone, {ctx: {}, seedIndex: 2, nextContinues: false}, 'a scene outside a run is planned exactly as before');
const mixed = boardPlan([scene(B(['a'])), scene({type: 'table'} as Visual, true)], 0);
assert.equal(mixed.nextContinues, false, 'a type that does not opt in never joins a run');

const ctxOf = (i: number, revealSec?: number[]): Ctx => ({...base, revealSec, ...plans[i].ctx});
const key = (it: Item) => (it.kind === 'text' ? `t|${it.str}|${it.x.toFixed(2)}|${it.y.toFixed(2)}|${it.size}|${it.rot.toFixed(4)}` : `s|${it.color}|${it.w}|${it.pts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' ')}`);
const board = (i: number, revealSec?: number[]) => buildBoard(run[i].visual, ctxOf(i, revealSec), plans[i].seedIndex)!;
const prev = board(1, [0, 1.5]), next = board(2, [0, 0, 2.5]);
const finished = (items: typeof prev) => items.filter((it) => it.t0 + it.dur <= 0);
assert.ok(finished(next).length >= finished(prev).length, 'the heading and carried items are finished before frame 0');
assert.ok(next.some((it) => it.t0 > 0), 'the new item is still to be drawn');
assert.ok(next.filter((it) => it.t0 + it.dur <= 0).every((it) => it.t0 <= CARRIED + 40), 'carried items start at CARRIED');
// every drawn item of the previous scene's carried part (heading + first item) reappears identically in the next scene
const keyset = new Set(finished(next).map(key));
const prevCarried = prev.filter((it) => it.t0 <= CARRIED + 40 || it.t0 < 30 && it.t0 > 0 && false);
assert.ok(prevCarried.length >= 1);
for (const it of prevCarried) assert.ok(keyset.has(key(it)), `carried item moved or changed: ${key(it).slice(0, 60)}`);
// the first item (carried in the second scene) keeps the exact place it had in the previous scene's last frame
const first = (items: typeof prev) => items.filter((it) => it.kind === 'text' && it.str === 'a').map(key);
assert.deepEqual(first(board(0, [0])), first(board(1, [0, 1.5])), 'item "a" does not move when scene 2 adds one');
assert.deepEqual(first(board(1, [0, 1.5])), first(next), 'item "a" does not move when scene 3 adds one');

// Without a run the drawing is unchanged: same items with or without an (empty) plan.
const solo = (c: Ctx) => buildBoard(B(['a', 'b']), c, 3)!.map(key);
assert.deepEqual(solo({...base, revealSec: undefined}), solo({...base, revealSec: undefined, ...boardPlan([scene(B(['a', 'b']))], 0).ctx}));

// No timing data: the fresh slots spread over the narration, the carried one is not counted.
{
  const c: Ctx = {...base, revealSec: undefined, ...plans[1].ctx};
  const items = buildBoard(run[1].visual, c, 1)!;
  const bt = items.filter((it) => it.kind === 'text' && it.str === 'b');
  assert.equal(bt.length, 1);
  assert.equal(bt[0].t0, 11 + 6, 'the only fresh slot appears at the start of the spread (lead frame) plus the text delay');
}

// A keyword underline belongs to the scene that first wrote the item and is kept when the item is carried (no underline pops away at the cut).
{
  const nar = (n: string): Scene => ({...scene(B(['plan the release'])), narration: n, words: n.split(' ').map((w, i) => ({w, start: 0.3 + i * 0.4, end: 0.6 + i * 0.4}))});
  const r2 = [{...nar('first the release is planned'), visual: B(['plan the release'])}, {...nar('and now something else entirely'), visual: B(['plan the release', 'more']), continues: true as const}];
  const p2 = r2.map((_, i) => boardPlan(r2, i));
  const strokes = (i: number) => buildBoard(r2[i].visual, {...r2[i], ...p2[i].ctx, revealSec: i ? [0, 1] : [1]}, p2[i].seedIndex)!.filter((it): it is StrokeItem => it.kind === 'stroke' && it.color !== '#ffd23f');
  const s1 = strokes(0).filter((it) => it.w === 6), s2 = strokes(1).filter((it) => it.w === 6);
  assert.equal(s1.length, 1, 'scene 1 underlines the spoken word');
  assert.equal(s2.length, 1, 'scene 2 keeps that underline though its own narration never says it');
  assert.equal(s2[0].t0, CARRIED);
  assert.equal(key(s1[0]), key(s2[0]), 'and draws it in the same place with the same wobble');
}
console.log('board-continues: ok');
