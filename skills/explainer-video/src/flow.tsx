// Shared building blocks for the React Flow based visuals (graph, class) and the dot animation used by sequence too.
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import constants from './constants.json';
import {evolvePath, getLength} from '@remotion/paths';
import {BaseEdge, EdgeLabelRenderer, Handle, Position, ReactFlow, getSmoothStepPath, type Edge, type EdgeProps, type Node} from '@xyflow/react';
import * as dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import {FONT, useTheme, type Palette} from './theme';
import {glide} from './continuity';
import {camera, useFocus, type FocusEvent, type FocusNow, type Rect} from './focus';
import {rtlText, useRtl} from './rtl';

export type Tone = 'neutral' | 'primary' | 'secondary' | 'accent' | 'danger';
export type Dir = 'LR' | 'TB';

export const fillOf = (palette: Palette): Record<Tone, string> => ({neutral: palette.panel, primary: palette.primary, secondary: palette.secondary, accent: palette.accent, danger: palette.danger});
/** Colour of a travelling dot: the tone's fill, with primary standing in for panel. */
export const dotFill = (tone: Tone | undefined, palette: Palette) => (!tone || tone === 'neutral' ? palette.primary : fillOf(palette)[tone]);

/** Fade/slide-in progress of something appearing at frame `at`. */
export const useAppear = (at: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [at, at + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
};

/** Frame at which item i of n appears: spread over the first 80% of the narration. */
export const appearFrame = (i: number, n: number, lead: number, audioFrames: number, reveal?: number[]) =>
  reveal && reveal[i] !== undefined ? lead + Math.round(reveal[i] * constants.fps) : lead + Math.round((i / Math.max(n, 1)) * audioFrames * 0.8);

// ---- dots travelling along a path (a pure function of the frame, so renders are deterministic) ----
export const DOTS = 3;
export const LOOP_FRAMES = 75;
export const DOT_R = 9;
const END = 0.92; // dots stop short of the arrowhead

const PATH_CACHE = new Map<string, {path: SVGPathElement; len: number}>();
const MAX_PATH_CACHE = 256;

export const measurePath = (d: string) => {
  const hit = PATH_CACHE.get(d);
  if (hit) return hit;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const res = {path, len: path.getTotalLength()};
  if (PATH_CACHE.size >= MAX_PATH_CACHE) {
    const oldest = PATH_CACHE.keys().next().value;
    if (oldest !== undefined) PATH_CACHE.delete(oldest);
  }
  PATH_CACHE.set(d, res);
  return res;
};

export const Dots: React.FC<{d: string; frame: number; at: number; color: string; phase?: number; opacity?: number; count?: number}> = ({d, frame, at, color, phase = 0, opacity = 1, count = DOTS}) => {
  const th = useTheme();
  if (frame < at + 10) return null;
  const m = measurePath(d);
  return (
    <>
      {Array.from({length: count}, (_, k) => {
        const u = ((((frame - at) / LOOP_FRAMES + phase + k / count) % 1) + 1) % 1;
        const pt = m.path.getPointAtLength(u * END * m.len);
        const fade = Math.min(1, u / 0.1, (1 - u) / 0.1);
        return <circle key={k} cx={pt.x} cy={pt.y} r={DOT_R} fill={color} stroke={th.C.ink} strokeWidth={3} opacity={fade * opacity} />;
      })}
    </>
  );
};

// ---- handles: every node has a forward pair and a reverse pair, so an edge can enter/leave from the side that faces its other end ----
const sides = (dir: Dir) => (dir === 'LR' ? {start: Position.Left, end: Position.Right} : {start: Position.Top, end: Position.Bottom});
export const handleDefs = (dir: Dir, w: number, h: number) => {
  const {start, end} = sides(dir);
  const at = (pos: Position) => ({x: pos === Position.Left ? 0 : pos === Position.Right ? w : w / 2, y: pos === Position.Top ? 0 : pos === Position.Bottom ? h : h / 2, width: 1, height: 1});
  return [
    {id: 'tgt', type: 'target' as const, position: start, ...at(start)},
    {id: 'src', type: 'source' as const, position: end, ...at(end)},
    {id: 'tgt-r', type: 'target' as const, position: end, ...at(end)},
    {id: 'src-r', type: 'source' as const, position: start, ...at(start)},
  ];
};
export const Handles: React.FC<{dir: Dir}> = ({dir}) => {
  const {start, end} = sides(dir);
  const hidden = {opacity: 0};
  return (
    <>
      <Handle id="tgt" type="target" position={start} style={hidden} isConnectable={false} />
      <Handle id="src" type="source" position={end} style={hidden} isConnectable={false} />
      <Handle id="tgt-r" type="target" position={end} style={hidden} isConnectable={false} />
      <Handle id="src-r" type="source" position={start} style={hidden} isConnectable={false} />
    </>
  );
};
/** Handle ids for an edge: reversed when the source sits after the target along the flow direction. */
export const edgeHandles = (reversed: boolean) => (reversed ? {sourceHandle: 'src-r', targetHandle: 'tgt-r'} : {sourceHandle: 'src', targetHandle: 'tgt'});

// ---- the edge ----
export type LineData = {
  label?: string; dashed?: boolean; at: number; animate: boolean; dot: string; labelFill?: string; dir: Dir; phase: number;
  markerStart?: string; labelStep?: number;
  /** Opacity multiplier from focus (1 = normal, lower = dimmed). */
  dim?: number;
};

/** How many earlier edges point at the same target: those labels are staggered along their paths so they never sit on one spot. */
export const labelStep = (edges: {to: string}[], i: number) => edges.slice(0, i).filter((e) => e.to === edges[i].to).length;

/**
 * Progressive stroke-drawing props for an edge path using `@remotion/paths` (`evolvePath`).
 * Solid edges use `strokeDasharray`/`strokeDashoffset` directly; dashed edges keep their
 * `14 10` dash pattern and reveal via an SVG `<mask>` so dashes never snap at the end.
 */
export const edgeDraw = (
  d: string, p: number, dashed: boolean | undefined, maskId: string, strokeWidth: number,
): {style: React.CSSProperties; maskEl: React.ReactNode} => {
  const base: React.CSSProperties = dashed ? {strokeDasharray: '14 10'} : {};
  if (p <= 0) return {style: {...base, opacity: 0}, maskEl: null};
  if (p >= 1) return {style: base, maskEl: null};
  try {
    if (getLength(d) > 0) {
      const ev = evolvePath(p, d);
      if (!dashed) return {style: ev, maskEl: null};
      const maskEl = (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <path d={d} fill="none" stroke="#fff" strokeWidth={strokeWidth + 6} strokeLinecap="round" {...ev} />
          </mask>
        </defs>
      );
      return {style: {...base, mask: `url(#${maskId})`}, maskEl};
    }
  } catch { /* unreadable path: fall back to full path */ }
  return {style: base, maskEl: null};
};

export const LineEdge: React.FC<EdgeProps<Edge<LineData>>> = ({id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, markerStart}) => {
  const frame = useCurrentFrame();
  const rtl = useRtl();
  const th = useTheme();
  const maskId = React.useId();
  const p = useAppear(data?.at ?? 0);
  const [path] = getSmoothStepPath({sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: th.isAnime ? 12 : 0});
  let label: {x: number; y: number} | null = null;
  if (data?.label) {
    // put the label on the last straight stretch, next to the target, so sibling edges' labels don't pile up on the shared bend
    const m = measurePath(path);
    const half = data.dir === 'LR' ? (data.label.length * 15 + 30) / 2 : 20;
    const stagger = (data.labelStep ?? 0) * (data.dir === 'LR' ? half * 2 + 20 : 56);
    const back = Math.min(Math.min(m.len * 0.5, half + 48) + stagger, m.len * 0.9);
    const pt = m.path.getPointAtLength(Math.max(0, m.len - back));
    label = {x: pt.x, y: pt.y};
  }
  const fill = data?.labelFill ?? th.C.bg;
  const dim = data?.dim ?? 1;
  const op = p * dim;
  const draw = edgeDraw(path, p, data?.dashed, maskId, th.BORDER);
  return (
    <>
      {draw.maskEl}
      <BaseEdge id={id} path={path} markerEnd={p >= 1 ? markerEnd : undefined} markerStart={p > 0 ? (data?.markerStart ?? markerStart) : undefined}
        style={{stroke: th.C.ink, strokeWidth: th.BORDER, opacity: dim, ...draw.style}} />
      {data?.animate && p >= 1 && <Dots d={path} frame={frame} at={data.at} color={data.dot} phase={data.phase} opacity={dim} />}
      {data?.label && label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute', transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)`, opacity: op,
            background: fill, color: th.onAccent(fill), border: `3px solid ${th.C.ink}`, ...(th.isAnime ? {borderRadius: 6} : {}), padding: '2px 12px', fontFamily: th.MONO, fontSize: 24, fontWeight: 700, ...rtlText(rtl),
          }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export const edgeTypes = {line: LineEdge};

// ---- layout ----
export type LayoutNode = {id: string; w: number; h: number};
export type LayoutEdge = {from: string; to: string; labelW?: number};

/**
 * dagre auto-layout, plus a viewport that centres the drawing and scales it to the box. `mirror` (right-to-left videos)
 * flips the finished drawing horizontally: first node on the right for LR, first sibling on the right for TB. It is done
 * on the result, so ranks, edge routing and the glide/focus maths downstream see ordinary positions.
 */
export const autoLayout = (nodes: LayoutNode[], edges: LayoutEdge[], dir: Dir, width: number, height: number, maxZoom = 1.15, mirror = false) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({rankdir: dir, nodesep: 70, ranksep: dir === 'TB' ? 170 : 130, marginx: 20, marginy: 20});
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, {width: n.w, height: n.h}));
  edges.forEach((e) => g.setEdge(e.from, e.to, e.labelW ? {width: e.labelW, height: 36, labelpos: 'c'} : {}));
  dagre.layout(g);
  const {width: gw = 1, height: gh = 1} = g.graph();
  const zoom = Math.min(width / gw, height / gh, maxZoom);
  // screen position along the flow axis, after mirroring: edges whose source sits after their target use the reverse handles
  const centre = (id: string) => (dir === 'LR' ? (mirror ? gw - g.node(id).x : g.node(id).x) : g.node(id).y);
  return {
    positions: new Map(nodes.map((n) => {
      const d = g.node(n.id);
      return [n.id, {x: (mirror ? gw - d.x : d.x) - d.width / 2, y: d.y - d.height / 2}] as const;
    })),
    reversed: (from: string, to: string) => centre(from) > centre(to),
    viewport: {zoom, x: (width - gw * zoom) / 2, y: (height - gh * zoom) / 2},
  };
};

/** Soft edges (0..1) for a zoomed-in view, so parts cut by the box fade out instead of ending in a hard line. */
const fadeMask = (k: number): React.CSSProperties => {
  if (k <= 0) return {};
  const px = Math.round(80 * Math.min(k, 1));
  const g = (to: string) => `linear-gradient(to ${to}, transparent 0, #000 ${px}px, #000 calc(100% - ${px}px), transparent 100%)`;
  const mask = `${g('right')}, ${g('bottom')}`;
  return {maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in'};
};

/** A non-interactive React Flow canvas of a fixed size. */
export const Canvas: React.FC<{nodes: Node[]; edges: Edge[]; nodeTypes: Record<string, any>; width: number; height: number; viewport: Viewport; edgeFade?: number; children?: React.ReactNode}> = ({nodes, edges, nodeTypes, width, height, viewport, edgeFade = 0, children}) => (
  <div style={{width, height, ...fadeMask(edgeFade)}}>
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      // controlled viewport: set every frame, so focus can zoom and a continued scene can move from the previous layout
      width={width} height={height} viewport={viewport} minZoom={0.1} maxZoom={4}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
      panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
      style={{background: 'transparent', fontFamily: FONT}}
    >
      {children}
    </ReactFlow>
  </div>
);

// ---- motion shared by the React Flow diagrams: focus (dim, lift, zoom) and continuity from the previous scene ----
export type Viewport = {x: number; y: number; zoom: number};
type Layout = ReturnType<typeof autoLayout>;

/** Lifted look of a node in focus: a bigger hard shadow and a small shift up-left, as if raised off the page. */
export const liftStyle = (lift: number, base = 8, rtl = false): React.CSSProperties => {
  const th = useTheme();
  return lift > 0 ? {boxShadow: th.shadow(base + 8 * lift, rtl), transform: `translate(${(rtl ? 4 : -4) * lift}px, ${-4 * lift}px)`} : {};
};

/**
 * Per frame: where each node sits and the viewport. A node carried over from the previous scene starts where it was
 * drawn there (same place and size on screen) and moves to its new place over the first GLIDE_FRAMES; the viewport
 * zooms towards focused parts when the diagram is drawn small.
 */
export const useMotion = (layout: Layout, prevLayout: Layout | null, sizes: Map<string, {w: number; h: number}>, focus: FocusEvent[] | undefined, lead: number, width: number, height: number) => {
  const frame = useCurrentFrame();
  const f: FocusNow = useFocus(focus, lead);
  const vp = layout.viewport, z = vp.zoom;
  const pv = prevLayout?.viewport;
  const g = prevLayout ? glide(frame) : 1;
  // continuity: the whole drawing starts at the previous scene's scale (sc0) and eases to its own (1)
  const sc0 = pv ? pv.zoom / z : 1;
  const sc = sc0 + (1 - sc0) * g;
  const position = (id: string) => {
    const p = layout.positions.get(id)!;
    const pp = prevLayout?.positions.get(id);
    if (!pp || !pv) return p;
    // the flow position that, at scale sc0, lands exactly on the node's old screen position
    const q0 = {x: pp.x + pv.x / pv.zoom - vp.x / z, y: pp.y + pv.y / pv.zoom - vp.y / z};
    return {x: q0.x + (p.x - q0.x) * g, y: q0.y + (p.y - q0.y) * g};
  };
  const rectOf = (s: Set<string>): Rect[] => {
    const ids = new Set<string>();
    s.forEach((t) => (t.includes('->') ? t.split('->') : [t]).forEach((x) => ids.add(x)));
    return [...ids].filter((id) => layout.positions.has(id)).map((id) => {
      const p = layout.positions.get(id)!, sz = sizes.get(id)!;
      return {x: z * p.x + vp.x, y: z * p.y + vp.y, w: z * sz.w, h: z * sz.h};
    });
  };
  const cam = camera(f, rectOf, width, height, z);
  // screen = cam.s * sc * (z * flow + vp) + cam.xy
  const k = cam.s * sc;
  const viewport: Viewport = {zoom: k * z, x: k * vp.x + cam.x, y: k * vp.y + cam.y};
  // edges of the box fade once the camera has zoomed in noticeably
  const edgeFade = Math.min(1, Math.max(0, (cam.s - 1) / 0.25));
  return {focus: f, position, viewport, edgeFade};
};
