import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {normWord, locateInOrder} from '../../words';
import {bidiIn} from './schema';

/** Words of a label that can be matched to narration (3+ letters once normalised). Identifiers count both whole ("foobar") and
 *  split the way a voice says them ("foo bar" from fooBar, get_user, retry()). */
const keywords = (s: string) => {
  const parts = s.split(/\s+/).flatMap((w) => [w, ...w.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9\u0600-\u06ff]+/)]);
  return [...new Set(parts.map(normWord).filter((w) => w.length >= 3))];
};

export const meta: Meta<'code'> = {
  type: 'code',
  capabilities,
  docs: {
    fields: "`heading`, `language` (`ts` `tsx` `js` `jsx` `python` `go` `rust` `java` `sql` `bash` `json` `yaml` `diff` `text`), `code`, `highlights[{lines, label}]` (1 to 8), `caption?`",
    use: "a short code excerpt (up to 30 lines) with syntax colouring, where a spotlight moves to the lines the narration is talking about; use `svg` for a drawing and `table` for data",
    rules: [
      "`code` is shown exactly as written: at most 30 lines, 80 display cells per line (East Asian wide characters and emoji count 2) and 2400 characters in all (line breaks not counted), spaces for indentation (a tab is an error), no leading or trailing blank lines and no invisible or direction-changing characters (zero-width and other format characters, blank fillers, variation selectors, bidi controls and control characters are errors; so is a line over 160 UTF-16 units). `heading` is at most 50 characters and `caption` at most 160. Too much is an error, never trimmed, so cut the excerpt to the lines that matter. `text` draws it uncoloured.",
      "Each highlight's `lines` is `\"4\"` or `\"4-6\"` (1-based, inside the code; ranges may overlap or repeat). It takes the spotlight when its `label` is spoken, so say a word of each label in the narration, in the order listed. Before the first highlight the whole excerpt is shown. No `focus`, `continues` or 3D. Keep Arabic, Hebrew and other right-to-left letters out of the code (it is drawn left to right).",
    ],
  },
  lint: (v, ctx) => {
    const words = ctx.narration.split(/\s+/).map(normWord).filter(Boolean);
    const warnings: string[] = [];
    let prev = -1, prevLabel = '';
    v.highlights.forEach((h, i) => {
      const ks = keywords(h.label);
      if (!ks.length) {
        warnings.push(`code highlight ${i + 1}: its label "${h.label}" has no word of 3 or more letters to match against the narration, so it moves at a guessed time; use a label with a real word, or add "cues"`);
        return;
      }
      const hit = locateInOrder(words, ks, prev);
      if (!hit) {
        warnings.push(`code highlight ${i + 1}: its label "${h.label}" shares no word with the narration, so it moves at a guessed time; use words the narration says, or add "cues"`);
        return;
      }
      if (hit.late) warnings.push(`code highlight ${i + 1} "${h.label}" is listed after "${prevLabel}" but is spoken first, so it will move late; list the highlights in the order the narration names them`);
      else { prev = hit.at; prevLabel = h.label; }
    });
    if (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]|[\u{10800}-\u{10fff}]/u.test(v.code)) warnings.push('code contains Arabic, Hebrew or other right-to-left letters: code is drawn left to right in a monospace font, so text in them will look wrong and can reorder the characters around it; keep them in the heading, labels and caption');
    const texts: [string, string][] = [['heading', v.heading], ...v.highlights.map((h, i): [string, string] => [`highlight ${i + 1} label`, h.label]), ...(v.caption ? [['caption', v.caption] as [string, string]] : [])];
    for (const [what, t] of texts) {
      const b = bidiIn(t);
      if (b.length) warnings.push(`code ${what} contains direction-control characters (${b.join(', ')}): fine for Arabic text, but check that it reads as intended`);
    }
    return {errors: [], warnings};
  },
};
