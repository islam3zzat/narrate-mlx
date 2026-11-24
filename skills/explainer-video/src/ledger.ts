// The fact ledger: what a source (transcript, notes, logs) said, one claim per fact, so a style can require that a video
// covers it. ONE ledger per workdir (<workdir>/ledger.json); coverage counts the scenes of every video in the workdir.
// Pure (no fs, React, remotion or three): explainer.py reads the files and passes the text in; cli.ts validate calls ledgerIssues.
import {z} from 'zod';
import {FACT_KINDS, type FactKind, type StyleDef} from './styles';

const ID = /^[a-z]\d{2,3}$/;
const short = (what: string, max: number) => z.string().trim().min(1).max(max).describe(what);

export const FactSchema = z.strictObject({
  id: z.string().regex(ID, 'fact id must be one letter and two or three digits, e.g. e01 or d012'),
  kind: z.enum(FACT_KINDS),
  text: short('One claim, with its exact numbers', 500),
  at: short('When it happened or was said: an absolute time ("14:02 UTC", "2026-03-04 14:02"); events are checked for order', 40).optional(),
  quote: short('Verbatim from the source, at least 4 words or 20 characters, inside one line (turn) of it; case, spacing and punctuation may differ', 800).optional(),
  importance: z.enum(['high', 'low']),
  status: z.enum(['confirmed', 'reported', 'unknown']).optional().describe('How sure: confirmed (log or two sources), reported (one account), unknown'),
  owner: short('Who owns it (a role or team)', 80).optional(),
  due: short('When it is due', 40).optional(),
  conflictsWith: z.array(z.string().regex(ID)).max(10).optional().describe('Ids of facts this one contradicts'),
  deferred: z.literal('report').optional().describe('Not narrated: left to the report (low importance only, when the style allows)'),
});
export type Fact = z.infer<typeof FactSchema>;

/** A path inside the workdir: relative, no "..", no drive or backslash. explainer.py also refuses symlinks that leave the workdir. */
const relativePath = z.string().min(1).max(300).refine(
  (p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && !p.includes('\0') && !p.split('/').some((s) => s === '..' || s === ''),
  'source must be a relative path inside the workdir (no "..", no leading "/")',
);

export const LedgerSchema = z.strictObject({
  $schema: z.string().optional(),
  source: relativePath.describe('The source text, relative to the workdir (quotes are checked against it)'),
  strict: z.boolean().optional().describe('Same as --strict: no deferral, every fact narrated'),
  facts: z.array(FactSchema).max(2000),
});
export type Ledger = z.infer<typeof LedgerSchema>;

/** `type` is the scene's visual type (the chronology check treats `timeline` scenes as one sequence). */
export type SceneLike = {id: string; narration: string; facts?: string[]; section?: string; type?: string};
export type ScriptLike = {id: string; language?: string; scenes: readonly SceneLike[]};
export type LedgerIssues = {errors: string[]; warnings: string[]};

// ---------------------------------------------------------------- quotes

/** Word tokens of a text, lower case, punctuation dropped (letters, marks and digits of any script stay). Linear. */
const tokens = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
/** A quote must be at least this long (after normalisation) to prove anything: 4 words or 20 characters. */
export const QUOTE_MIN_WORDS = 4, QUOTE_MIN_CHARS = 20;
export const quoteTooShort = (q: string): boolean => { const t = tokens(q); return t.length < QUOTE_MIN_WORDS && t.join(' ').length < QUOTE_MIN_CHARS; };

/**
 * The source as one searchable string: each unit (a line, or a paragraph when most lines are not timestamped / "Name:" turns)
 * becomes " word word word " and units are joined by "\n". A quote " w w w " (no newline) can then only match inside one unit,
 * and only on whole words. One linear pass over the source.
 */
export const quoteHaystack = (source: string): string => {
  const rows = source.replace(/\r\n?/g, '\n').split('\n');
  const filled = rows.filter((r) => r.trim());
  const turn = /^\s*(?:\[[^\]\n]{1,40}\]|\d{1,2}:\d{2}|[^\W\d_][\w.'\u2019-]*(?: [\w.'\u2019-]+){0,4}:\s)/;
  const lineMode = filled.length > 1 && filled.filter((r) => turn.test(r)).length * 2 >= filled.length;
  const units: string[] = [];
  if (lineMode) for (const r of filled) units.push(r);
  else { let cur: string[] = []; for (const r of rows) { if (r.trim()) cur.push(r); else if (cur.length) { units.push(cur.join(' ')); cur = []; } } if (cur.length) units.push(cur.join(' ')); }
  return units.map((u) => ' ' + tokens(u).join(' ') + ' ').join('\n');
};
export const quoteInHaystack = (hay: string, quote: string): boolean => { const t = tokens(quote); return t.length > 0 && hay.includes(' ' + t.join(' ') + ' '); };

// ---------------------------------------------------------------- times

type Clock = {date: string | null; sec: number};
/** "14:02", "14:02:30 UTC", "2026-03-04 14:02" -> a comparable value; null when the text is anything else ("Day 2", "after lunch"). */
export const parseAt = (s: string): Clock | null => {
  const m = /^(?:(\d{4}-\d{2}-\d{2})[T ]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:Z|UTC|GMT)?$/i.exec(s.trim());
  if (!m) return null;
  const [h, mi, se] = [Number(m[2]), Number(m[3]), Number(m[4] ?? 0)];
  if (h > 23 || mi > 59 || se > 59) return null;
  return {date: m[1] ?? null, sec: h * 3600 + mi * 60 + se};
};
const clockKey = (c: Clock) => (c.date ? Date.parse(c.date + 'T00:00:00Z') / 1000 : 0) + c.sec;

// ---------------------------------------------------------------- numbers

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** English words for a whole number below a billion ("one hundred seventy seven"); no hyphens, no "and". */
export const numberWords = (n: number): string => {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
  if (n < 1e6) return numberWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberWords(n % 1000) : '');
  if (n < 1e9) return numberWords(Math.floor(n / 1e6)) + ' million' + (n % 1e6 ? ' ' + numberWords(n % 1e6) : '');
  return String(n);
};
const spokenForms = (token: string): string[] => {
  const t = token.replace(/,/g, '').replace(/%$/, '');
  const [whole, frac] = t.split('.');
  if (!/^\d{1,9}$/.test(whole)) return [];
  const n = Number(whole);
  const base = numberWords(n);
  const forms = [frac ? `${base} point ${[...frac].map((d) => ONES[Number(d)]).join(' ')}` : base];
  if (!frac && n >= 1000 && n <= 2099) forms.push(`${numberWords(Math.floor(n / 100))} ${n % 100 ? (n % 100 < 10 ? 'oh ' : '') + numberWords(n % 100) : 'hundred'}`);
  if (!frac && n === 0) forms.push('no', 'none');
  return forms;
};
/** Numbers in a fact's text that a listener should hear: digits with optional thousands commas, decimals and %. Clock times and ids with letters are skipped. */
export const numbersIn = (text: string): string[] =>
  (text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').match(/(?<![\w.])\d[\d,]*(?:\.\d+)?%?(?![\w])/g) ?? []).map((t) => t.replace(/,(?!\d)/g, ''));

const narrationSaysNumber = (narration: string, token: string): boolean => {
  const plain = token.replace(/,/g, '').replace(/%$/, '');
  const hay = ' ' + narration.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\band\b/g, ' ').replace(/\s+/g, ' ') + ' ';
  const digits = narration.replace(/,(?=\d)/g, '');
  if (new RegExp(`(?<![\\d.])${plain.replace('.', '\\.')}(?![\\d]|\\.\\d)`).test(digits)) return true;
  return spokenForms(token).some((f) => hay.includes(' ' + f + ' '));
};

// ---------------------------------------------------------------- the checks

export type LedgerOptions = {strict?: boolean};

/**
 * Everything about a ledger that can be checked without the files: ids, deferrals, coverage by scenes (across all `scripts`),
 * quotes against the source text, event order. `sourceText` is the source file's text, or null when it could not be read.
 * Errors stop `check`; warnings do not. Messages carry no video prefix except those about one scene ("<video>/<scene>: ...").
 */
export const ledgerIssues = (
  scripts: readonly ScriptLike[],
  ledger: Ledger | null,
  style: StyleDef,
  sourceText: string | null,
  opts: LedgerOptions = {},
): LedgerIssues => {
  const errors: string[] = [], warnings: string[] = [];
  const cfg = style.ledger;
  if (!ledger) {
    if (cfg.required) errors.push(`style "${style.name}" needs a fact ledger: create ledger.json in the workdir (explainer.py init --style ${style.name} writes a stub)`);
    for (const s of scripts) for (const sc of s.scenes) if (sc.facts?.length) errors.push(`${s.id}/${sc.id}: facts ${sc.facts.join(', ')} given but the workdir has no ledger.json`);
    return {errors, warnings};
  }
  const strict = !!(opts.strict || ledger.strict);
  const byId = new Map<string, Fact>();
  for (const f of ledger.facts) {
    if (byId.has(f.id)) errors.push(`ledger: duplicate fact id "${f.id}"`);
    else byId.set(f.id, f);
  }
  for (const f of ledger.facts) for (const c of f.conflictsWith ?? []) if (!byId.has(c)) errors.push(`ledger: ${f.id}: conflictsWith names unknown fact "${c}"`);

  // references, in play order (scripts in the order given, scenes in order)
  const refs = new Map<string, string[]>(); // fact id -> "video/scene" that reference it
  const scenesOf = new Map<string, SceneLike[]>(); // fact id -> referencing scenes
  for (const s of scripts) for (const sc of s.scenes) for (const id of new Set(sc.facts ?? [])) {
    if (!byId.has(id)) { errors.push(`${s.id}/${sc.id}: unknown fact id "${id}" (not in ledger.json)`); continue; }
    if (!refs.has(id)) refs.set(id, []);
    refs.get(id)!.push(`${s.id}/${sc.id}`);
    scenesOf.set(id, [...(scenesOf.get(id) ?? []), sc]);
  }

  const mustCover = new Set<FactKind>(cfg.mustCover);
  const needsScene = (f: Fact) => strict || f.kind === 'contradiction' || f.kind === 'ambiguity' || (cfg.coverHigh && f.importance === 'high');
  const label = (f: Fact) => `${f.id} (${f.kind}, ${f.importance}) "${f.text.length > 60 ? f.text.slice(0, 57) + '...' : f.text}"`;
  for (const f of ledger.facts) {
    const covered = refs.has(f.id);
    if (f.deferred) {
      if (!cfg.allowDeferred) errors.push(`ledger: ${label(f)} is deferred, but style "${style.name}" does not allow deferral: put it in a scene`);
      else if (strict) errors.push(`ledger: ${label(f)} is deferred, but strict mode narrates every fact`);
      else if (needsScene(f)) errors.push(`ledger: ${label(f)} cannot be deferred (${f.kind === 'contradiction' || f.kind === 'ambiguity' ? 'a ' + f.kind + ' is never left out' : 'high importance'}): reference it from a scene`);
    }
    if (covered) continue;
    const deferrable = cfg.allowDeferred && !strict && !needsScene(f);
    if (needsScene(f)) {
      if (!f.deferred) errors.push(`ledger: ${label(f)} is not covered by any scene (${strict ? 'strict: every fact is narrated' : f.kind === 'contradiction' || f.kind === 'ambiguity' ? 'never left out' : 'high importance'}); add its id to a scene's "facts"`);
    } else if (mustCover.has(f.kind) && !(f.deferred && deferrable)) {
      errors.push(`ledger: ${label(f)} is not covered by any scene${deferrable ? ' (reference it, or set "deferred": "report")' : ''}`);
    }
  }

  // quotes against the source
  const quoted = ledger.facts.filter((f) => f.quote);
  if (sourceText === null) {
    if (quoted.length) errors.push(`ledger: source "${ledger.source}" could not be read, so ${quoted.length} quote(s) cannot be checked`);
    else warnings.push(`ledger: source "${ledger.source}" not found`);
  } else {
    const hay = quoteHaystack(sourceText);
    for (const f of quoted) {
      const shown = f.quote!.length > 60 ? f.quote!.slice(0, 57) + '...' : f.quote;
      if (quoteTooShort(f.quote!)) continue;   // reported below, whatever the source says
      if (!quoteInHaystack(hay, f.quote!)) errors.push(`ledger: ${f.id}: quote not found in ${ledger.source} (whole words, inside one line or paragraph): "${shown}"`);
    }
  }
  for (const f of quoted) if (quoteTooShort(f.quote!)) errors.push(`ledger: ${f.id}: quote is too short to prove anything ("${f.quote!.length > 60 ? f.quote!.slice(0, 57) + '...' : f.quote}"): use at least ${QUOTE_MIN_WORDS} words or ${QUOTE_MIN_CHARS} characters`);
  const needQuote = new Set<FactKind>(cfg.quoteKinds);
  for (const f of ledger.facts) if (needQuote.has(f.kind) && (!f.quote || !f.at)) errors.push(`ledger: ${label(f)} needs ${[!f.quote && '"quote"', !f.at && '"at"'].filter(Boolean).join(' and ')} (style "${style.name}" wants a quote and a time for every ${[...needQuote].join('/')})`);

  // chronology: events must be narrated in time order within a scene's list, and across the scenes drawn as a `timeline`
  // (other scenes may mention an event early, e.g. the detection scene before the timeline)
  type Seen = {id: string; at: string; clock: Clock};
  let prevTimeline: Seen | null = null;
  const unparsable: string[] = [];
  for (const s of scripts) for (const sc of s.scenes) {
    let prev: Seen | null = sc.type === 'timeline' ? prevTimeline : null;
    for (const id of new Set(sc.facts ?? [])) {
      const f = byId.get(id);
      if (!f || f.kind !== 'event' || !f.at) continue;
      const c = parseAt(f.at);
      if (!c) { if (!unparsable.includes(`${f.id} ("${f.at}")`)) unparsable.push(`${f.id} ("${f.at}")`); continue; }
      if (prev && (prev.clock.date === null) === (c.date === null) && clockKey(c) < clockKey(prev.clock)) {
        errors.push(`${s.id}/${sc.id}: events are narrated out of time order: ${f.id} (${f.at}) comes after ${prev.id} (${prev.at}); reorder the facts or fix "at"`);
      }
      prev = {id: f.id, at: f.at, clock: c};
    }
    if (sc.type === 'timeline') prevTimeline = prev;
  }
  if (unparsable.length) warnings.push(`ledger: chronology not checked for ${unparsable.join(', ')}: "at" is not a clock time like "14:02 UTC" or "2026-03-04 14:02"`);

  // kinds the style does not use; numbers a fact carries that no referencing scene says
  if (cfg.kinds.length) {
    const odd = [...new Set(ledger.facts.filter((f) => !cfg.kinds.includes(f.kind)).map((f) => f.kind))];
    if (odd.length) warnings.push(`ledger: kind(s) ${odd.join(', ')} are not used by style "${style.name}"`);
  }
  const lang = new Map(scripts.map((s) => [s.id, s.language ?? 'en']));
  for (const f of ledger.facts) {
    const where = refs.get(f.id);
    if (!where || !where.some((w) => lang.get(w.split('/')[0]) === 'en')) continue;
    const scenes = scenesOf.get(f.id)!;
    for (const tok of numbersIn(f.text)) {
      if (!scenes.some((sc) => narrationSaysNumber(sc.narration, tok))) {
        warnings.push(`${where[0]}: fact ${f.id} carries the number ${tok}, but no scene that covers it says it (digits or words); say it aloud and show it`);
      }
    }
  }
  return {errors, warnings};
};
