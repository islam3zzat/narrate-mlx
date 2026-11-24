// Pure shared narration/bidi/RTL lint helpers for visual meta modules (no React/remotion/three imports).
import {locateInOrder, normWord} from '../words';
import {bidiIn} from './chars';

/** Words of a label that can be matched to narration (3+ letters once normalised). */
export const keywords = (s: string): string[] =>
  s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

/** Check that reveal slot labels appear in narration and follow spoken order. */
export const lintOrderedSlots = (
  narration: string,
  slots: readonly {what: string; label: string}[],
  fmt: {
    missed: (what: string, label: string) => string;
    late: (what: string, label: string, prevLabel: string) => string;
  },
): string[] => {
  const words = narration.split(/\s+/).map(normWord).filter(Boolean);
  const warnings: string[] = [];
  let prev = -1;
  let prevLabel = '';
  for (const it of slots) {
    const ks = keywords(it.label);
    if (!ks.length) continue;
    const hit = locateInOrder(words, ks, prev);
    if (!hit) {
      warnings.push(fmt.missed(it.what, it.label));
      continue;
    }
    if (hit.late) {
      warnings.push(fmt.late(it.what, it.label, prevLabel));
    } else {
      prev = hit.at;
      prevLabel = it.label;
    }
  }
  return warnings;
};

/** Emit optional Arabic LTR-layout warning and check text fields for invisible bidi-control characters. */
export const lintRtlAndBidi = (
  lang: 'en' | 'ar',
  opts: {
    prefix: string;
    arWarning?: string;
    texts: readonly [string, string][];
  },
): string[] => {
  const warnings: string[] = [];
  if (lang === 'ar' && opts.arWarning) warnings.push(opts.arWarning);
  for (const [what, t] of opts.texts) {
    const b = bidiIn(t);
    if (b.length) {
      warnings.push(`${opts.prefix} ${what} contains direction-control characters (${b.join(', ')}): check that it reads as intended`);
    }
  }
  return warnings;
};
