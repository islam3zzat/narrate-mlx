// How the vocabulary of the svg subset maps to the theme: the only place a node's tokens become real colours, fonts and
// sizes. Pure (the theme is passed in), so a test can check every output stays inside the palette. Strokes, text and the
// shadow are specified in screen pixels; `scale` is screen pixels per viewBox unit, so they look the same at any viewBox size.
import {DEFAULT_STROKE_WIDTH, type SvgNode} from './parse';
import {mixHex} from '../../themes';

export type Theme = {C: Record<string, string>; FONT: string; MONO: string; BORDER: number; SHADOW: number};
export type Props = Record<string, string | number>;

/** Pixel size of each `size` token (taken from the other views: graph sub, table header, graph label, bullets). */
export const SIZE_PX = {small: 22, label: 28, body: 36, title: 46} as const;
const WEIGHT = {small: 400, label: 700, body: 600, title: 700} as const;

const isHex6 = (c: string): boolean => /^#[0-9a-fA-F]{6}$/.test(c);
/** The theme as it looks at opacity `f` over its background: every colour mixed towards `bg`. Opaque on purpose: a group `opacity` in the SVG
 * made Chromium drop whole groups from some frames when several tabs render (found in a full render, never in stills), so fades are colours. */
export const fadeTheme = (th: Theme, f: number): Theme => {
  if (f >= 1) return th;
  if (!isHex6(th.C.bg)) return th;
  const k = Math.max(0, f);
  const C: Record<string, string> = {};
  for (const [name, c] of Object.entries(th.C)) {
    C[name] = isHex6(c) ? mixHex(th.C.bg, c, k) : c;
  }
  return {...th, C};
};

export const colorOf = (th: Theme, token: unknown): string => {
  if (token === 'none') return 'none';
  const c = typeof token === 'string' ? th.C[token] : undefined;
  if (!c) throw new Error(`unknown colour token ${String(token)}`);
  return c;
};

/** px of a `stroke-width` token (2 stays 2, 4 is the theme's border). */
export const strokePx = (th: Theme, w: unknown): number => (w === 2 ? 2 : th.BORDER ?? DEFAULT_STROKE_WIDTH);

/** SVG presentation props of a shape or text node. */
export const styleOf = (n: SvgNode, th: Theme, scale: number, rtl: boolean): Props => {
  const a = n.attrs;
  const out: Props = {};
  if (a.fill !== undefined) out.fill = colorOf(th, a.fill);
  if (n.tag === 'text' || n.tag === 'tspan') {
    if (a.font !== undefined) out.fontFamily = a.font === 'mono' ? th.MONO : th.FONT;
    if (a.size !== undefined) {
      const k = String(a.size) as keyof typeof SIZE_PX;
      out.fontSize = SIZE_PX[k] / scale;
      out.fontWeight = WEIGHT[k];
    }
    if (a['text-anchor'] !== undefined) out.textAnchor = String(a['text-anchor']);
    if (n.tag === 'text' && rtl) out.direction = 'rtl';
    return out;
  }
  if (a.stroke !== undefined) {
    out.stroke = colorOf(th, a.stroke);
    out.strokeWidth = strokePx(th, a['stroke-width']) / scale;
    out.strokeLinejoin = 'miter';
    out.strokeLinecap = 'square';
  }
  return out;
};

/** The flat offset shadow applies to closed, filled shapes with an ink stroke. */
export const hasShadow = (n: SvgNode): boolean =>
  (n.tag === 'rect' || n.tag === 'circle' || n.tag === 'ellipse' || n.tag === 'polygon') && n.attrs.fill !== 'none' && n.attrs.stroke === 'ink';
/** Shadow offset in viewBox units: down, and right (left when right to left). */
export const shadowOffset = (th: Theme, scale: number, rtl: boolean): {dx: number; dy: number} => ({dx: (rtl ? -th.SHADOW : th.SHADOW) / scale, dy: th.SHADOW / scale});

/** `transform` attribute text of a node (numbers only, built from the parsed list). */
export const transformOf = (n: SvgNode): string | undefined => (n.tf?.length ? n.tf.map((t) => `${t.fn}(${t.args.join(' ')})`).join(' ') : undefined);
