// 2D view of the `svg` visual. The markup was parsed into a checked tree (parse.ts, schema.ts); here the tree becomes React
// SVG elements. Nothing from the markup reaches the DOM as markup: colours, fonts and sizes come from the theme through
// style.ts, and the arrowhead is one marker made here.
import React from 'react';
import {getLength} from '@remotion/paths';
import {useTheme} from '../../theme';
import {Heading, inStyle, prog} from '../../kit2d';
import {camera, look, partIn, useFocus, type Rect} from '../../focus';
import {stripTashkeel, useRtl} from '../../rtl';
import type {View2DProps} from '../props';
import type {SvgNode} from './parse';
import {effectOf, type Effect} from './parse';
import {readDrawing} from './schema';
import {boxOf} from './geometry';
import {popScale, revealFrame, revealProgress} from './reveal';
import {fadeTheme, hasShadow, shadowOffset, styleOf, transformOf, type Theme} from './style';

const W = 1700;
/** Arrowhead length in screen pixels. */
const ARROW_PX = 22;

type Ctx = {scale: number; rtl: boolean; marker: string; th: Theme; shadowColor: string; draw?: number};

const strokeLength = (n: SvgNode): number => {
  const a = n.attrs;
  if (n.tag === 'line') return Math.hypot(Number(a.x2) - Number(a.x1), Number(a.y2) - Number(a.y1));
  if (n.tag === 'polyline') {
    const v = String(a.points).split(' ').map(Number);
    let len = 0;
    for (let i = 2; i + 1 < v.length; i += 2) len += Math.hypot(v[i] - v[i - 2], v[i + 1] - v[i - 1]);
    return len;
  }
  return getLength(String(a.d));
};

const arrowProps = (n: SvgNode, ctx: Ctx, done: boolean): Record<string, string> => {
  const arrow = n.attrs.arrow;
  if (!arrow || !done) return {};
  const url = `url(#${ctx.marker})`;
  return arrow === 'both' ? {markerStart: url, markerEnd: url} : {markerEnd: url};
};

/** One leaf element (and its shadow). `draw` (0..1) is set while a stroke-only part is being drawn. */
const Leaf: React.FC<{n: SvgNode; ctx: Ctx}> = ({n, ctx}) => {
  const tf = transformOf(n);
  const st = styleOf(n, ctx.th, ctx.scale, ctx.rtl) as React.SVGProps<SVGElement>;
  const a = n.attrs;
  if (n.tag === 'text' || n.tag === 'tspan') {
    const kids = n.children.map((c, i) => (c.tag === '#text' ? <React.Fragment key={i}>{ctx.rtl ? stripTashkeel(c.text ?? '') : c.text}</React.Fragment> : <Leaf key={i} n={c} ctx={ctx} />));
    const pos: Record<string, number> = {};
    for (const k of ['x', 'y', 'dx', 'dy']) if (a[k] !== undefined) pos[k] = Number(a[k]);
    return n.tag === 'text'
      ? <text {...pos} {...(st as object)} transform={tf}>{kids}</text>
      : <tspan {...pos} {...(st as object)}>{kids}</tspan>;
  }
  const drawing = ctx.draw !== undefined && ctx.draw < 1;
  let dash: Record<string, number> = {};
  if (drawing) {
    try {
      const L = strokeLength(n);
      dash = {strokeDasharray: L, strokeDashoffset: L * (1 - ctx.draw!)};
    } catch { /* unreadable path: it simply shows in full */ }
  }
  const arrows = arrowProps(n, ctx, !drawing);
  const geo: Record<string, string | number> = {};
  const copy = (...ks: string[]) => ks.forEach((k) => { if (a[k] !== undefined) geo[k] = a[k]; });
  let el: React.ReactElement;
  switch (n.tag) {
    case 'rect': copy('x', 'y', 'width', 'height'); el = <rect {...geo} {...(st as object)} {...dash} transform={tf} />; break;
    case 'circle': copy('cx', 'cy', 'r'); el = <circle {...geo} {...(st as object)} transform={tf} />; break;
    case 'ellipse': copy('cx', 'cy', 'rx', 'ry'); el = <ellipse {...geo} {...(st as object)} transform={tf} />; break;
    case 'line': copy('x1', 'y1', 'x2', 'y2'); el = <line {...geo} {...(st as object)} {...dash} {...arrows} transform={tf} />; break;
    case 'polyline': copy('points'); el = <polyline {...geo} {...(st as object)} {...dash} {...arrows} transform={tf} />; break;
    case 'polygon': copy('points'); el = <polygon {...geo} {...(st as object)} transform={tf} />; break;
    case 'path': copy('d'); el = <path {...geo} {...(st as object)} {...dash} {...arrows} transform={tf} />; break;
    default: return null;
  }
  if (!hasShadow(n)) return el;
  const {dx, dy} = shadowOffset(ctx.th, ctx.scale, ctx.rtl);
  const sh = React.cloneElement(el, {fill: ctx.shadowColor, stroke: ctx.shadowColor});
  return <><g transform={`translate(${dx} ${dy})`}>{sh}</g>{el}</>;
};

const Node: React.FC<{n: SvgNode; ctx: Ctx}> = ({n, ctx}) => {
  if (n.tag === 'g') return <g transform={transformOf(n)}>{n.children.map((c, i) => <Node key={i} n={c} ctx={ctx} />)}</g>;
  return <Leaf n={n} ctx={ctx} />;
};

class Boundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <Invalid /> : this.props.children; }
}

const Invalid: React.FC = () => {
  const {C, BORDER} = useTheme();
  return (
    <div style={{width: W, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `${BORDER}px dashed ${C.ink}`, background: C.primary, fontSize: 38}}>
      Invalid drawing
    </div>
  );
};

const marker = (c: Ctx) => (
  <marker id={c.marker} viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth={ARROW_PX / c.scale} markerHeight={ARROW_PX / c.scale} orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill={c.th.C.ink} stroke="none" />
  </marker>
);

const Drawing: React.FC<{visual: View2DProps<'svg'>['visual']; frame: number; lead: number; audioFrames: number; reveal?: number[]; focus: View2DProps<'svg'>['focus']; height: number}> = ({visual: v, frame, lead, audioFrames, reveal, focus, height}) => {
  const rtl = useRtl();
  const activeTheme = useTheme();
  const svgTheme: Theme = {C: activeTheme.C, FONT: activeTheme.FONT, MONO: activeTheme.MONO, BORDER: activeTheme.BORDER, SHADOW: activeTheme.SHADOW};
  const read = React.useMemo(() => readDrawing(v.svg), [v.svg]);
  const f = useFocus(focus, lead);
  const rawId = React.useId();
  const vb = read.ok ? read.doc.viewBox : null;
  const scale = vb ? Math.min(W / vb.w, height / vb.h) : 1;
  const ox = vb ? (W - vb.w * scale) / 2 : 0;
  const oy = vb ? (height - vb.h * scale) / 2 : 0;
  const geo = React.useMemo(() => {
    if (!read.ok || !vb) return null;
    const boxes = new Map<SvgNode, ReturnType<typeof boxOf>>();
    const rects = new Map<string, Rect>();
    for (const c of read.doc.children) {
      const id = c.tag === 'g' ? c.attrs.id : undefined;
      if (typeof id !== 'string') continue;
      const b = boxOf(c, scale);
      boxes.set(c, b);
      if (b) rects.set(id, {x: ox + (b.x0 - vb.x) * scale, y: oy + (b.y0 - vb.y) * scale, w: (b.x1 - b.x0) * scale, h: (b.y1 - b.y0) * scale});
    }
    return {boxes, rects};
  }, [read, vb, scale, ox, oy]);
  if (!read.ok || !vb || !geo) return <Invalid />;
  const {children} = read.doc;
  const {boxes, rects} = geo;
  const ctx: Ctx = {scale, rtl, th: svgTheme, shadowColor: activeTheme.isAnime ? activeTheme.cel.shadowTint : activeTheme.C.ink, marker: `arrow-${rawId.replace(/[^A-Za-z0-9_-]/g, '')}`};
  const index = new Map(v.parts.map((p, i) => [p.id, i]));
  const rectOf = (s: Set<string>): Rect[] => [...s].flatMap((id) => (rects.has(id) ? [rects.get(id)!] : []));
  const cam = camera(f, rectOf, W, height, scale);
  return (
    <div style={{width: W, height, overflow: cam.s > 1.0001 ? 'hidden' : 'visible'}}>
      <div style={{width: W, height, transformOrigin: '0 0', transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`}}>
        <svg width={W} height={height} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" style={{overflow: 'visible'}}>
          <defs>{marker(ctx)}</defs>
          {children.map((c, i) => {
            const id = c.tag === 'g' && typeof c.attrs.id === 'string' ? c.attrs.id : null;
            if (id === null || !index.has(id)) return <Node key={i} n={c} ctx={ctx} />;
            const effect: Effect = effectOf(c);
            const at = revealFrame(index.get(id)!, v.parts.length, lead, audioFrames, reveal);
            const p = revealProgress(frame, at, effect);
            if (p <= 0) return null;
            const l = look(f, partIn(id));
            const b = boxes.get(c) ?? boxOf(c, scale);
            const k = popScale(frame, at, effect);
            const cx = b ? (b.x0 + b.x1) / 2 : 0, cy = b ? (b.y0 + b.y1) / 2 : 0;
            // opacity is baked into the colours (see fadeTheme), with its own arrowhead marker in the faded ink
            const faded = fadeTheme(svgTheme, (effect === 'draw' ? 1 : p) * l.opacity);
            const pc: Ctx = {...ctx, th: faded, shadowColor: activeTheme.isAnime ? faded.C.dim : faded.C.ink, marker: `${ctx.marker}-${i}`};
            return (
              <g key={i} transform={k !== 1 ? `translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})` : undefined}>
                <defs>{marker(pc)}</defs>
                <g transform={transformOf(c)}>
                  {c.children.map((x, j) => <Node key={j} n={x} ctx={effect === 'draw' ? {...pc, draw: p} : pc} />)}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const View2D: React.FC<View2DProps<'svg'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C} = useTheme();
  const p = prog(frame, 2, 10);
  const h = v.caption ? 560 : 640;
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{width: W, height: h, ...inStyle(p)}}>
        <Boundary><Drawing visual={v} frame={frame} lead={lead} audioFrames={audioFrames} reveal={reveal} focus={focus} height={h} /></Boundary>
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, ...inStyle(p)}}>{v.caption}</div>}
    </div>
  );
};
