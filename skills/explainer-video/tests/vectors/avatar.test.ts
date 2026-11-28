// The speaker avatar (src/sdk/avatar-geom.ts), the speaker-name glyph check and the speakerRefs rules (src/schema.ts), no framework:
//   node_modules/.bin/tsx tests/vectors/avatar.test.ts
import assert from 'node:assert/strict';
import {AVATAR_PX, avatarGeom, speakerInitial} from '../../src/sdk/avatar-geom';
import {ScriptSchema, speakerRefIssues} from '../../src/schema';
import {unsupportedGlyph} from '../../src/whiteboard/glyphs';
import {speakerRefsOf} from '../../src/visuals/registry';

// ---- geometry: pure, seeded from the index, distinct per speaker ----
assert.deepEqual(avatarGeom(0), avatarGeom(0), 'geometry repeats');
assert.notEqual(avatarGeom(0).head, avatarGeom(1).head, 'the two speakers wobble differently');
assert.notEqual(avatarGeom(0).shoulders, avatarGeom(1).shoulders);
for (const i of [0, 1]) {
  const g = avatarGeom(i);
  assert.match(g.head, /^M[-\d. QZ]+Z$/, 'head is one closed path');
  assert.match(g.shoulders, /^M[-\d. CZ]+Z$/, 'shoulders is one closed path');
  const nums = (g.head + g.shoulders).match(/-?\d+(\.\d+)?/g)!.map(Number);
  assert.ok(nums.every((n) => n >= -1 && n <= 101), 'path stays inside the 100x100 box');
  assert.ok(g.badge.cy + g.badge.r <= 100);
}
assert.ok(AVATAR_PX.sm < AVATAR_PX.md, 'two sizes');

// ---- the initial passes the hand-font glyph check ----
for (const [name, want] of [['Dana', 'D'], ['omar', 'O'], ['  Élise', 'É'], ['élise', 'É'], ['"7th"', '7'], ['ß', 'S']] as const) {
  assert.equal(speakerInitial(name), want, `initial of ${JSON.stringify(name)}`);
  assert.equal(unsupportedGlyph(speakerInitial(name)), null);
}
assert.equal(speakerInitial('王老'), '?', 'a name the hand font cannot draw gets "?", never a missing-glyph box');
assert.equal(speakerInitial('...'), '?');

// ---- check rejects speaker names the hand font cannot draw ----
const sc = (id: string, speaker: string) => ({id, speaker, narration: Array(20).fill('word').join(' '), visual: {type: 'bullets', heading: 'H', items: ['a', 'b']}});
const script = (nameA: string) => ({title: 'T', speakers: {a: {name: nameA, role: 'Eng', voice: 'af_heart'}, b: {name: 'Omar', role: 'Arch', voice: 'am_michael'}}, scenes: [sc('s1', 'a'), sc('s2', 'b')]});
const errs = (s: unknown): string[] => { const r = ScriptSchema.safeParse(s); return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`); };
assert.deepEqual(errs(script('Dana')), []);
assert.deepEqual(errs(script('Renée')), [], 'accented Latin is in the hand font');
assert.ok(errs(script('王')).some((m) => /^speakers\.a\.name: .*U\+738B/.test(m)), 'CJK name rejected with its code point');
assert.ok(errs(script('Dana →')).some((m) => /speakers\.a\.name/.test(m)), 'arrow in a name rejected');

// ---- speakerRefs: no built-in type uses it yet, so the rule is tested on a synthetic collection ----
assert.deepEqual(speakerRefsOf({type: 'bullets', heading: 'H', items: ['a']} as never), [], 'types without speakerRefs name nobody');
assert.deepEqual(speakerRefIssues(['a', 'b'], [['a'], [], ['b', 'a', 'a']]), [], 'declared ids pass');
assert.deepEqual(speakerRefIssues(['a', 'b'], [['a'], ['z', 'z']]).map((e) => e.scene), [1], 'an undeclared id is reported once per scene');
assert.match(speakerRefIssues(['a', 'b'], [['z']])[0].message, /unknown speaker "z" \(declared: a, b\)/);
assert.equal(speakerRefIssues(null, [[], ['a'], []]).length, 1, 'by in a video without speakers');
assert.match(speakerRefIssues(null, [['a']])[0].message, /no "speakers"/);
assert.deepEqual(speakerRefIssues(null, [[], []]), [], 'no refs, no speakers: fine');

console.log('avatar checks passed');
