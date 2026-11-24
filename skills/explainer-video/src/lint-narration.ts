// Style checks on what the voice says, across a whole script. Pure (no React, remotion or three), warnings only.
// English only: Arabic narration is not checked (its own rules live in explainer.py check_arabic_narration).
// Wired into `cli.ts validate`; the checks are plain functions of the narration text.

export type NarrationLintOptions = {
  lang: 'en' | 'ar';
  /** Also flag blame phrases (the "blameless" style: say what a role or system did, not who failed). Off by default. */
  blameless?: boolean;
};
export type NarrationWarning = {scene: string; message: string};

/** Most numbers a listener can hold in one sentence. */
export const MAX_NUMBERS_PER_SENTENCE = 2;
/** Longest sentence, in words. */
export const MAX_SENTENCE_WORDS = 30;
/** Acronyms that need no expansion; everything else all-caps (2 to 6 letters) is expanded on first use. */
export const COMMON_ACRONYMS: ReadonlySet<string> = new Set([
  'TV', 'US', 'UK', 'AI', 'API', 'URL', 'CPU', 'GPU', 'HTTP', 'HTTPS', 'JSON', 'CLI', 'UI', 'OK', 'ID', 'MCP',
  'UTC', 'AM', 'PM', 'HTML', 'CSS', 'SQL', 'PDF',
]);
/** Blame phrases for the blameless style: [pattern, what it was]. Wording of the warning asks for roles and systems. */
export const BLAME_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bhuman error\b/i, 'human error'],
  [/\bshould have\b/i, 'should have'],
  [/\bfailed to\b/i, 'failed to'],
  [/\bcareless(?:ly|ness)?\b/i, 'careless'],
  [/\bfault of\b/i, 'fault of'],
  // "blame" as a verb; the noun after a determiner or "no" ("no blame", "the blame") is left alone
  [/(?<!\b(?:no|the|a|any|little|much|all|without)\s)\b(?:blame|blames|blamed|blaming)\b/i, 'blame'],
];

const NUMBER_WORDS = new Set([
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'half', 'dozen',
]);

/** Sentences of a narration, as written. "e.g." and friends do not end one; "3.5" and "14:02" are not split. */
export const sentences = (narration: string): string[] => {
  const t = narration.replace(/\b(e\.g|i\.e|vs|etc|approx|Dr|Mr|Mrs|Ms)\./gi, (m) => m.replace(/\./g, '\u0000'));
  return (t.match(/.+?(?:[.!?]+(?=\s|$)|$)/gs) ?? []).map((s) => s.replace(/\u0000/g, '.').trim()).filter(Boolean);
};

const clean = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const wordsOf = (s: string) => s.split(/\s+/).map(clean).filter(Boolean);
const clip = (s: string) => (s.length > 70 ? s.slice(0, 67) + '...' : s);

/** Numeric tokens of a sentence: anything with a digit ("14:02", "99.9%", "3rd"), and each run of spelled-out numbers ("twenty three") as one. "one" is not counted ("one of"). */
export const numericTokens = (sentence: string): string[] => {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => { if (run.length) out.push(run.join(' ')); run = []; };
  for (const raw of sentence.split(/\s+/)) {
    for (const part of raw.split(/(?<=\p{L})-(?=\p{L})/u)) {
      const w = clean(part);
      if (!w) continue;
      if (/\d/.test(w)) { flush(); out.push(w); }
      else if (NUMBER_WORDS.has(w.toLowerCase())) run.push(w);
      else flush();
    }
    // a comma, colon or full stop ends a run: "three, four" are two numbers, not one
    if (/[,;:]$/.test(raw)) flush();
  }
  flush();
  return out;
};

const ACRONYM = /^[A-Z]{2,6}s?$/;
/** Acronyms in a text (plural "SLOs" counts as SLO), in order of first appearance. */
export const acronymsIn = (text: string): string[] => {
  const seen: string[] = [];
  for (const raw of text.split(/\s+/)) for (const part of raw.split(/[-/]/)) {
    const w = clean(part);
    if (!ACRONYM.test(w)) continue;
    const a = w.replace(/s$/, '');
    if (a.length >= 2 && !seen.includes(a)) seen.push(a);
  }
  return seen;
};
/** Does the text expand `a`: "(SLO)" after the words, or "SLO (service level objective)"? */
export const expands = (text: string, a: string): boolean =>
  new RegExp(`\\(\\s*${a}s?\\s*\\)`).test(text) || new RegExp(`\\b${a}s?\\s*\\([^)]*\\p{L}+[\\s-]+\\p{L}+[^)]*\\)`, 'u').test(text);

/**
 * Warnings for a script's narrations, in scene order. `scenes` is the script's scenes; messages carry no "video/scene: " prefix
 * (the caller adds it, as for the per-type lints).
 */
export const lintNarration = (scenes: readonly {id: string; narration: string}[], opts: NarrationLintOptions): NarrationWarning[] => {
  if (opts.lang !== 'en') return [];
  const out: NarrationWarning[] = [];
  const known = new Set<string>(); // acronyms already expanded (or already warned about) in earlier scenes
  for (const sc of scenes) {
    const warn = (message: string) => out.push({scene: sc.id, message});
    for (const s of sentences(sc.narration)) {
      const nums = numericTokens(s);
      if (nums.length > MAX_NUMBERS_PER_SENTENCE) {
        warn(`${nums.length} numbers in one sentence (${nums.join(', ')}): a listener holds two at most; split the sentence or leave the figures to the picture: "${clip(s)}"`);
      }
      const n = wordsOf(s).length;
      if (n > MAX_SENTENCE_WORDS) warn(`a ${n}-word sentence is hard to follow by ear (over ${MAX_SENTENCE_WORDS}); split it: "${clip(s)}"`);
      if (opts.blameless) {
        for (const [re, what] of BLAME_PATTERNS) {
          if (re.test(s)) warn(`blame phrase "${what}": say what a role or system did and what the process lacked, not who failed ("the on-call engineer", "the deploy pipeline"): "${clip(s)}"`);
        }
      }
    }
    for (const a of acronymsIn(sc.narration)) {
      if (COMMON_ACRONYMS.has(a) || known.has(a)) continue;
      known.add(a); // warn once, at the first use
      if (!expands(sc.narration, a)) warn(`acronym ${a} is used before it is expanded: spell it out the first time ("... (${a})" or "${a} (what it stands for)") or in an earlier scene`);
    }
    // an acronym expanded here counts as known for later scenes even when it came after its first use in the same scene
    for (const a of acronymsIn(sc.narration)) if (expands(sc.narration, a)) known.add(a);
  }
  return out;
};
