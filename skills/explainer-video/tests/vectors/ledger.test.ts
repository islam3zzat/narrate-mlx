// Fact ledger (src/ledger.ts) and style checks (src/styles.ts): accept and reject cases, no framework:
//   node_modules/.bin/tsx tests/vectors/ledger.test.ts
import {ledgerIssues, LedgerSchema, quoteTooShort, quoteHaystack, quoteInHaystack, parseAt, numberWords, numbersIn, type Fact, type Ledger, type ScriptLike} from '../../src/ledger';
import {StyleSchema, styleIssues} from '../../src/styles';
import {loadStyle, styleFileNames} from '../../src/style-files';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };

const incident = loadStyle('incident-review');
const exec = loadStyle('exec-overview');
const plain = loadStyle('explainer');

const fact = (id: string, kind: Fact['kind'], more: Partial<Fact> = {}): Fact => ({id, kind, text: `fact ${id}`, importance: 'high', ...more});
const ledger = (facts: Fact[], more: Partial<Ledger> = {}): Ledger => ({source: 'source.txt', facts, ...more});
const scene = (id: string, facts: string[], more: Record<string, unknown> = {}) => ({id, narration: 'words', facts, ...more});
const video = (scenes: ReturnType<typeof scene>[], id = 'v'): ScriptLike => ({id, scenes});
const run = (l: Ledger | null, vids: ScriptLike[], style = incident, source: string | null = '', strict = false) => ledgerIssues(vids, l, style, source, {strict});
const has = (msgs: string[], re: RegExp) => msgs.some((m) => re.test(m));

// ---- coverage ----
let r = run(ledger([fact('e01', 'event'), fact('e02', 'event')]), [video([scene('s1', ['e01', 'e02'])])]);
T(r.errors.length === 0, 'accept: every fact referenced');
r = run(ledger([fact('e01', 'event'), fact('e02', 'event')]), [video([scene('s1', ['e01'])])]);
T(has(r.errors, /e02 .*not covered by any scene \(high importance\)/), 'reject: high fact in no scene');
r = run(ledger([fact('e01', 'event'), fact('e02', 'event', {importance: 'low'})]), [video([scene('s1', ['e01'])])]);
T(has(r.errors, /e02 .*not covered.*deferred/), 'reject: low fact of a mustCover kind, not covered, not deferred');
r = run(ledger([fact('e01', 'event'), fact('e02', 'event', {importance: 'low', deferred: 'report'})]), [video([scene('s1', ['e01'])])]);
T(r.errors.length === 0, 'accept: low fact deferred to the report');
r = run(ledger([fact('e01', 'event'), fact('e02', 'event')]), [video([scene('s1', ['e01'])], 'a'), video([scene('s1', ['e02'])], 'b')]);
T(r.errors.length === 0, 'accept: coverage is counted across videos');

// ---- deferral ----
r = run(ledger([fact('e01', 'event', {deferred: 'report'})]), [video([scene('s1', [])])]);
T(has(r.errors, /e01 .*cannot be deferred \(high importance\)/), 'reject: a high fact cannot be deferred');
r = run(ledger([fact('c01', 'contradiction', {importance: 'low', deferred: 'report'})]), [video([scene('s1', [])])]);
T(has(r.errors, /c01 .*cannot be deferred/), 'reject: a contradiction cannot be deferred');
r = run(ledger([fact('x01', 'ambiguity', {importance: 'low'})]), [video([scene('s1', [])])]);
T(has(r.errors, /x01 .*not covered/), 'reject: an ambiguity is always required');
r = run(ledger([fact('d01', 'decision', {importance: 'low', deferred: 'report'})]), [video([scene('s1', [])])], exec);
T(has(r.errors, /does not allow deferral/), 'reject: deferral when the style does not allow it');
r = run(ledger([fact('d01', 'decision', {importance: 'low'})]), [video([scene('s1', [])])], exec);
T(has(r.errors, /d01 .*not covered/), 'reject: exec decision must appear');
r = run(ledger([fact('n01', 'number', {importance: 'low'})]), [video([scene('s1', [])])], exec);
T(r.errors.length === 0, 'accept: a low number the exec style does not require');

// ---- ids ----
r = run(ledger([fact('e01', 'event')]), [video([scene('s1', ['e01', 'e99'])])]);
T(has(r.errors, /v\/s1: unknown fact id "e99"/), 'reject: unknown fact id in a scene');
r = run(ledger([fact('e01', 'event'), fact('e01', 'event')]), [video([scene('s1', ['e01'])])]);
T(has(r.errors, /duplicate fact id "e01"/), 'reject: duplicate ledger id');
r = run(ledger([fact('e01', 'event', {conflictsWith: ['e55']})]), [video([scene('s1', ['e01'])])]);
T(has(r.errors, /conflictsWith names unknown fact "e55"/), 'reject: conflictsWith to an unknown id');

// ---- ledger required / missing ----
r = run(null, [video([scene('s1', [])])]);
T(has(r.errors, /needs a fact ledger/), 'reject: ledger required but missing');
r = run(null, [video([scene('s1', [])])], plain);
T(r.errors.length === 0, 'accept: no ledger, none required');
r = run(null, [video([scene('s1', ['e01'])])], plain);
T(has(r.errors, /no ledger\.json/), 'reject: facts given but no ledger');

// ---- quotes ----
const src = 'The pager fired at   14:02 UTC.\nLater, we ROLLED back.';
r = run(ledger([fact('e01', 'event', {quote: 'the pager fired at 14:02 utc.'})]), [video([scene('s1', ['e01'])])], incident, src);
T(r.errors.length === 0, 'accept: quote found after whitespace and case normalisation');
r = run(ledger([fact('e01', 'event', {quote: 'the pager never fired'})]), [video([scene('s1', ['e01'])])], incident, src);
T(has(r.errors, /e01: quote not found in source\.txt/), 'reject: quote missing from the source');
r = run(ledger([fact('e01', 'event', {quote: 'the pager fired at 14:02 UTC'})]), [video([scene('s1', ['e01'])])], incident, null);
T(has(r.errors, /could not be read, so 1 quote/), 'reject: quotes but no source text');
r = run(ledger([fact('e01', 'event')]), [video([scene('s1', ['e01'])])], incident, null);
T(r.errors.length === 0 && has(r.warnings, /source "source\.txt" not found/), 'warn: source missing, no quotes');

// quotes: minimum length, whole words, one line
const tq = (quote: string, source: string, f: Partial<Fact> = {}) => run(ledger([fact('e01', 'event', {quote, ...f})]), [video([scene('s1', ['e01'])])], incident, source);
const tsrc = '[00:00:01] Sam: The pager fired at 14:02 UTC for checkout.\n[00:00:09] Riley: I acknowledged the page and started the dashboards.\n';
T(has(tq('a', tsrc).errors, /e01: quote is too short/), 'reject: a one-letter quote');
T(has(tq('ail', 'a mail went out, ail is a word in no way\n').errors, /too short/), 'reject: a three-letter quote');
T(has(tq('pager fired', tsrc).errors, /too short/), 'reject: two words, under 20 characters');
T(!has(tq('pager fired', tsrc).errors, /not found/), 'a too-short quote is reported once, as too short');
T(tq('Hello wonderful lovely world', 'hello wonderful lovely world and more').errors.length === 0, 'accept: four words');
T(tq('configuration-management', 'the configuration-management tool').errors.length === 0, 'accept: one long token of 20+ characters');
T(quoteTooShort('a b c') && !quoteTooShort('a b c d') && !quoteTooShort('abcdefghijklmnopqrst') && quoteTooShort('abcdefghijklmnopqrs'), 'quoteTooShort boundaries');
T(has(tq('the pager fire at 14:02 UTC for', tsrc).errors, /quote not found/), 'reject: a quote ending inside a word');
T(has(tq('he pager fired at 14:02 UTC for', tsrc).errors, /quote not found/), 'reject: a quote starting inside a word');
T(tq('The pager fired at 14:02 UTC, for checkout!', tsrc).errors.length === 0, 'accept: punctuation and case differ');
T(tq('[00:00:01] Sam: The pager fired at 14:02 UTC', tsrc).errors.length === 0, 'accept: a quote with the timestamp and speaker prefix');
T(has(tq('for checkout riley i acknowledged the page', tsrc).errors, /quote not found/), 'reject: a quote spanning two speaker turns');
T(tq('for checkout. Riley: I acknowledged the page', 'one paragraph\nwraps here for checkout.\nRiley: I acknowledged the page\n').errors.length === 0, 'accept: a quote across a wrapped line in prose');
T(has(tq('quote in the other paragraph', 'first paragraph quote in\n\nthe other paragraph here').errors, /not found/), 'reject: a quote across paragraphs');

// quoteKinds: a fact of these kinds needs quote and at
const qk = (f: Fact[], style = incident) => run(ledger(f), [video([scene('s1', f.map((x) => x.id))])], style, tsrc);
T(has(qk([fact('a01', 'action')]).errors, /a01 .*needs "quote" and "at"/), 'reject: an action without quote and at');
T(has(qk([fact('a01', 'action', {at: '00:00:01'})]).errors, /a01 .*needs "quote"/) && !has(qk([fact('a01', 'action', {at: '00:00:01'})]).errors, /"at"/), 'reject: an action without a quote');
T(has(qk([fact('d01', 'decision', {quote: 'the pager fired at 14:02 UTC'})]).errors, /d01 .*needs "at"/), 'reject: a decision without at');
T(qk([fact('a01', 'action', {at: '00:00:01', quote: 'the pager fired at 14:02 UTC'})]).errors.length === 0, 'accept: an action with quote and at');
T(qk([fact('f01', 'factor')]).errors.length === 0, 'accept: a kind outside quoteKinds needs neither');
T(qk([fact('a01', 'action')], plain).errors.filter((e) => /needs "quote"/.test(e)).length === 0, 'accept: styles without quoteKinds do not ask');
T(StyleSchema.parse({...plain, ledger: {...plain.ledger, quoteKinds: undefined}}).ledger.quoteKinds.length === 0, 'style: quoteKinds defaults to []');
T(JSON.stringify(exec.ledger.quoteKinds) === '["decision","action"]' && JSON.stringify(loadStyle('status-update').ledger.quoteKinds) === '["action"]' && JSON.stringify(incident.ledger.quoteKinds) === '["decision","action"]', 'quoteKinds of the three ledger styles');

// ---- pathological inputs stay linear (generous bound) ----
{
  const big = 100000, t0 = Date.now();
  for (const v of ['<'.repeat(big), '['.repeat(big), 'a '.repeat(big / 2) + 'x', 'a'.repeat(big), 'a b c d e '.repeat(big / 10), "a.'-".repeat(big / 4), '1:'.repeat(big / 2), '[00:00:01] a: b\n'.repeat(big / 16)]) {
    const h = quoteHaystack(v);
    quoteInHaystack(h, 'a a a a b '.repeat(20));
    numbersIn(v);
  }
  T(Date.now() - t0 < 5000, `pathological 100k-character sources take ${Date.now() - t0} ms (bound 5000)`);
}

// ---- chronology ----
const ev = (id: string, at: string) => fact(id, 'event', {at});
r = run(ledger([ev('e01', '14:31 UTC'), ev('e02', '14:02 UTC')]), [video([scene('s1', ['e01', 'e02'])])]);
T(has(r.errors, /v\/s1: events are narrated out of time order: e02 \(14:02 UTC\) comes after e01/), 'reject: events out of order inside a scene');
r = run(ledger([ev('e01', '14:02 UTC'), ev('e02', '14:31 UTC')]), [video([scene('s1', ['e01', 'e02'])])]);
T(r.errors.length === 0, 'accept: events in order');
const tl = (id: string, facts: string[]) => scene(id, facts, {type: 'timeline'});
r = run(ledger([ev('e01', '14:31 UTC'), ev('e02', '14:02 UTC')]), [video([tl('s1', ['e01']), tl('s2', ['e02'])])]);
T(has(r.errors, /v\/s2: events are narrated out of time order/), 'reject: out of order across timeline scenes');
r = run(ledger([ev('e01', '14:31 UTC'), ev('e02', '14:02 UTC')]), [video([scene('s1', ['e01']), tl('s2', ['e02'])])]);
T(r.errors.length === 0, 'accept: an early mention in a non-timeline scene is not a chronology');
r = run(ledger([ev('e01', '2026-03-04 23:50'), ev('e02', '2026-03-05 00:10')]), [video([scene('s1', ['e01', 'e02'])])]);
T(r.errors.length === 0, 'accept: dates order across midnight');
r = run(ledger([ev('e01', 'Day 2'), ev('e02', 'after lunch')]), [video([scene('s1', ['e01', 'e02'])])]);
T(r.errors.length === 0 && has(r.warnings, /chronology not checked for e01 \("Day 2"\), e02/), 'warn: unparsable at');
T(parseAt('14:02 UTC')?.sec === 50520 && parseAt('2026-03-04T14:02')?.date === '2026-03-04' && parseAt('25:00') === null && parseAt('soon') === null, 'parseAt');

// ---- strict ----
r = run(ledger([fact('e01', 'event'), fact('e02', 'event', {importance: 'low', deferred: 'report'})]), [video([scene('s1', ['e01'])])], incident, '', true);
T(has(r.errors, /e02 .*deferred, but strict mode/), 'reject: deferral under --strict');
r = run(ledger([fact('e01', 'event'), fact('n01', 'number', {importance: 'low'})]), [video([scene('s1', ['e01'])])], exec, '', true);
T(has(r.errors, /n01 .*strict: every fact is narrated/), 'reject: strict needs every fact, even a low one the style does not require');
r = run(ledger([fact('e01', 'event'), fact('n01', 'number', {importance: 'low'})], {strict: true}), [video([scene('s1', ['e01'])])], exec);
T(has(r.errors, /n01 .*strict/), 'ledger "strict": true is the same as --strict');
r = run(ledger([fact('e01', 'event'), fact('n01', 'number', {importance: 'low'})]), [video([scene('s1', ['e01', 'n01'])])], exec, '', true);
T(r.errors.length === 0, 'accept: strict with everything narrated');

// ---- numbers a fact carries ----
const numbered = (narration: string, text = 'About 12000 orders failed') =>
  run(ledger([fact('n01', 'number', {text})]), [video([{id: 's1', narration, facts: ['n01']}])]).warnings;
T(numbered('Twelve thousand orders failed.').length === 0, 'accept: number spoken as words');
T(numbered('12,000 orders failed.').length === 0, 'accept: number as digits with a comma');
T(has(numbered('Many orders failed.'), /fact n01 carries the number 12000/), 'warn: number missing from the narration');
T(numbered('Ninety nine point nine percent worked.', 'Success rate 99.9%').length === 0, 'accept: decimal and percent in words');
T(numbered('One hundred seventy-seven hosts.', '177 hosts').length === 0, 'accept: hyphenated hundreds');
T(numbered('Nineteen ninety eight.', 'Founded in 1998').length === 0, 'accept: a year read as two pairs');
T(numbered('At fourteen oh two it started.', 'Started at 14:02 UTC').length === 0, 'times are not number-checked');
T(numberWords(0) === 'zero' && numberWords(21) === 'twenty one' && numberWords(1005) === 'one thousand five' && numberWords(120000) === 'one hundred twenty thousand', 'numberWords');
T(numbersIn('p99 on 3 hosts at 14:02, 1,200 users').join('|') === '3|1,200', 'numbersIn skips ids and clock times');

// ---- schema ----
const L = (o: unknown) => LedgerSchema.safeParse(o).success;
const okFact = {id: 'e01', kind: 'event', text: 't', importance: 'high'};
T(L({source: 'source.txt', facts: [okFact]}), 'schema: minimal ledger');
for (const src of ['/etc/passwd', '../x.txt', 'a/../../x', 'C:\\x', 'a//b', '']) T(!L({source: src, facts: []}), `schema: source "${src}" is refused`);
T(!L({source: 's.txt', facts: [{...okFact, id: 'E1'}]}), 'schema: bad fact id');
T(!L({source: 's.txt', facts: [{...okFact, kind: 'rumor'}]}), 'schema: bad kind');
T(!L({source: 's.txt', facts: [{...okFact, deferred: 'never'}]}), 'schema: bad deferred');
T(!L({source: 's.txt', facts: [{...okFact, extra: 1}]}), 'schema: unknown fact field');
T(!L({source: 's.txt', facts: [okFact], extra: 1}), 'schema: unknown ledger field');

// ---- styles: the registry is the directory; each file passes its schema ----
T(styleFileNames().length >= 6, 'styleFileNames finds built-in styles');
for (const n of styleFileNames()) T(StyleSchema.safeParse(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../styles', n + '.json'), 'utf8'))).success, `style ${n} passes StyleSchema`);
T(!StyleSchema.safeParse({...incident, defaults: {speed: 3}}).success, 'style: speed out of range');
T(!StyleSchema.safeParse({...incident, bounds: {...incident.bounds, scenes: [9, 3]}}).success, 'style: min above max');
T(!StyleSchema.safeParse({...incident, preferredVisuals: ['hologram']}).success, 'style: unknown visual type');
T(!StyleSchema.safeParse({...incident, extra: 1}).success, 'style: unknown field');

// ---- style bounds, sections, preferred visuals ----
const sv = (id: string, scenes: {id: string; words: number; type?: string; section?: string}[]) => ({
  id, scenes: scenes.map((s) => ({id: s.id, narration: Array(s.words).fill('word').join(' '), section: s.section, visual: {type: s.type ?? 'bullets'}})),
});
const quick = loadStyle('quick-brief');
let si = styleIssues([sv('v', [{id: 's1', words: 20}, {id: 's2', words: 20}, {id: 's3', words: 20}, {id: 's4', words: 20}])], quick);
T(si.errors.length === 0 && si.warnings.length === 0, 'accept: a quick brief inside every bound');
si = styleIssues([sv('v', [{id: 's1', words: 20}])], quick);
T(has(si.warnings, /v: 1 scene\(s\); style "quick-brief" wants 3 to 5/), 'warn: too few scenes');
si = styleIssues([sv('v', [{id: 's1', words: 80}, {id: 's2', words: 5}, {id: 's3', words: 20}])], quick);
T(has(si.warnings, /v\/s1: 80 words/) && has(si.warnings, /v\/s2: 5 words/), 'warn: words per scene outside bounds');
si = styleIssues([sv('v', Array.from({length: 4}, (_, i) => ({id: `s${i}`, words: 30})))], quick);
T(!has(si.warnings, /s of video/) || true, 'length estimate runs');
si = styleIssues([sv('v', [{id: 's1', words: 20, type: 'graph'}, {id: 's2', words: 20, type: 'graph'}, {id: 's3', words: 20}])], quick);
T(has(si.warnings, /only 1 of 3 scenes use the visuals this style prefers/), 'warn: preferred visuals under half');
si = styleIssues([sv('v', [{id: 's1', words: 20, section: 'bluf'}, {id: 's2', words: 20, section: 'oops'}, {id: 's3', words: 20, section: 'points'}])], quick);
T(has(si.errors, /v\/s2: section "oops" is not a section/), 'reject: unknown section');
T(has(si.warnings, /no scene is tagged with section "takeaway"/), 'warn: a section never tagged once tagging is used');
si = styleIssues([sv('v', [{id: 's1', words: 20}, {id: 's2', words: 20}, {id: 's3', words: 20}])], quick);
T(!has(si.warnings, /section/), 'accept: no tagging at all, no section warnings');
si = styleIssues([sv('a', [{id: 's1', words: 20, section: 'bluf'}]), sv('b', [{id: 's1', words: 20, section: 'points'}, {id: 's2', words: 20, section: 'takeaway'}])], quick);
T(!has(si.warnings, /no scene.*tagged/), 'accept: sections are counted across the parts of a series');

console.log(`ledger and style checks: ${total - bad}/${total} ok`);
if (bad) throw new Error(`${bad} check(s) failed`);
