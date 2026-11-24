import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';
import {normWord, sameWord} from '../../words';
import {COLOR_TOKENS, FONT_TOKENS, SIZE_TOKENS, LIMITS} from './parse';

/** Words of a label that can be matched to narration (3+ letters once normalised). */
const keywords = (s: string) => s.split(/\s+/).map(normWord).filter((w) => w.length >= 3);

export const meta: Meta<'svg'> = {
  type: 'svg',
  capabilities,
  docs: {
    fields: "`heading`, `parts[{id, label}]` (1 to 16), `svg` (markup), `caption?`",
    use: "a drawing the other types cannot make (a custom layout, a metaphor, an annotated picture); you write SVG in a strict subset; behind the `svg` feature flag",
    rules: [
      "Behind the `svg` feature flag (off by default): `check`, `render` and `all` reject `svg` scenes unless `NARRATE_FEATURES` includes `svg`. Do not use the type unless it is on.",
      `\`svg\` is one \`<svg viewBox="0 0 1700 560">\` (the scene's box is about 1700 by 560 to 640 px, so those units are pixels: use that viewBox and keep everything inside it with a margin of about 40; text is about 13, 17, 22 and 28 px wide per character for \`small\`, \`body\`, \`label\` and \`title\`, and it is clipped at the edge, not wrapped). Allowed elements: ${['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'].map((t) => `\`${t}\``).join(' ')}. Anything else (\`style\`, \`defs\`, \`image\`, \`use\`, \`script\`, ...), comments, CDATA, DOCTYPE and \`<?xml?>\` is **rejected by \`check\`, not stripped**: rewrite the markup. At most ${LIMITS.bytes / 1024} KB, ${LIMITS.elements} elements, ${LIMITS.depth} levels deep, ${LIMITS.pathChars} characters per path.`,
      `**Parts.** Every \`parts[].id\` must match exactly one top-level \`<g id="...">\` (a direct child of \`<svg>\`), and every top-level \`<g id>\` must be listed. A part appears when the narration says its \`label\` (so write labels from words you narrate; \`cues\` pin them like in other types). **List \`parts\` in the order the narration names them**, not "actors first": reveals are assigned in list order, so a part listed too early or too late appears at the wrong mention (\`check\` warns). Make each label a distinctive word: any word of a label matches, so "red box" and "blue box" would both fire on the first "box". \`caption\` goes inside \`visual\`, not on the scene. Everything outside the part groups, including a top-level \`<g>\` without an id, is drawn from the first frame: use it for axes, frames and backgrounds. \`id\` is allowed only on top-level groups.`,
      `**Colours are names, never values.** \`fill\` and \`stroke\` take ${COLOR_TOKENS.map((t) => `\`${t}\``).join(' ')} or \`none\` (hues: \`primary\` yellow, \`secondary\` pink, \`accent\` green, \`danger\` orange-red, \`muted\` light grey, \`dim\` dark grey; black text is hard to read on \`secondary\`; no hex, \`rgb()\`, CSS colour names or opacity; \`url(\` and \`:\` in any value are rejected). \`stroke-width\` is \`2\` or \`4\` (default 4); joins and caps are fixed square. Defaults: rect, circle, ellipse and polygon get \`fill="panel" stroke="ink"\`; line, polyline and path get \`stroke="ink"\` and (path, polyline) \`fill="none"\`. A filled shape with an ink stroke gets the theme's flat offset shadow, so overlapping filled shapes show their outlines and shadows (there is no union): draw one shape, or use \`stroke="none"\` on the inner one.`,
      `**Text** takes \`x y\`, \`font\` (${FONT_TOKENS.map((t) => `\`${t}\``).join(' ')}), \`size\` (${SIZE_TOKENS.map((t) => `\`${t}\``).join(' ')}: about 22, 28, 36 and 46 px), \`fill\`, \`text-anchor\` (\`start\` \`middle\` \`end\`); at most ${LIMITS.textChars} characters per \`<text>\`; no \`font-family\`, \`font-size\` or \`style\`. Only the five XML entities (\`&amp; &lt; &gt; &quot; &apos;\`) are allowed. Text does not wrap: break lines with several \`<text>\` elements.`,
      "**Lines and arrows.** `arrow=\"end\"` or `\"both\"` on `line`, `polyline` and `path` adds an arrowhead (one ink marker); never write markers. `transform` takes only `translate(x y)`, `scale(s)` and `rotate(deg [cx cy])` with plain numbers. Path data uses `M L H V C S Q T A Z` only; write arc flags as separate numbers.",
      "**How a part appears is chosen for you:** a group made only of lines and unfilled paths draws along its length, a group of only text fades in, anything else pops in. You state what to show, never the effect. `focus` names parts by their `id` (`\"on\": [\"cache\"]`): the others dim, and on a small drawing the camera zooms in. `continues` is not supported. In Arabic videos the geometry is **not mirrored**: draw it right to left yourself (first part on the right). Arabic in `<text>` is shown without vowel marks, and `text-anchor=\"start\"` then extends to the left.",
    ],
  },
  lint: (v, ctx) => {
    const words = ctx.narration.split(/\s+/).map(normWord).filter(Boolean);
    const warnings: string[] = [];
    let prev = -1, prevId = '';
    for (const p of v.parts) {
      const ks = keywords(p.label);
      if (!ks.length) continue;
      const at = words.findIndex((w) => ks.some((k) => sameWord(w, k)));
      if (at < 0) {
        warnings.push(`svg part "${p.id}": its label "${p.label}" shares no word with the narration, so it appears at a guessed time; use words the narration says, or add "cues"`);
        continue;
      }
      // reveal slots are filled in order: a part named earlier than the one listed before it takes a later mention instead
      if (at < prev) warnings.push(`svg part "${p.id}" is listed after "${prevId}" but its label "${p.label}" is spoken first, so it will appear late (at a later mention); list the parts in the order the narration names them`);
      else { prev = at; prevId = p.id; }
    }
    if (ctx.lang === 'ar') {
      warnings.push('svg drawings are not mirrored for Arabic: draw the geometry right to left yourself (first part on the right); vowel marks in <text> are removed on screen, and text-anchor="start" extends to the left');
    }
    return {errors: [], warnings};
  },
  focusTargets: (v) => ({ids: v.parts.map((p) => p.id)}),
};
