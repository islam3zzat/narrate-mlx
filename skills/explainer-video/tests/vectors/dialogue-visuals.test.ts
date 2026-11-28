// The dialogue visuals duo, stance and notes (src/visuals/<type>/): schema rules, carried slots, speaker references, and that a
// continued whiteboard scene draws its carried part exactly where the previous scene ended. No framework:
//   node_modules/.bin/tsx tests/vectors/dialogue-visuals.test.ts
import assert from 'node:assert/strict';
import {buildBoard, type Ctx} from '../../src/whiteboard/layouts';
import {boardPlan} from '../../src/whiteboard/chain';
import {BOARD_CONTINUES_TYPES, CAPABILITIES, WHITEBOARD_DRAWN_TYPES} from '../../src/visuals/capabilities';
import {REGISTRY, describe, lintScene, speakerRefsOf} from '../../src/visuals/registry';
import {CARRIED} from '../../src/semantics/carry';
import {ScriptSchema} from '../../src/schema';
import type {Item} from '../../src/sdk/annotate';
import type {Scene, Visual} from '../../src/types';

const parse = (v: unknown) => (REGISTRY as Record<string, {schema: {safeParse: (x: unknown) => {success: boolean; error?: {issues: {message: string}[]}}}}>)[(v as {type: string}).type].schema.safeParse(v);
const msgs = (v: unknown) => parse(v).error?.issues.map((i) => i.message) ?? [];

// ---- capabilities ----
for (const t of ['duo', 'stance', 'notes'] as const) {
  assert.deepEqual(CAPABILITIES[t].modes, ['2d']);
  assert.equal(CAPABILITIES[t].focus, false);
  assert.equal(CAPABILITIES[t].continues, false);
  assert.ok((WHITEBOARD_DRAWN_TYPES as readonly string[]).includes(t), `${t} draws itself on the board`);
}
assert.deepEqual([...BOARD_CONTINUES_TYPES].sort(), ['bullets', 'flow', 'notes', 'stance', 'steps']);

// ---- schemas ----
const e = (by: string, text: string, kind: string, ref?: number) => ({by, text, kind, ...(ref === undefined ? {} : {ref})});
const stance = (entries: unknown[], question = 'Q?') => ({type: 'stance', question, entries});
assert.deepEqual(msgs(stance([e('a', 'x', 'claim'), e('b', 'y', 'disagree', 0), e('a', 'z', 'resolve', 1)])), []);
assert.ok(msgs(stance([e('a', 'x', 'claim'), e('b', 'y', 'agree', 1)])).some((m) => /earlier entry/.test(m)), 'ref must be earlier');
assert.ok(msgs(stance([e('a', 'x', 'claim'), e('b', 'y', 'resolve', 0)])).some((m) => /must reference a "disagree"/.test(m)), 'resolve needs a disagree');
assert.ok(msgs(stance([e('a', 'x', 'claim'), e('b', 'y', 'resolve')])).some((m) => /needs `ref`/.test(m)), 'resolve needs a ref');
assert.ok(msgs(stance(Array.from({length: 5}, (_, i) => e('a', `t${i}`, 'claim')))).some((m) => /more than 4 entries/.test(m)), 'at most 4 per speaker');
assert.deepEqual(msgs(stance(Array.from({length: 8}, (_, i) => e(i % 2 ? 'b' : 'a', `t${i}`, 'claim')))), [], '4 + 4 fits');
assert.ok(msgs(stance(Array.from({length: 9}, (_, i) => e(i % 2 ? 'b' : 'a', `t${i}`, 'claim')))).length > 0, 'at most 8 entries');
assert.ok(msgs(stance([e('a', 'x'.repeat(61), 'claim')])).length > 0, 'entry text <= 60');
assert.ok(msgs(stance([e('a', 'x', 'claim')], 'q'.repeat(91))).length > 0, 'question <= 90');
assert.ok(msgs(stance([e('a', 'x', 'shout')])).length > 0, 'kind is an enum');
assert.ok(msgs({...stance([e('a', 'x', 'claim')]), extra: 1}).length > 0, 'strict object');
assert.deepEqual(msgs({type: 'notes', heading: 'H', items: [{text: 'a', by: 'a'}, {text: 'b'}]}), []);
assert.ok(msgs({type: 'notes', heading: 'H', items: [{text: 'x'.repeat(71)}]}).length > 0, 'note <= 70');
assert.ok(msgs({type: 'notes', heading: 'x'.repeat(61), items: [{text: 'a'}]}).length > 0, 'heading <= 60');
assert.ok(msgs({type: 'notes', heading: 'H', items: Array.from({length: 9}, () => ({text: 'a'}))}).length > 0, 'at most 8 notes');
assert.deepEqual(msgs({type: 'duo', question: 'Q?', quote: 'q'}), []);
assert.deepEqual(msgs({type: 'duo', question: 'Q?'}), []);
assert.ok(msgs({type: 'duo', question: 'q'.repeat(91)}).length > 0, 'duo question <= 90');
assert.ok(msgs({type: 'duo', question: 'Q?', quote: 'q'.repeat(81)}).length > 0, 'duo quote <= 80');

// ---- speaker references ----
assert.deepEqual(speakerRefsOf(stance([e('a', 'x', 'claim'), e('b', 'y', 'claim')]) as Visual), ['a', 'b']);
assert.deepEqual(speakerRefsOf({type: 'notes', heading: 'H', items: [{text: 'a', by: 'b'}, {text: 'c'}]} as Visual), ['b']);
assert.deepEqual(speakerRefsOf({type: 'duo', question: 'Q?'} as Visual), []);
{
  const sp = {a: {name: 'Dana', role: 'Eng', voice: 'af_heart'}, b: {name: 'Omar', role: 'Arch', voice: 'am_michael'}};
  const sc = (id: string, speaker: string, visual: unknown) => ({id, speaker, narration: Array(20).fill('word').join(' '), visual});
  const script = (visuals: unknown[], speakers: unknown = sp) => ({title: 'T', speakers, scenes: visuals.map((v, i) => sc(`s${i + 1}`, i % 2 ? 'b' : 'a', v))});
  const errs = (s: unknown) => { const r = ScriptSchema.safeParse(s); return r.success ? [] : r.error.issues.map((i) => i.message); };
  const dn = {type: 'notes', heading: 'H', items: [{text: 'a', by: 'a'}]};
  assert.deepEqual(errs(script([dn, {type: 'duo', question: 'Q?'}])), []);
  assert.ok(errs(script([{type: 'notes', heading: 'H', items: [{text: 'a', by: 'zed'}]}, dn])).some((m) => /unknown speaker "zed"/.test(m)), 'unknown by');
  assert.ok(errs({title: 'T', scenes: [{id: 's1', narration: Array(20).fill('word').join(' '), visual: dn}]}).some((m) => /no "speakers"/.test(m)), 'by without speakers');
  assert.ok(errs(script([stance([e('q', 'x', 'claim')]), dn])).some((m) => /unknown speaker "q"/.test(m)), 'unknown stance speaker');
  // continues: whiteboard only, carried leading prefix
  const bs = (entries: unknown[], extra: Record<string, unknown> = {}) => ({...sc('s2', 'b', stance(entries)), ...extra});
  const run = (second: Record<string, unknown>, over: Record<string, unknown> = {}) => ({title: 'T', speakers: sp, ...over, scenes: [sc('s1', 'a', stance([e('a', 'x', 'claim')])), second]});
  assert.deepEqual(errs(run(bs([e('a', 'x', 'claim'), e('b', 'y', 'disagree', 0)], {continues: true}))), [], 'a stance run continues on the board');
  assert.ok(errs(run(bs([e('a', 'x', 'claim'), e('b', 'y', 'disagree', 0)], {continues: true}), {layout: 'slides'})).some((m) => /needs the whiteboard layout/.test(m)), 'slides cannot continue');
  assert.ok(errs(run({...bs([e('a', 'other', 'claim')]), continues: true, visual: stance([e('a', 'other', 'claim')], 'Another question?')})).some((m) => /shares no leading/.test(m)), 'a different question carries nothing');
}

// ---- carried slots ----
const S = (entries: unknown[], question = 'Q?') => stance(entries, question) as unknown as Visual;
const open = [e('a', 'x', 'claim'), e('b', 'y', 'disagree', 0)], more = [...open, e('a', 'z', 'claim')];
assert.deepEqual(describe(S(more), S(open)).carried, [true, true, true, false], 'the question and the leading entries carry');
assert.deepEqual(describe(S(more), S(open)).slots, ['Q?', 'x', 'y', 'z']);
assert.deepEqual(describe(S([e('a', 'x', 'claim'), e('b', 'q', 'disagree', 0)]), S(open)).carried, [true, true, false], 'a changed entry ends the run');
assert.deepEqual(describe(S([e('b', 'x', 'claim')]), S([e('a', 'x', 'claim')])).carried, [true, false], 'same text by another speaker is not carried');
assert.deepEqual(describe(S(open), S(open, 'Other?')).carried, [false, false, false], 'another question: nothing carries');
const N = (items: unknown[]) => ({type: 'notes', heading: 'H', items}) as unknown as Visual;
assert.deepEqual(describe(N([{text: 'a', by: 'a'}, {text: 'b'}]), N([{text: 'a', by: 'a'}])).carried, [true, false]);
assert.deepEqual(describe(N([{text: 'a', by: 'b'}]), N([{text: 'a', by: 'a'}])).carried, [false], 'same note by another speaker is not carried');
assert.deepEqual(describe({type: 'duo', question: 'Q?', quote: 'q'} as Visual).slots, ['Q?', 'q']);
assert.deepEqual(describe({type: 'duo', question: 'Q?'} as Visual).slots, ['Q?']);

// ---- lint ----
const lint = (v: unknown, narration = 'x y z', carried?: boolean[]) => lintScene({visual: v as never, narration}, {lang: 'en', mode: '2d', carried});
assert.ok(lint(stance([e('a', 'one', 'claim'), e('b', 'two', 'claim')]), 'one two').warnings.some((w) => /no "disagree" entry/.test(w)), 'stance without a disagree warns');
assert.ok(!lint(stance([e('a', 'one', 'claim')]), 'one').warnings.some((w) => /disagree/.test(w)), 'a lone first entry does not');
assert.ok(!lint(stance(open), 'x and y').warnings.some((w) => /disagree/.test(w)));
assert.ok(lint(stance([e('a', 'one', 'claim'), e('a', 'two', 'disagree', 0)]), 'one two').warnings.some((w) => /one speaker only/.test(w)));
const spoken = [e('a', 'alpha', 'claim'), e('b', 'beta', 'disagree', 0)];
assert.ok(lint(stance(spoken), 'nothing relevant').warnings.some((w) => /entry 1/.test(w)), 'an entry the narration never says warns');
assert.ok(!lint(stance(spoken), 'nothing relevant', [true, true, true]).warnings.some((w) => /entry/.test(w)), 'a carried entry need not be spoken');
assert.ok(lint({type: 'notes', heading: 'H', items: [{text: 'alpha'}]}, 'beta').warnings.some((w) => /note 1/.test(w)));
assert.ok(lint({type: 'duo', question: 'Gate everything?'}, 'unrelated words').warnings.some((w) => /duo question/.test(w)));
assert.ok(lintScene({visual: {type: 'duo', question: 'Q?'} as never, narration: 'q'}, {lang: 'ar', mode: '2d'}).warnings.some((w) => /English only/.test(w)), 'Arabic is flagged');

// ---- the board: a continued scene draws its carried part exactly where the previous scene ended ----
const narration = 'one two three four five six seven eight nine ten eleven twelve';
const words = narration.split(' ').map((w, i) => ({w, start: 0.3 + i * 0.4, end: 0.6 + i * 0.4}));
const base = {narration, leadFrames: 11, durationSec: 6, frames: 11 + 180 + 16, words, sentences: undefined};
const speakers = [{id: 'a', name: 'Dana', role: 'Eng', index: 0}, {id: 'b', name: 'Omar', role: 'Arch', index: 1}];
const mk = (visual: Visual, continues?: true): Scene => ({id: 's', audio: '', ...base, visual, ...(continues ? {continues} : {})}) as Scene;
const key = (it: Item) => (it.kind === 'text' ? `t|${it.str}|${it.x.toFixed(2)}|${it.y.toFixed(2)}|${it.size}|${it.rot.toFixed(4)}` : `s|${it.color}|${it.w}|${it.pts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' ')}`);
const finishedAtStart = (items: Item[]) => items.filter((it) => it.t0 + it.dur <= 0);
for (const [name, a, b, bTimes] of [
  ['stance', S([e('a', 'x', 'claim')]), S([e('a', 'x', 'claim'), e('b', 'y', 'disagree', 0), e('a', 'z', 'claim'), e('b', 'w', 'resolve', 1)]), [0, 0, 1.0, 1.6, 2.2]],
  ['notes', N([{text: 'alpha', by: 'a'}]), N([{text: 'alpha', by: 'a'}, {text: 'beta', by: 'b'}, {text: 'gamma'}]), [0, 1.0, 1.6]],
] as const) {
  const run = [mk(a), mk(b, true)];
  const plans = run.map((_, i) => boardPlan(run, i));
  assert.deepEqual(plans.map((p) => p.nextContinues), [true, false], `${name}: no wipe inside the run`);
  assert.equal(plans[1].ctx.carriedHead, true, `${name}: the heading/question is carried`);
  const draw = (i: number, revealSec?: number[]) => buildBoard(run[i].visual, {...base, revealSec, speakers, speaker: i ? 'b' : 'a', ...plans[i].ctx}, plans[i].seedIndex)!;
  const first = draw(0, [1.0, 1.0]), second = draw(1, [...bTimes]);
  // everything scene 1 finished drawing (it has no later item) is in scene 2 with the same strokes, already finished at frame 0
  const done1 = new Set(first.map(key)), start2 = new Set(finishedAtStart(second).map(key));
  const missing = [...done1].filter((k) => !start2.has(k));
  assert.deepEqual(missing, [], `${name}: carried parts reappear identically, finished at frame 0 (${missing[0]?.slice(0, 80)})`);
  assert.ok(second.some((it) => it.t0 > 0), `${name}: the new parts are still to be drawn`);
  assert.ok(second.every((it) => it.t0 >= 0 || it.t0 + it.dur <= 0), `${name}: nothing is half drawn at frame 0 (a carried item would glide in)`);
  assert.ok(second.some((it) => it.t0 <= CARRIED + 200 && it.t0 < 0), `${name}: carried items start at CARRIED`);
}

// ---- duo: the current speaker is full strength, the other is faded (solid colours) ----
{
  const d = {type: 'duo', question: 'Should we gate every request?', quote: 'One missed check is a breach.'} as Visual;
  const draw = (speaker?: string) => buildBoard(d, {...base, speakers, speaker}, 1)!;
  const colors = (items: Item[]) => new Set(items.filter((it) => it.kind === 'stroke').map((it) => (it as {color: string}).color));
  const lit = colors(draw('a')), other = colors(draw('b'));
  assert.notDeepEqual([...lit].sort(), [...other].sort(), 'who is lit changes the colours');
  assert.deepEqual(draw('a').map(key), draw('a').map(key), 'drawing is deterministic');
  assert.ok(draw(undefined).length > 0, 'a duo without speakers still draws');
}

console.log('dialogue-visuals: ok');
