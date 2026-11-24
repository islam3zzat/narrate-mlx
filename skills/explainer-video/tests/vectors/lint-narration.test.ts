// Narration lints (src/lint-narration.ts): accept and reject cases per check, no framework:
//   node_modules/.bin/tsx tests/vectors/lint-narration.test.ts
import {lintNarration, numericTokens, sentences, COMMON_ACRONYMS} from '../../src/lint-narration';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };
const run = (narrations: string[], opts: {lang?: 'en' | 'ar'; blameless?: boolean} = {}) =>
  lintNarration(narrations.map((narration, i) => ({id: `s${i + 1}`, narration})), {lang: opts.lang ?? 'en', blameless: opts.blameless}).map((w) => `${w.scene}: ${w.message}`);
const has = (ws: string[], re: RegExp) => ws.some((w) => re.test(w));

// ---- sentences ----
T(sentences('One thing. Another thing! A third? Yes.').length === 4, 'sentences: four');
T(sentences('It costs 3.5 dollars at 14:02 UTC. Done.').length === 2, 'sentences: decimals and times do not split');
T(sentences('Use a tool, e.g. a hammer. Then rest.').length === 2, 'sentences: e.g. does not split');

// ---- 1. numbers per sentence ----
T(numericTokens('At 14:02 the error rate hit 99.9% on 3 hosts').length === 3, 'numericTokens: digits');
T(numericTokens('We saw twenty three errors').join('|') === 'twenty three', 'numericTokens: spelled run is one token');
T(numericTokens('Twenty-three errors and five retries').length === 2, 'numericTokens: hyphenated number is one');
T(numericTokens('three, four, and five').length === 3, 'numericTokens: commas separate');
T(numericTokens('One of them failed').length === 0, 'numericTokens: "one" is not counted');
T(has(run(['At 14:02 the error rate hit 99.9% on 3 hosts.']), /3 numbers in one sentence/), 'reject: three numbers in one sentence');
T(has(run(['It took five minutes, then ten minutes, then twenty minutes.']), /3 numbers/), 'reject: three spelled numbers');
T(run(['At 14:02 the error rate hit 99.9%.']).length === 0, 'accept: two numbers');
T(run(['The error rate hit 99.9%. It started at 14:02. Then 3 hosts joined.']).length === 0, 'accept: three numbers over three sentences');
T(run(['It happened at 14:02 UTC.']).length === 0, 'accept: one number, UTC is common');

// ---- 2. acronyms ----
T(has(run(['The SLO was breached.']), /acronym SLO/), 'reject: SLO never expanded');
T(has(run(['The DNS lookup failed.']), /acronym DNS/), 'reject: DNS never expanded');
T(run(['The service level objective (SLO) was breached. The SLO matters.']).length === 0, 'accept: words then (SLO)');
T(run(['The SLO (service level objective) was breached.']).length === 0, 'accept: SLO then (words)');
T(run(['The service level objective (SLO) was breached.', 'The SLO was missed again.']).length === 0, 'accept: expanded in an earlier scene');
T(run(['The SLO was missed.', 'The SLO was missed again.']).filter((w) => /acronym SLO/.test(w)).length === 1, 'warn once, at first use (scene 1 only)');
T(run(['The SLO was missed.', 'The SLO was missed again.'])[0].startsWith('s1:'), 'warning names the first scene');
T(has(run(['The SLOs were missed.']), /acronym SLO\b/), 'reject: plural SLOs');
T(run(['The SLO was missed. Our service level objective (SLO) says why.']).length === 0, 'accept: expansion later in the same scene');
for (const a of ['TV', 'US', 'UK', 'AI', 'API', 'URL', 'CPU', 'GPU', 'HTTP', 'HTTPS', 'JSON', 'CLI', 'UI', 'OK', 'ID', 'MCP']) {
  T(COMMON_ACRONYMS.has(a) && run([`The ${a} was fine.`]).length === 0, `accept: common acronym ${a}`);
}
T(run(['Nothing here is LOUD, fine.', 'x']).filter((w) => /acronym/.test(w)).length === 1, 'reject: LOUD is read as an acronym (known limit)');
T(run(['A normal sentence with I and a Capital.']).length === 0, 'accept: single capitals and Capitalised words');

// ---- 3. blame (only with blameless: true) ----
const blamey = ['The result was human error.', 'The engineer should have checked.', 'The job failed to start.', 'It was careless.', 'It was the fault of the team.', 'They blamed the intern.', 'Do not blame people.'];
for (const s of blamey) {
  T(run([s]).length === 0, `blame off by default: ${s}`);
  T(has(run([s], {blameless: true}), /blame phrase .*roles? or system/), `reject (blameless): ${s}`);
}
for (const s of ['No blame was assigned.', 'The blameless review found a gap in the deploy pipeline.', 'The pipeline did not validate the config.', 'The blame was shared by the process.']) {
  T(run([s], {blameless: true}).length === 0, `accept (blameless): ${s}`);
}

// ---- 4. long sentences ----
const long = Array.from({length: 31}, () => 'word').join(' ') + '.';
const ok30 = Array.from({length: 30}, () => 'word').join(' ') + '.';
T(has(run([long]), /31-word sentence/), 'reject: 31 words');
T(run([ok30]).length === 0, 'accept: 30 words');
T(run([ok30 + ' ' + ok30]).length === 0, 'accept: two 30-word sentences');

// ---- language: English only ----
T(run([long, 'The SLO was missed at 1, 2 and 3 pm.'], {lang: 'ar', blameless: true}).length === 0, 'Arabic scripts are not checked');

console.log(`narration lint checks: ${total - bad}/${total} ok`);
if (bad) throw new Error(`${bad} check(s) failed`);
