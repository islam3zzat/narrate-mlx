import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildBoard, type Ctx} from '../../src/whiteboard/layouts';
import {resolveLayout, whiteboardBlockers} from '../../src/whiteboard/eligible';
import {GOCHI_RANGES, WHITEBOARD_DRAWN_TYPES, unsupportedGlyph} from '../../src/whiteboard/glyphs';
import {ScriptSchema} from '../../src/schema';
import type {Visual} from '../../src/types';

/**
 * The whiteboard layouts compute geometry from item counts and measured text widths. Build each one with worst-case
 * content (max item counts, long labels) and assert nothing is placed off the 1920x1080 frame. Node has no canvas, so
 * measure() uses its length-based estimate: this checks the layout arithmetic, not font metrics.
 */
const narration = 'plan first mirror traffic compare results shift slowly then retire the old monolith completely and safely';
const words = narration.split(' ').map((w, i) => ({w, start: 0.3 + i * 0.35, end: 0.6 + i * 0.35}));
const ctx: Ctx = {narration, leadFrames: 11, durationSec: 12, frames: 11 + 360 + 16, words, revealSec: undefined, sentences: undefined};

// Columns this tall cannot be drawn legibly; the layout must hand them back (null) so the normal view draws them.
const tooTall: Visual = {type: 'compare', heading: 'Too tall', columns: [1, 2, 3, 4].map((i) => ({title: `T${i}`, tag: 'tag', items: Array.from({length: 12}, () => 'A line of text that wraps')}))} as Visual;
assert.equal(buildBoard(tooTall, ctx, 1), null, 'compare columns that cannot fit fall back to the normal view');

const long = 'a deliberately long label that keeps going and going';
const cases: Visual[] = [
  {type: 'title', kicker: 'Architecture deep dive', headline: 'Migrating a monolithic billing platform to microservices', sub: 'A careful plan for zero downtime and safe rollbacks and more'},
  {type: 'title', kicker: 'K', headline: 'Short', sub: 'S'},
  {type: 'flow', heading: long, nodes: [1, 2, 3, 4, 5].map((i) => ({label: `Node ${i} ${long}`, sub: `${long} ${long}`}))},
  {type: 'flow', heading: 'One', nodes: [{label: 'Solo'}, {label: 'Duo', sub: 'x'}]},
  {type: 'bullets', heading: 'Eight', items: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Bullet ${i}: ${long} ${long}`)},
  {type: 'bullets', heading: 'One', items: ['Just one']},
  {type: 'steps', heading: 'Six', items: [1, 2, 3, 4, 5, 6].map((i) => `Step ${i}: ${long} ${long}`)},
  {type: 'steps', heading: 'Active', active: 1, items: ['a', 'b', 'c']},
  {type: 'fanout', heading: 'Four', source: {label: long}, targets: [1, 2, 3, 4].map((i) => ({label: `Target ${i} ${long}`, sub: `${long} ${long}`}))},
  {type: 'compare', heading: 'Four', columns: [1, 2, 3, 4].map((i) => ({title: `Option ${i} ${long}`, tag: long, items: ['Independent scaling and releases', long, 'Needs strong observability']}))},
  {type: 'compare', heading: 'Two', columns: [1, 2].map((i) => ({title: `T${i}`, tag: 'tag', items: ['one', 'two']}))},
  {type: 'callout', heading: long + long, big: 'Plan first, mirror traffic, compare results, shift slowly', text: long + ' ' + long + ' ' + long + ' ' + long},
  {type: 'callout', heading: 'H', big: 'One big sentence with no commas at all that wraps onto several lines of the board', text: 'Detail.', tone: 'warn'},
  // no length cap in the schema: huge strings must neither hang nor leave the frame
  {type: 'flow', heading: 'x'.repeat(20000), nodes: [{label: 'word '.repeat(4000), sub: 'word '.repeat(4000)}, {label: 'y'.repeat(20000)}]},
  {type: 'callout', heading: 'x'.repeat(20000), big: 'word '.repeat(4000), text: 'word '.repeat(4000)},
  {type: 'steps', heading: 'S', items: ['word '.repeat(4000), 'z'.repeat(20000)]},
  // multi-megabyte strings (security review): measuring work is bounded, not proportional to the input
  {type: 'compare', heading: 'Huge', columns: [1, 2].map(() => ({title: 't', tag: 'g', items: ['w '.repeat(2_500_000)]}))},
] as Visual[];

const t0 = Date.now();
for (const [n, v] of cases.entries()) {
  const items = buildBoard(v, ctx, n + 1);
  assert.ok(items && items.length > 0, `${v.type} #${n}: builds items`);
  for (const it of items!) {
    if (it.kind === 'text') {
      assert.ok(it.x >= -10 && it.x + it.width <= 1930, `${v.type} #${n}: text "${it.str}" x ${it.x.toFixed(0)}..${(it.x + it.width).toFixed(0)} is off the frame`);
      assert.ok(it.y >= 0 && it.y <= 1010, `${v.type} #${n}: text "${it.str}" y ${it.y.toFixed(0)} is off the content area`);
    } else {
      for (const [x, y] of it.pts) assert.ok(x >= -30 && x <= 1950 && y >= -30 && y <= 1110, `${v.type} #${n}: stroke point ${x.toFixed(0)},${y.toFixed(0)} is off the frame`);
    }
    assert.ok(Number.isFinite(it.t0) && it.dur > 0, `${v.type} #${n}: finite timing`);
    assert.ok(it.t0 + it.dur <= ctx.frames - 14 + 1e-9, `${v.type} #${n}: item still drawing at ${it.t0 + it.dur}, after the wipe starts (${ctx.frames - 14})`);
  }
}

// A very short scene squeezes the late items instead of cutting them off.
{
  const short: Ctx = {...ctx, durationSec: 1.2, frames: 11 + 36 + 16};
  const items = buildBoard(cases[2], short, 1)!;
  assert.ok(items.every((it) => it.t0 + it.dur <= short.frames - 14 && it.dur >= 4), 'short scene: every item finishes before the wipe');
}

// Every hand-drawn type is in WHITEBOARD_DRAWN_TYPES (and the list names nothing buildBoard cannot draw).
for (const type of WHITEBOARD_DRAWN_TYPES) assert.ok(cases.some((v) => v.type === type), `no layout test case for "${type}"`);
for (const v of cases) if (v.type !== 'compare' || v.columns.length < 4) assert.ok(WHITEBOARD_DRAWN_TYPES.includes(v.type), `${v.type} is drawn but not in WHITEBOARD_DRAWN_TYPES`);

// GOCHI_RANGES must be exactly what the bundled font can draw (read its cmap).
{
  const d = fs.readFileSync(path.resolve(process.cwd(), 'src/fonts/GochiHand-Regular.ttf'));
  const tables = new Map<string, number>();
  for (let i = 0; i < d.readUInt16BE(4); i++) tables.set(d.toString('latin1', 12 + 16 * i, 16 + 16 * i), d.readUInt32BE(20 + 16 * i));
  const cmap = tables.get('cmap')!;
  let covered: Set<number> | null = null;
  for (let i = 0; i < d.readUInt16BE(cmap + 2); i++) {
    const pid = d.readUInt16BE(cmap + 4 + 8 * i), eid = d.readUInt16BE(cmap + 6 + 8 * i), off = cmap + d.readUInt32BE(cmap + 8 + 8 * i);
    if (d.readUInt16BE(off) !== 4 || !((pid === 3 && eid === 1) || pid === 0)) continue;
    const segs = d.readUInt16BE(off + 6) / 2;
    covered = new Set();
    for (let k = 0; k < segs; k++) {
      const end = d.readUInt16BE(off + 14 + 2 * k), start = d.readUInt16BE(off + 16 + segs * 2 + 2 * k);
      if (start !== 0xffff) for (let cp = start; cp <= end; cp++) covered.add(cp);
    }
    break;
  }
  assert.ok(covered && covered.size > 100, 'could not read the font cmap');
  const listed = new Set<number>();
  for (const [lo, hi] of GOCHI_RANGES) for (let cp = lo; cp <= hi; cp++) listed.add(cp);
  for (const cp of listed) assert.ok(covered!.has(cp), `GOCHI_RANGES lists U+${cp.toString(16)} but the font has no glyph for it`);
  for (const cp of covered!) assert.ok(listed.has(cp), `the font has U+${cp.toString(16)} but GOCHI_RANGES does not list it`);
}
assert.equal(unsupportedGlyph('Plain text, "quotes" \u2013 caf\u00e9 \u20ac5\nnext line'), null);
assert.equal(unsupportedGlyph('A \u2192 B'), '\u2192');
assert.equal(unsupportedGlyph('done \u2713'), '\u2713');

// Validation: the script schema rejects what the board cannot draw.
{
  const base = (over: Record<string, unknown> = {}, scene: Record<string, unknown> = {}) => ({
    title: 'T', layout: 'whiteboard',
    scenes: [{id: 's01', narration: 'Hello there.', visual: {type: 'title', kicker: 'K', headline: 'H', sub: 'S'}, ...scene}],
    ...over,
  });
  const msgs = (x: unknown) => { const r = ScriptSchema.safeParse(x); return r.success ? [] : r.error.issues.map((i) => i.message); };
  assert.deepEqual(msgs(base()), [], 'a plain whiteboard script is valid');
  assert.deepEqual(msgs(base({theme: 'paper'})), [], 'paper is accepted');
  assert.ok(msgs(base({}, {narration: 'Go \u2192 there.'})).some((m) => m.includes('cannot draw')), 'arrow in narration is rejected');
  assert.ok(msgs(base({}, {visual: {type: 'title', kicker: 'K', headline: 'Done \u2713', sub: 'S'}})).some((m) => m.includes('cannot draw')), 'check mark in a drawn visual is rejected');
  // a fallback type keeps its normal fonts, so its own text is not checked (only the narration is)
  assert.deepEqual(msgs(base({}, {visual: {type: 'table', heading: 'H', headers: ['A', 'B'], rows: [['\u2192', '\u2713']]}})), []);
  assert.ok(!msgs({...base(), layout: undefined, scenes: [{id: 's01', narration: 'Go \u2192 there.', visual: {type: 'title', kicker: 'K', headline: 'H', sub: 'S'}}]}).some((m) => m.includes('cannot draw')), 'slides are unaffected by glyphs');
  assert.ok(msgs(base({language: 'ar'})).some((m) => m.includes('English only')), 'explicit whiteboard + Arabic is rejected');
  assert.deepEqual(msgs({...base(), layout: 'slides', language: 'ar'}).filter((m) => m.includes('English only')), [], 'slides is always allowed');
}

// Automatic layout (no `layout` in the script): the board whenever it can draw the video, else slides.
{
  const sc = (over: Record<string, unknown> = {}) => ({narration: 'Hello there.', visual: {type: 'table'}, ...over});
  const v = (over: Record<string, unknown> = {}, scenes = [sc()]) => ({language: 'en', mode: '2d', scenes, ...over});
  assert.equal(resolveLayout(v()), 'whiteboard', 'default is the board, even for a type it has no drawing for');
  assert.equal(resolveLayout(v({theme: 'paper'})), 'whiteboard');
  assert.equal(resolveLayout(v(), 'slides'), 'slides', 'explicit slides wins');
  assert.equal(resolveLayout(v({language: 'ar'})), 'slides');
  assert.equal(resolveLayout(v({mode: '3d'})), 'slides');
  assert.equal(resolveLayout(v({}, [sc({chapter: 'Part'})])), 'slides');
  assert.equal(resolveLayout(v({}, [sc({continues: true})])), 'slides');
  assert.equal(resolveLayout(v({}, [sc({narration: 'Go \u2192 there.'})])), 'slides');
  assert.equal(whiteboardBlockers(v({language: 'ar'}))[0].kind, 'setup');
  assert.equal(whiteboardBlockers(v({}, [sc({narration: 'Go \u2192 there.'})]))[0].kind, 'glyph');
  assert.equal(resolveLayout({scenes: [sc()]}), 'whiteboard', 'older data files without language or mode');
}

// No content from any example script may be baked into the layouts (emphasis must come from the narration).
const code = fs.readFileSync(path.resolve(process.cwd(), 'src/whiteboard/layouts.ts'), 'utf8');
for (const word of ['gateway', 'Everything', "'request'"]) assert.ok(!code.includes(word), `layouts.ts must not hard-code "${word}"`);

assert.ok(Date.now() - t0 < 5000, `layouts must stay fast on huge input (${Date.now() - t0} ms)`);
console.log(`whiteboard layout tests ok (${cases.length} cases)`);
