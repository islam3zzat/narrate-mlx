// Pure theme definitions (no React, no font/asset imports) so schema.ts and cli.ts can import THEMES safely in Node.
import base from './theme.json';
import celSky from './cel-sky.json';

export const THEMES = ['cel-sky', 'paper'] as const;
export type ThemeName = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeName = 'cel-sky';

export type Palette = {
  bg: string;
  ink: string;
  panel: string;
  muted: string;
  dim: string;
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
};

export type CelTokens = {
  skyTop: string;
  skyMid: string;
  skyBot: string;
  shadowTint: string;
  rimLight: string;
  celBand: string;
  speedline: string;
  halftone: string;
  glow: string;
  captionBg: string;
  captionInk: string;
  captionShadow: string;
  horizonGround: string;
  shaftHighlight: string;
};

export type ThemeSpec = {
  name: ThemeName;
  isAnime: boolean;
  C: Palette;
  FONT: string;
  MONO: string;
  BORDER: number;
  SHADOW: number;
  cel: CelTokens;
};

/** Mix two #rrggbb hex colours by t in [0, 1] (0 = a, 1 = b). */
export const mixHex = (a: string, b: string, t: number): string => {
  const k = Math.max(0, Math.min(1, t));
  const p = (hex: string, off: number) => parseInt(hex.slice(off, off + 2), 16);
  const ch = (off: number) => Math.round(p(a, off) + (p(b, off) - p(a, off)) * k).toString(16).padStart(2, '0');
  return `#${ch(1)}${ch(3)}${ch(5)}`;
};

const DEFAULT_CEL: CelTokens = {
  skyTop: base.C.bg,
  skyMid: base.C.bg,
  skyBot: base.C.bg,
  shadowTint: base.C.ink,
  rimLight: 'rgba(255,255,255,0)',
  celBand: 'rgba(0,0,0,0)',
  speedline: 'rgba(0,0,0,0)',
  halftone: 'rgba(0,0,0,0)',
  glow: base.C.primary,
  captionBg: base.C.primary,
  captionInk: base.C.ink,
  captionShadow: base.C.ink,
  horizonGround: base.C.bg,
  shaftHighlight: base.C.panel,
};

export const THEME_SPECS: Record<ThemeName, ThemeSpec> = {
  paper: {
    name: 'paper',
    isAnime: false,
    C: base.C,
    FONT: base.FONT,
    MONO: base.MONO,
    BORDER: base.BORDER,
    SHADOW: base.SHADOW,
    cel: DEFAULT_CEL,
  },
  'cel-sky': {
    name: 'cel-sky',
    isAnime: true,
    C: celSky.C,
    FONT: base.FONT,
    MONO: base.MONO,
    BORDER: celSky.BORDER,
    SHADOW: celSky.SHADOW,
    cel: celSky.cel,
  },
};
