import React from 'react';
import {Heading, inStyle, prog} from '../../kit2d';
import {sameType} from '../../continuity';
import type {View2DProps} from '../props';
import type {Edge, Node, NodeProps} from '@xyflow/react';
import {useTheme} from '../../theme';
import type {ClassVisualInput} from './schema';
import {Canvas, fillOf, labelStep, Handles, autoLayout, dotFill, edgeHandles, handleDefs, liftStyle, useAppear, useMotion, type Dir, type LineData, type Tone} from '../../flow';
import {CARRIED, GLIDE_FRAMES, revealFrames} from '../../continuity';
import {linkIn, look, partIn, type FocusEvent} from '../../focus';
import {hasArabic, rtlText, useRtl} from '../../rtl';

const W = 400;
const ROW = 32;
type NodeData = {name: string; stereotype?: string; attributes: string[]; methods: string[]; tone: Tone; at: number; dir: Dir; dim: number; lift: number; rtl: boolean};

const sectionH = (rows: number) => (rows ? rows * ROW + 20 : 0);
const classHeight = (c: {stereotype?: string; attributes: string[]; methods: string[]}) =>
  (c.stereotype ? 92 : 64) + sectionH(c.attributes.length) + sectionH(c.methods.length) + (c.attributes.length + c.methods.length === 0 ? 20 : 0);

const ClassNodeView: React.FC<NodeProps<Node<NodeData>>> = ({data}) => {
  const p = useAppear(data.at);
  const {C, BORDER, FONT, MONO, onAccent, shadow, isAnime} = useTheme();
  const fill = fillOf(C)[data.tone];
  // right to left: a line with Arabic reads right to left from the right edge; a code identifier (Latin) keeps its own left-to-right order
  const rows = (items: string[]) => items.length > 0 && (
    <div style={{padding: '10px 18px', borderTop: `3px solid ${C.ink}`, fontFamily: MONO, fontSize: 22, lineHeight: `${ROW}px`, color: C.ink, textAlign: 'left'}}>
      {items.map((t, i) => <div key={i} style={{whiteSpace: 'nowrap', ...(data.rtl ? (hasArabic(t) ? {direction: 'rtl', textAlign: 'right'} : {direction: 'ltr'}) : {})}}>{t}</div>)}
    </div>
  );
  return (
    <div style={{width: W, boxSizing: 'border-box', background: C.panel, border: `${BORDER}px solid ${C.ink}`, ...(isAnime ? {borderRadius: 10, overflow: 'hidden'} : {}), boxShadow: shadow(8, data.rtl), fontFamily: FONT, opacity: p * data.dim, transform: `translateY(${(1 - p) * 16}px)`, ...rtlText(data.rtl), ...liftStyle(data.lift, 8, data.rtl)}}>
      <div style={{background: fill, color: onAccent(fill), textAlign: 'center', padding: '10px 12px'}}>
        {data.stereotype && <div style={{fontFamily: MONO, fontSize: 20, ...(data.rtl ? {lineHeight: '31px'} : {})}}>{'«'}{data.stereotype}{'»'}</div>}
        <div style={{fontSize: 34, fontWeight: 700, lineHeight: 1.2}}>{data.name}</div>
      </div>
      {rows(data.attributes)}
      {rows(data.methods)}
      <Handles dir={data.dir} />
    </div>
  );
};
const nodeTypes = {klass: ClassNodeView};

// UML end decorations, referenced by id from the edges (defined once as an SVG <defs> next to the canvas).
const Defs: React.FC = () => {
  const {C} = useTheme();
  return (
  <svg width={4} height={4} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
    <defs>
      <marker id="uml-triangle" viewBox="0 0 24 24" refX={22} refY={12} markerWidth={26} markerHeight={26} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M2 2 L22 12 L2 22 Z" fill={C.bg} stroke={C.ink} strokeWidth={3} strokeLinejoin="miter" />
      </marker>
      <marker id="uml-arrow" viewBox="0 0 24 24" refX={22} refY={12} markerWidth={26} markerHeight={26} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M2 2 L22 12 L2 22" fill="none" stroke={C.ink} strokeWidth={3.5} />
      </marker>
      <marker id="uml-diamond" viewBox="0 0 32 24" refX={2} refY={12} markerWidth={34} markerHeight={26} markerUnits="userSpaceOnUse" orient="auto">
        <path d="M2 12 L16 2 L30 12 L16 22 Z" fill={C.ink} stroke={C.ink} strokeWidth={2} />
      </marker>
      <marker id="uml-diamond-hollow" viewBox="0 0 32 24" refX={2} refY={12} markerWidth={34} markerHeight={26} markerUnits="userSpaceOnUse" orient="auto">
        <path d="M2 12 L16 2 L30 12 L16 22 Z" fill={C.bg} stroke={C.ink} strokeWidth={3} />
      </marker>
    </defs>
  </svg>
  );
};

type Rel = ClassVisualInput['relations'][number]['type'];
const REL: Record<Rel, {end?: string; start?: string; dashed?: boolean; flip?: boolean}> = {
  inherits: {end: 'uml-triangle', flip: true},
  implements: {end: 'uml-triangle', dashed: true, flip: true},
  composes: {start: 'uml-diamond'},
  aggregates: {start: 'uml-diamond-hollow'},
  associates: {end: 'uml-arrow'},
  depends: {end: 'uml-arrow', dashed: true},
};

type NormClass = {id: string; name: string; stereotype?: string; attributes: string[]; methods: string[]; tone?: Tone};

// the script JSON reaches Remotion without the schema's defaults applied
const normalise = (raw: ClassVisualInput) => ({...raw, classes: raw.classes.map((c): NormClass => ({...c, attributes: c.attributes ?? [], methods: c.methods ?? []}))});

const layoutOf = (raw: ClassVisualInput, width: number, height: number, rtl: boolean) => {
  const v = normalise(raw);
  return autoLayout(
    v.classes.map((c) => ({id: c.id, w: W, h: classHeight(c)})),
    // parents go above their children: lay out inheritance edges parent -> child
    v.relations.map((r) => (REL[r.type].flip ? {from: r.to, to: r.from, labelW: r.label ? r.label.length * 15 + 30 : 0} : {from: r.from, to: r.to, labelW: r.label ? r.label.length * 15 + 30 : 0})),
    v.direction ?? 'TB', width, height, 1.0, rtl,
  );
};

export const ClassView: React.FC<{visual: ClassVisualInput; prev?: ClassVisualInput; focus?: FocusEvent[]; width: number; height: number; lead: number; audioFrames: number; reveal?: number[]}> = ({visual: raw, prev, focus, width, height, lead, audioFrames, reveal}) => {
  const {C} = useTheme();
  const v = normalise(raw);
  const rtl = useRtl();
  const dir = v.direction ?? 'TB';
  const index = new Map(v.classes.map((c, i) => [c.id, i]));
  const sizes = new Map(v.classes.map((c) => [c.id, {w: W, h: classHeight(c)}]));
  const layout = React.useMemo(() => layoutOf(raw, width, height, rtl), [raw, width, height, rtl]);
  const prevLayout = React.useMemo(() => (prev ? layoutOf(prev, width, height, rtl) : null), [prev, width, height, rtl]);
  const kept = new Set(prev?.classes.map((c) => c.id) ?? []);
  const keptRels = new Set(prev?.relations.map((r) => `${r.from}->${r.to}:${r.type}`) ?? []);
  const ats = revealFrames(v.classes.map((c) => kept.has(c.id)), lead, audioFrames, reveal);
  const {focus: f, position, viewport, edgeFade} = useMotion(layout, prevLayout, sizes, focus, lead, width, height);
  const nodes: Node<NodeData>[] = v.classes.map((c, i) => {
    const l = look(f, partIn(c.id));
    return {
      id: c.id, type: 'klass', position: position(c.id), width: W, height: sizes.get(c.id)!.h,
      handles: handleDefs(dir, W, sizes.get(c.id)!.h),
      data: {name: c.name, stereotype: c.stereotype, attributes: c.attributes, methods: c.methods, tone: c.tone ?? 'neutral', at: ats[i], dir, dim: l.opacity, lift: l.lift, rtl},
    };
  });
  const edges: Edge<LineData>[] = v.relations.map((r, i) => {
    const spec = REL[r.type];
    const a = ats[index.get(r.from)!], b = ats[index.get(r.to)!];
    const at = a === CARRIED && b === CARRIED ? (keptRels.has(`${r.from}->${r.to}:${r.type}`) ? CARRIED : GLIDE_FRAMES + 2) : Math.max(a, b) - 4;
    return {
      id: `r${i}`, source: r.from, target: r.to, type: 'line', ...edgeHandles(layout.reversed(r.from, r.to)),
      markerEnd: spec.end,
      data: {
        label: r.label, dashed: spec.dashed, animate: false, dir, phase: 0, labelStep: labelStep(v.relations, i), markerStart: spec.start ? `url(#${spec.start})` : undefined,
        dot: dotFill(undefined, C), at, dim: look(f, linkIn(r.from, r.to)).opacity,
      },
    };
  });
  return <Canvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} width={width} height={height} viewport={viewport} edgeFade={edgeFade}><Defs /></Canvas>;
};

export const View2D: React.FC<View2DProps<'class'>> = ({visual: v, frame, lead, audioFrames, reveal, prev, focus}) => {
  const {C} = useTheme();
  // a continued diagram is already on screen: no entrance
  const p = prev ? 1 : prog(frame, 2, 10);
  const h = v.caption ? 560 : 640;
  const props = {width: 1700, height: h, lead, audioFrames, reveal, focus};
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{width: 1700, height: h, ...inStyle(p)}}>
        <ClassView visual={v} prev={sameType(v, prev)} {...props} />
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, ...inStyle(p)}}>{v.caption}</div>}
    </div>
  );
};
