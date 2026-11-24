import React from 'react';
import {Heading, inStyle, prog} from '../../kit2d';
import {sameType} from '../../continuity';
import type {View2DProps} from '../props';
import {MarkerType, type Edge, type Node, type NodeProps} from '@xyflow/react';
import {useTheme} from '../../theme';
import type {GraphVisualInput} from './schema';
import {Canvas, fillOf, labelStep, Handles, autoLayout, dotFill, edgeHandles, handleDefs, liftStyle, useAppear, useMotion, type Dir, type LineData, type Tone} from '../../flow';
import {CARRIED, GLIDE_FRAMES, revealFrames} from '../../continuity';
import {linkIn, look, partIn, type FocusEvent} from '../../focus';
import {rtlText, useRtl} from '../../rtl';

const NODE_W = 340;
type NodeData = {label: string; sub?: string; tone: Tone; at: number; dir: Dir; dim: number; lift: number; rtl: boolean};

const GraphNodeView: React.FC<NodeProps<Node<NodeData>>> = ({data}) => {
  const p = useAppear(data.at);
  const {C, BORDER, FONT, MONO, onAccent, shadow, isAnime, cel} = useTheme();
  const fill = fillOf(C)[data.tone];
  return (
    <div style={{
      width: NODE_W, boxSizing: 'border-box', padding: '18px 16px', textAlign: 'center', background: fill, color: onAccent(fill),
      border: `${BORDER}px solid ${C.ink}`, ...(isAnime ? {borderRadius: 10, backgroundImage: `linear-gradient(158deg, transparent 0%, transparent 72%, ${cel.celBand} 72%, ${cel.celBand} 100%)`} : {}),
      boxShadow: isAnime ? `inset 0 4px 0 ${cel.rimLight}, ${shadow(8, data.rtl)}` : shadow(8, data.rtl),
      fontFamily: FONT, opacity: p * data.dim, transform: `translateY(${(1 - p) * 16}px)`,
      ...rtlText(data.rtl), ...liftStyle(data.lift, 8, data.rtl),
    }}>
      <div style={{fontSize: 36, fontWeight: 700, lineHeight: 1.15}}>{data.label}</div>
      {data.sub && <div style={{fontSize: 22, fontFamily: MONO, marginTop: 8, lineHeight: 1.25, opacity: 0.85}}>{data.sub}</div>}
      <Handles dir={data.dir} />
    </div>
  );
};
const nodeTypes = {box: GraphNodeView};

const nodeHeight = (n: {label: string; sub?: string}) => {
  const labelLines = Math.ceil(n.label.length / 14);
  const subLines = n.sub ? Math.ceil(n.sub.length / 20) : 0;
  return 36 + labelLines * 42 + (n.sub ? 8 + subLines * 28 : 0);
};

const layoutOf = (v: GraphVisualInput, width: number, height: number, rtl: boolean) => autoLayout(
  v.nodes.map((nd) => ({id: nd.id, w: NODE_W, h: nodeHeight(nd)})),
  v.edges.map((e) => ({from: e.from, to: e.to, labelW: e.label ? e.label.length * 15 + 30 : 0})),
  v.direction ?? 'LR', width, height, undefined, rtl,
);

export const GraphView: React.FC<{visual: GraphVisualInput; prev?: GraphVisualInput; focus?: FocusEvent[]; width: number; height: number; lead: number; audioFrames: number; reveal?: number[]}> = ({visual: v, prev, focus, width, height, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const {C} = useTheme();
  const FILL = fillOf(C);
  const dir = v.direction ?? 'LR';
  const index = new Map(v.nodes.map((nd, i) => [nd.id, i]));
  const sizes = new Map(v.nodes.map((nd) => [nd.id, {w: NODE_W, h: nodeHeight(nd)}]));
  const layout = React.useMemo(() => layoutOf(v, width, height, rtl), [v, width, height, rtl]);
  const prevLayout = React.useMemo(() => (prev ? layoutOf(prev, width, height, rtl) : null), [prev, width, height, rtl]);
  const kept = new Set(prev?.nodes.map((nd) => nd.id) ?? []);
  const keptEdges = new Set(prev?.edges.map((e) => `${e.from}->${e.to}`) ?? []);
  const ats = revealFrames(v.nodes.map((nd) => kept.has(nd.id)), lead, audioFrames, reveal);
  const {focus: f, position, viewport, edgeFade} = useMotion(layout, prevLayout, sizes, focus, lead, width, height);

  const nodes: Node<NodeData>[] = v.nodes.map((nd, i) => {
    const s = sizes.get(nd.id)!;
    const l = look(f, partIn(nd.id));
    return {
      id: nd.id, type: 'box', position: position(nd.id), width: s.w, height: s.h,
      // explicit size + handle geometry: lets React Flow draw edges on the first frame (no DOM measuring pass)
      handles: handleDefs(dir, s.w, s.h),
      data: {label: nd.label, sub: nd.sub, tone: nd.tone ?? 'neutral', at: ats[i], dir, dim: l.opacity, lift: l.lift, rtl},
    };
  });
  const edges: Edge<LineData>[] = v.edges.map((e, i) => {
    const edgeTone = e.tone;
    const a = ats[index.get(e.from)!], b = ats[index.get(e.to)!];
    // between two carried nodes: shown from the start if the edge was there before, else drawn in once the nodes have moved
    const at = a === CARRIED && b === CARRIED ? (keptEdges.has(`${e.from}->${e.to}`) ? CARRIED : GLIDE_FRAMES + 2) : Math.max(a, b) - 4;
    return {
      id: `e${i}`, source: e.from, target: e.to, type: 'line', ...edgeHandles(layout.reversed(e.from, e.to)),
      markerEnd: {type: MarkerType.ArrowClosed, color: C.ink, width: 16, height: 16},
      data: {
        label: e.label, dashed: e.dashed, animate: v.animate !== false, dir, phase: (i * 0.37) % 1, labelStep: labelStep(v.edges, i),
        dot: dotFill(edgeTone ?? v.nodes[index.get(e.from)!].tone, C), labelFill: edgeTone ? FILL[edgeTone] : undefined,
        at, dim: look(f, linkIn(e.from, e.to)).opacity,
      },
    };
  });
  return <Canvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} width={width} height={height} viewport={viewport} edgeFade={edgeFade} />;
};

export const View2D: React.FC<View2DProps<'graph'>> = ({visual: v, frame, lead, audioFrames, reveal, prev, focus}) => {
  const {C} = useTheme();
  // a continued diagram is already on screen: no entrance
  const p = prev ? 1 : prog(frame, 2, 10);
  const h = v.caption ? 560 : 640;
  const props = {width: 1700, height: h, lead, audioFrames, reveal, focus};
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{width: 1700, height: h, ...inStyle(p)}}>
        <GraphView visual={v} prev={sameType(v, prev)} {...props} />
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, ...inStyle(p)}}>{v.caption}</div>}
    </div>
  );
};
