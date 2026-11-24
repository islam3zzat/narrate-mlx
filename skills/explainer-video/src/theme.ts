import React from 'react';
import t from './theme.json';
import grotesk from './fonts/SpaceGrotesk.ttf';
import monoRegular from './fonts/SpaceMono-Regular.ttf';
import monoBold from './fonts/SpaceMono-Bold.ttf';
import cairo from './fonts/Cairo.ttf';
import {DEFAULT_THEME, THEME_SPECS, THEMES, mixHex, type CelTokens, type Palette, type ThemeName} from './themes';

export {DEFAULT_THEME, THEMES, mixHex, type CelTokens, type Palette, type ThemeName};

// Palette mirrors the blog's neo-brutalist design tokens (hex values from its mermaid theme):
// yellow primary, pink secondary, green accent, black 4px borders, flat offset shadows.
export const C = t.C;
/** Arabic glyphs come from this bundled family; it sits right after the Latin face in each stack, so Latin text and
 * digits keep Space Grotesk / Space Mono and only the glyphs they lack fall through to it. It is registered only for
 * right-to-left videos (loadFonts), so English text is untouched. */
const AR_FAMILY = '"Explainer Arabic"';
const withArabic = (stack: string) => stack.replace(/^("[^"]+")/, `$1, ${AR_FAMILY}`);
export const FONT = withArabic(t.FONT);
export const MONO = withArabic(t.MONO);
export const BORDER = t.BORDER;
export const SHADOW = t.SHADOW;
/** Hard offset shadow, the blog's `shadow-flat`. Mirrored (falls to the left) in right-to-left videos. */
export const shadow = (px = SHADOW, rtl = false) => `${rtl ? -px : px}px ${px}px 0 ${C.ink}`;
export const accents = [C.primary, C.accent, C.secondary, C.danger];
/** Readable text colour on top of an accent fill. */
export const onAccent = (fill: string) => (fill === C.secondary ? '#ffffff' : C.ink);

export type ThemeDef = {
  name: ThemeName;
  isAnime: boolean;
  C: Palette;
  FONT: string;
  MONO: string;
  BORDER: number;
  SHADOW: number;
  cel: CelTokens;
  accents: string[];
  shadow: (px?: number, rtl?: boolean) => string;
  onAccent: (fill: string) => string;
};

const makeTheme = (name: ThemeName): ThemeDef => {
  const s = THEME_SPECS[name];
  const sign = (px: number, rtl: boolean) => (rtl ? -px : px);
  return {
    name: s.name,
    isAnime: s.isAnime,
    C: s.C,
    FONT: withArabic(s.FONT),
    MONO: withArabic(s.MONO),
    BORDER: s.BORDER,
    SHADOW: s.SHADOW,
    cel: s.cel,
    accents: [s.C.primary, s.C.accent, s.C.secondary, s.C.danger],
    shadow: s.isAnime
      ? (px = s.SHADOW, rtl = false) =>
          `${sign(Math.round(px * 0.55), rtl)}px ${Math.round(px * 0.55)}px 0 ${s.cel.shadowTint}, ${sign(px, rtl)}px ${px}px 0 ${s.C.ink}`
      : (px = s.SHADOW, rtl = false) => `${sign(px, rtl)}px ${px}px 0 ${s.C.ink}`,
    onAccent: s.isAnime
      ? (fill: string) => (fill === s.C.secondary || fill === s.C.danger || fill === s.C.ink ? '#ffffff' : s.C.ink)
      : (fill: string) => (fill === s.C.secondary ? '#ffffff' : s.C.ink),
  };
};

const BUILT: Record<ThemeName, ThemeDef> = {
  'cel-sky': makeTheme('cel-sky'),
  paper: makeTheme('paper'),
};

export const getTheme = (name?: ThemeName): ThemeDef => BUILT[name ?? DEFAULT_THEME] ?? BUILT[DEFAULT_THEME];
export const ThemeContext = React.createContext<ThemeDef>(BUILT[DEFAULT_THEME]);
export const useTheme = (): ThemeDef => React.useContext(ThemeContext);

const NO_SPACE = 'U+0021-007E, U+00A1-10FFFF';
const fontsPromises = new Map<boolean, Promise<void>>();
/** Loads Space Grotesk / Space Mono (bundled in src/fonts), plus Cairo for Arabic videos. Resolves even on failure or after 10 s, so a render never stalls on fonts. */
export const loadFonts = (arabic = false): Promise<void> => {
  if (fontsPromises.has(arabic)) return fontsPromises.get(arabic)!;
  const promise = Promise.race([
    Promise.all([
      new FontFace('Space Grotesk', `url(${grotesk})`, {weight: '300 700'}).load(),
      // right to left: Space Mono keeps Latin letters and digits but not the space, which would otherwise be a wide
      // monospace gap between Arabic words (Space Mono has no Arabic, so those glyphs and the space come from Cairo)
      new FontFace('Space Mono', `url(${monoRegular})`, {weight: '400', ...(arabic ? {unicodeRange: NO_SPACE} : {})}).load(),
      new FontFace('Space Mono', `url(${monoBold})`, {weight: '700', ...(arabic ? {unicodeRange: NO_SPACE} : {})}).load(),
      ...(arabic ? [new FontFace('Explainer Arabic', `url(${cairo})`, {weight: '200 1000'}).load()] : []),
    ]).then((faces) => faces.forEach((f) => document.fonts.add(f))),
    new Promise<void>((resolve) => setTimeout(resolve, 10000)),
  ]).catch((e) => console.warn('font load failed, using fallbacks', e));
  fontsPromises.set(arabic, promise);
  return promise;
};
