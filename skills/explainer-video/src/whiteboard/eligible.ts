// Which layout a video gets. The whiteboard is the default; a video falls back to the slide layout only when the board
// cannot draw it (non-English, 3D, a theme other than paper, chapter cards, continued diagrams, or glyphs the hand font
// lacks). Pure (no React, no fonts): schema.ts, frame-schedule.ts, cli.ts and the renderer all resolve through here, so
// they cannot disagree.
import {WHITEBOARD_DRAWN_TYPES, stringsOf, unsupportedGlyph} from './glyphs';

export type Layout = 'whiteboard' | 'slides';

/** `setup` blockers follow from choices the author made (language, mode, theme, chapters); `glyph` ones from the text. */
export type Blocker = {kind: 'setup' | 'glyph'; path: (string | number)[]; message: string};

type Shape = {
  language?: string;
  mode?: string;
  theme?: string;
  scenes: {narration: string; chapter?: string; continues?: boolean; visual: {type: string}}[];
};

export const whiteboardBlockers = (v: Shape): Blocker[] => {
  const out: Blocker[] = [];
  if ((v.language ?? 'en') !== 'en') out.push({kind: 'setup', path: ['layout'], message: 'the whiteboard layout is English only (its handwriting font has no Arabic glyphs and the drawing is left to right)'});
  if ((v.mode ?? '2d') !== '2d') out.push({kind: 'setup', path: ['layout'], message: 'the whiteboard layout is 2D only; remove "mode": "3d" or the layout'});
  if (v.theme !== undefined && v.theme !== 'paper' && v.theme !== 'cel-sky') out.push({kind: 'setup', path: ['theme'], message: 'the whiteboard layout always uses the paper board; remove "theme" or set "paper"'});
  v.scenes.forEach((s, i) => {
    // everything the board draws by hand, plus the narration (drawn as the subtitle), must be in the hand font
    const drawn = WHITEBOARD_DRAWN_TYPES.includes(s.visual.type) ? stringsOf(s.visual) : [];
    const hit = [['narration', s.narration] as const, ...drawn.map((x) => ['visual', x] as const)];
    for (const [where, str] of hit) {
      const bad = unsupportedGlyph(str);
      if (bad) out.push({kind: 'glyph', path: ['scenes', i, where], message: `the whiteboard font cannot draw "${bad}" (U+${bad.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}); use plain letters or punctuation (for example "to" instead of an arrow)`});
    }
    if (s.chapter) out.push({kind: 'setup', path: ['scenes', i, 'chapter'], message: 'chapter cards are not supported by the whiteboard layout'});
    if (s.continues) out.push({kind: 'setup', path: ['scenes', i, 'continues'], message: 'continues is not supported by the whiteboard layout (every scene is drawn fresh on the board)'});
  });
  return out;
};

/**
 * The layout a video renders with. `requested` is the script's `layout`: "slides" always wins; "whiteboard" is honoured
 * as is (schema.ts rejects the combinations that cannot work, so a valid script never reaches here with blockers);
 * absent means automatic: the board unless something blocks it.
 * Note: a theme written as "cel-sky" reads the same as no theme here (explainer.py does not write the default theme
 * into the data file); use `"layout": "slides"` to keep the slide look.
 */
export const resolveLayout = (v: Shape, requested?: Layout): Layout =>
  requested === 'slides' ? 'slides' : requested === 'whiteboard' || whiteboardBlockers(v).length === 0 ? 'whiteboard' : 'slides';
