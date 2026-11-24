// Word comparison shared by the schema and the per-type lint (a leaf: imports nothing, so a meta file can use it without a cycle).
// Mirrors `norm`, `ar_variants` and `word_eq` in timing.py; both sides run tests/vectors/text.json.

/**
 * How narration words and phrases are compared (timing.py does the same): lowercase, Arabic marks (tashkeel, tatweel)
 * dropped, alef forms unified, ى -> ي and ة -> ه, then only Latin letters, digits and Arabic letters kept.
 * Mirrors `norm` in timing.py; both run tests/vectors/text.json.
 */
export const normWord = (w: string) =>
  w.toLowerCase()
    .replace(/[ـً-ٰٟۖ-ۭ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9ء-غف-يٮ-ۓ]/g, '');

/** How mermaid focus names are compared: lowercase, no whitespace. Mirrors norm_name in mermaid_host.py (shared vectors: tests/vectors/text.json). */
// \x1c-\x1f and \x85: Python's \s has them, JS's doesn't (mermaid_host.py norm_name must give the same result).
export const normName = (s: string) => s.toLowerCase().replace(/[\s\x1c-\x1f\x85]+/g, '');

const AR_LETTER = /[ء-يٮ-ۓ]/;
/** An Arabic word with its prefix clitics peeled off in every way (و/ف, then ب/ل/ك, then ال), including itself. Mirrors ar_variants in timing.py. */
export const arVariants = (w: string): Set<string> => {
  const out = new Set([w]);
  let frontier = [w];
  for (const group of ['وف', 'بلك']) {
    const added: string[] = [];
    for (const x of frontier) for (const c of group) if (x.startsWith(c) && x.length - 1 >= 3) added.push(x.slice(1));
    frontier = [...frontier, ...added];
    added.forEach((x) => out.add(x));
  }
  for (const x of [...out]) {
    if (x.startsWith('ال') && x.length - 2 >= 3) out.add(x.slice(2));
    if (x.startsWith('لل') && x.length - 2 >= 3) { out.add(x.slice(2)); out.add('ال' + x.slice(2)); }
  }
  return out;
};
/** Same word? Exact, or (Arabic) one carries prefix clitics the other lacks, e.g. والخادم / الخادم. Mirrors word_eq in timing.py. */
export const sameWord = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (!AR_LETTER.test(a) || !AR_LETTER.test(b)) return false;
  const va = arVariants(a), vb = arVariants(b);
  if (va.has(b) || vb.has(a)) return true;
  return [...va].some((x) => x.length >= 4 && vb.has(x));
};

/** Where a label is spoken, matched in listed order: the first narration word (index in `words`) that matches any of `keys`
 *  AFTER position `prev` (the previous label's match; -1 for none; the word at `prev` itself counts when nothing follows). `late: true` means it is only found at or before `prev`
 *  (spoken earlier than the label before it); null means no word matches at all. A word reused by several labels therefore
 *  matches its own occurrence, not the first one in the narration. */
export const locateInOrder = (words: string[], keys: string[], prev: number): {at: number; late: boolean} | null => {
  const hit = (from: number) => words.findIndex((w, i) => i >= from && keys.some((k) => sameWord(w, k)));
  const after = hit(prev + 1);
  if (after >= 0) return {at: after, late: false};
  if (prev >= 0 && hit(prev) === prev) return {at: prev, late: false}; // the same single word names both labels
  const any = hit(0);
  return any >= 0 ? {at: any, late: true} : null;
};
