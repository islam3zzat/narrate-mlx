// Two-voice dialogue: the script `speakers` / scene `speaker` schema rules (src/schema.ts), the voice list (src/voices.ts) and the
// style `dialogue` checks (src/styles.ts): accept and reject cases, no framework:
//   node_modules/.bin/tsx tests/vectors/dialogue.test.ts
import {ScriptSchema} from '../../src/schema';
import {StyleSchema, styleIssues} from '../../src/styles';
import {loadStyle} from '../../src/style-files';
import {englishVoices} from '../../src/voices';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

const sc = (id: string, speaker?: string, words = 20) => ({id, ...(speaker ? {speaker} : {}), narration: Array(words).fill('word').join(' '), visual: {type: 'bullets', heading: 'H', items: ['a', 'b']}});
const speakers = {a: {name: 'Dana', role: 'Security Engineer', voice: 'af_heart'}, b: {name: 'Omar', role: 'Architect', voice: 'am_michael'}};
const script = (more: Record<string, unknown> = {}) => ({title: 'T', speakers, scenes: [sc('s1', 'a'), sc('s2', 'b'), sc('s3', 'a')], ...more});
const errs = (s: unknown): string[] => { const r = ScriptSchema.safeParse(s); return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`); };
const has = (msgs: string[], re: RegExp) => msgs.some((m) => re.test(m));

// ---- the voice list ----
const voices = englishVoices();
T(voices.includes('af_heart') && voices.includes('am_michael') && !voices.includes('zf_xiaobei'), 'voices: English Kokoro voices only');
T(new Set(voices).size === voices.length, 'voices: no duplicates');

// ---- schema ----
T(errs(script()).length === 0, 'accept: two speakers, every scene has one');
T(errs({title: 'T', scenes: [sc('s1'), sc('s2')]}).length === 0, 'accept: no speakers at all');
T(has(errs(script({speakers: {a: speakers.a}})), /exactly 2/), 'reject: one speaker');
T(has(errs(script({speakers: {...speakers, c: {name: 'X', role: 'Y', voice: 'af_sky'}}})), /exactly 2/), 'reject: three speakers');
T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, voice: 'af_heart'}}})), /share the voice/), 'reject: same voice');
T(has(errs(script({speakers: {a: speakers.a, B: speakers.b}})), /speaker id "B"/), 'reject: uppercase speaker id');
T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, name: ''}}})), /speakers/), 'reject: empty name');
T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, name: 'N'.repeat(25)}}})), /speakers/), 'reject: long name');
T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, role: 'R'.repeat(49)}}})), /speakers/), 'reject: long role');
T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, voice: 'Am Michael'}}})), /voice/), 'reject: malformed voice');
for (const [what, ch] of [['zero-width space', '\u200b'], ['LRM', '\u200e'], ['RLM', '\u200f'], ['RLO', '\u202e'], ['LRI', '\u2066'], ['PDI', '\u2069'], ['soft hyphen', '\u00ad'], ['newline', '\n'], ['tab', '\t'], ['carriage return', '\r'], ['NUL', '\u0000']]) {
  for (const field of ['name', 'role'] as const) T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, [field]: `Om${ch}ar`}}})), new RegExp(`speakers\\.b\\.${field} has`)), `reject: ${what} in speaker ${field}`);
}
T(!has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, role: 'Staff Engineer, Platform (EMEA) - on-call'}}})), /speakers\.b/), 'accept: a plain role with punctuation');
{
  // a huge `speakers` object is rejected by its count; the per-speaker checks never run over its keys
  const many = Object.fromEntries(Array.from({length: 20000}, (_, i) => [`k${i}`, {name: 'N', role: 'R', voice: 'af_heart'}]));
  const t0 = Date.now();
  T(has(errs(script({speakers: many})), /exactly 2 entries \(it has 20000\)/), 'reject: 20000 speakers by count');
  T(Date.now() - t0 < 5000, 'a huge speakers object is rejected quickly');
}
T(has(errs(script({speakers: {a: speakers.a, b: {...speakers.b, extra: 1}}})), /speakers/), 'reject: unknown speaker field');
T(has(errs(script({scenes: [sc('s1', 'a'), sc('s2'), sc('s3', 'a')]})), /scenes\.1\.speaker: needs a "speaker"/), 'reject: a scene without a speaker');
T(has(errs(script({scenes: [sc('s1', 'a'), sc('s2', 'z')]})), /unknown speaker "z"/), 'reject: undeclared speaker');
T(has(errs(script({scenes: [sc('s1', 'a'), sc('s2', 'a')]})), /speaker "b" has no scene/), 'reject: a speaker with no scene');
T(has(errs({title: 'T', scenes: [sc('s1', 'a')]}), /needs "speakers"/), 'reject: speaker without speakers');
T(has(errs(script({language: 'ar'})), /English only/), 'reject: speakers with Arabic');

// ---- style dialogue ----
const podcastLike = StyleSchema.parse({
  ...loadStyle('quick-brief'), name: 'dlg',
  dialogue: {speakers: 2, maxConsecutive: 2, minShare: 0.3},
});
T(!StyleSchema.safeParse({...podcastLike, dialogue: {speakers: 3, maxConsecutive: 2, minShare: 0.3}}).success, 'style: dialogue speakers must be 2');
T(!StyleSchema.safeParse({...podcastLike, dialogue: {speakers: 2, maxConsecutive: 0, minShare: 0.3}}).success, 'style: maxConsecutive >= 1');
T(!StyleSchema.safeParse({...podcastLike, dialogue: {speakers: 2, maxConsecutive: 2, minShare: 0.9}}).success, 'style: minShare <= 0.5');
T(!StyleSchema.safeParse({...podcastLike, dialogue: {speakers: 2, maxConsecutive: 2, minShare: 0.3, extra: 1}}).success, 'style: unknown dialogue field');
const dv = (scenes: [string, number][], withSpeakers = true) => ({
  id: 'v', ...(withSpeakers ? {speakers} : {}),
  scenes: scenes.map(([speaker, words], i) => ({id: `s${i + 1}`, speaker, narration: Array(words).fill('word').join(' '), visual: {type: 'bullets'}})),
});
const dlg = (scenes: [string, number][], withSpeakers = true) => styleIssues([dv(scenes, withSpeakers)], podcastLike);
let r = dlg([['a', 20], ['b', 20], ['a', 20], ['b', 20]]);
T(!has([...r.errors, ...r.warnings], /speak|says only/), 'accept: alternating turns, even shares');
r = dlg([['a', 20], ['b', 20]], false);
T(has(r.errors, /v: style "dlg" is a 2-voice dialogue; .* has 0\)/), 'reject: dialogue style without speakers');
r = dlg([['a', 20], ['a', 20], ['a', 20], ['b', 20]]);
T(has(r.warnings, /v\/s3: "a" speaks 3 scenes in a row/) && r.errors.length === 0, 'warn: three turns in a row');
T(r.warnings.filter((w) => /in a row/.test(w)).length === 1, 'warn: once per script, not per extra turn');
r = dlg([['a', 20], ['a', 20], ['b', 20], ['b', 20]]);
T(!has(r.warnings, /in a row/), 'accept: runs of exactly maxConsecutive');
r = dlg([['a', 80], ['b', 10], ['a', 80], ['b', 10]]);
T(has(r.warnings, /v: "b" says only 11% of the words; style "dlg" wants at least 30%/), 'warn: a speaker under the minimum share');
T(styleIssues([{id: 'v', scenes: [{id: 's1', narration: 'x', visual: {type: 'bullets'}}]}], loadStyle('quick-brief')).errors.length === 0, 'accept: styles without dialogue ignore speakers');

// ---- podcast pictures: duo cap, consecutive duo, stance presence ----
const podcast = StyleSchema.parse(loadStyle('podcast'));
T(podcast.dialogue?.maxDuo === 3 && podcast.dialogue?.stanceFrom === 12, 'podcast: duo cap 3, stance wanted from 12 scenes');
T(['duo', 'stance', 'notes'].every((t) => (podcast.preferredVisuals as string[]).includes(t)), 'podcast: prefers duo, stance and notes');
const pv = (types: string[], withSpeakers = true) => ({
  id: 'v', ...(withSpeakers ? {speakers} : {}),
  scenes: types.map((t, i) => ({id: `s${i + 1}`, speaker: i % 2 ? 'b' : 'a', narration: Array(20).fill('word').join(' '), visual: {type: t}})),
});
const pi = (types: string[]) => styleIssues([pv(types)], podcast);
const body = ['flow', 'compare', 'graph', 'steps', 'callout', 'table', 'sequence', 'flow', 'compare'];
let p = pi(['duo', ...body, 'stance', 'duo', 'notes']);
T(!has(p.warnings, /duo|stance/), 'accept: 2 duo scenes, a stance, 12 scenes');
p = pi(['duo', 'stance', 'flow', 'duo', 'compare', 'duo', 'steps', 'duo', 'notes']);
T(has(p.warnings, /v: 4 "duo" scenes; style "podcast" wants at most 3/), 'warn: more than three duo scenes');
p = pi(['duo', 'duo', 'stance', 'flow', 'compare']);
T(has(p.warnings, /v\/s2: "duo" twice in a row/) && !has(p.warnings, /"duo" scenes/), 'warn: two duo scenes in a row');
p = pi(['duo', ...body, 'notes']);
T(has(p.warnings, /v: 11 scenes/) === false && !has(p.warnings, /no "stance"/), 'accept: no stance in a script under 12 scenes');
p = pi(['duo', ...body, 'flow', 'notes']);
T(has(p.warnings, /v: 12 scenes and no "stance" scene/), 'warn: a script of 12 scenes without a stance');
T(!has(styleIssues([pv(['duo', 'duo', 'duo', 'duo'])], StyleSchema.parse({...podcast, dialogue: {...podcast.dialogue!, maxDuo: undefined}})).warnings, /"duo"/), 'accept: no duo check without maxDuo');
T(!StyleSchema.safeParse({...podcast, dialogue: {...podcast.dialogue, maxDuo: -1}}).success, 'style: maxDuo >= 0');

// ---- dialogue visuals need the video speakers ----
const duoScene = (id: string) => ({id, narration: Array(20).fill('word').join(' '), visual: {type: 'duo', question: 'Q?'}});
T(has(errs({title: 'T', scenes: [duoScene('s1')]}), /scenes\.0\.visual: "duo" shows the two speakers .* no "speakers"/), 'reject: duo without speakers');
T(errs(script({scenes: [{...duoScene('s1'), speaker: 'a'}, sc('s2', 'b')]})).length === 0, 'accept: duo with speakers');
const stanceScene = {id: 's1', narration: 'word', visual: {type: 'stance', question: 'Q?', entries: [{by: 'a', text: 'x', kind: 'claim'}]}};
T(has(errs({title: 'T', scenes: [stanceScene]}), /scenes\.0\.visual: .*"speakers"/), 'reject: stance without speakers');
const notesScene = (by?: string) => ({id: 's1', narration: 'word', visual: {type: 'notes', heading: 'H', items: [{text: 'x', ...(by ? {by} : {})}]}});
T(has(errs({title: 'T', scenes: [notesScene('a')]}), /scenes\.0\.visual: names speaker "a" \(by\), but the script has no "speakers"/), 'reject: notes by without speakers');
T(errs({title: 'T', scenes: [notesScene()]}).length === 0, 'accept: notes without by or speakers');

console.log(`dialogue checks: ${total - bad}/${total} ok`);
if (bad) throw new Error(`${bad} check(s) failed`);
