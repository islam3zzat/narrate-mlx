// Animated mermaid diagrams (any type mermaid-layout.mjs can cut into parts). Each part is its own SVG layer, loaded
// with <Img> (the SVG is untrusted and never inlined) and stacked on the base layer; this component decides, per frame,
// how far each layer has appeared and whether it is in focus. Pure function of the frame: no CSS transitions/keyframes.
import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {getLength, getPointAtLength, getTangentAtLength} from '@remotion/paths';
import {useTheme} from '../../theme';
import {MermaidLayout, type MermaidLayoutT} from './schema';
import {normName} from '../../schema';
import {revealOrder} from './semantics';
import {look, useFocus, type FocusEvent} from '../../focus';
import {Heading, at, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

type Part = MermaidLayoutT['parts'][number];

/** Parses the layout from the data file; null (show the static SVG instead) when it is missing or malformed. */
export const parseLayout = (raw: unknown): MermaidLayoutT | null => {
  if (!raw) return null;
  const r = MermaidLayout.safeParse(raw);
  if (!r.success) {
    console.warn('mermaid layout rejected, showing the static SVG', r.error.issues.slice(0, 3));
    return null;
  }
  const names = new Set(r.data.parts.map((p) => p.name));
  return r.data.parts.every((p) => [...(p.with ?? []), ...(p.after ?? [])].every((n) => names.has(n))) ? r.data : null;
};

export {revealOrder} from './semantics';

export {normName};

const START = 4;          // frames after the lead when parts without a cue appear
const EDGE_DELAY = 6;     // frames after the later of its two ends appears
const DUR = {pop: 16, draw: 18, wipe: 22, fade: 12} as const;
const HALF_WIDTH = 26;    // half width of the band uncovered along a line being drawn (covers arrowheads, crow's feet)
const SAMPLES = 32;
const TOKEN_PERIOD = 40;  // frames for the token to travel a focused line

/** Frame at which each part starts to appear. */
const appearTimes = (l: MermaidLayoutT, build: boolean, lead: number, appearAt: (i: number, n: number) => number,
  focus: FocusEvent[] | undefined, fps: number, named: (spec: string) => Part[]) => {
  const t = new Map<string, number>();
  const all = lead + START;
  if (!build) {
    l.parts.forEach((p) => t.set(p.name, all));
    return t;
  }
  const slots = revealOrder(l);
  slots.forEach((p, i) => t.set(p.name, appearAt(i, slots.length)));
  // focus points at what it names: a part named before its own reveal comes on screen then
  for (const ev of focus ?? []) {
    const fr = lead + Math.round(ev.t * fps);
    for (const raw of ev.on) for (const p of named(raw)) {
      const at = p.anim === 'draw' ? fr - DUR.draw : raw.includes('->') ? fr - EDGE_DELAY - DUR.draw : fr;
      t.set(p.name, Math.max(lead, Math.min(t.get(p.name) ?? Infinity, at)));   // never before the base layer
    }
  }
  // `with` (as early as the first of them) and `after` (once all of them are there); resolve until stable
  const byName = new Map(l.parts.map((q) => [q.name, q]));
  for (let pass = 0; pass < 6; pass++) {
    for (const p of l.parts) {
      if (p.with?.length) {
        const xs = p.with.map((n) => t.get(n)).filter((x): x is number => x !== undefined);
        if (xs.length) t.set(p.name, Math.min(t.get(p.name) ?? Infinity, ...xs));
      }
      if (p.after?.length) {
        const xs = p.after.map((n) => {
          const x = t.get(n);
          return x === undefined ? undefined : x + (byName.get(n)?.anim === 'draw' ? Math.round(DUR.draw * 0.6) : EDGE_DELAY);
        });
        if (xs.every((x) => x !== undefined)) t.set(p.name, Math.min(t.get(p.name) ?? Infinity, Math.max(...(xs as number[]))));
      }
    }
  }
  l.parts.forEach((p) => { if (!Number.isFinite(t.get(p.name) ?? NaN)) t.set(p.name, all); });
  return t;
};

/** CSS polygon uncovering a band along the first `p` (0..1) of a path, in screen pixels. */
const drawClip = (d: string, len: number, p: number, toPx: (x: number, y: number) => [number, number]) => {
  const upTo = Math.max(0.01, p * len);
  const left: string[] = [], right: string[] = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const at = (upTo * k) / SAMPLES;
    const pt = getPointAtLength(d, at), tg = getTangentAtLength(d, Math.min(at, Math.max(0, len - 0.01)));
    const tl = Math.hypot(tg.x, tg.y) || 1;
    const ux = tg.x / tl, uy = tg.y / tl;
    // reach a little behind the start and past the tip
    const ext = k === 0 ? -HALF_WIDTH : k === SAMPLES ? HALF_WIDTH * 0.3 : 0;
    const x = pt.x + ux * ext, y = pt.y + uy * ext;
    const [lx, ly] = toPx(x - uy * HALF_WIDTH, y + ux * HALF_WIDTH), [rx, ry] = toPx(x + uy * HALF_WIDTH, y - ux * HALF_WIDTH);
    left.push(`${lx.toFixed(1)}px ${ly.toFixed(1)}px`);
    right.unshift(`${rx.toFixed(1)}px ${ry.toFixed(1)}px`);
  }
  return `polygon(${[...left, ...right].join(', ')})`;
};

type Props = {
  layout: MermaidLayoutT; width: number; height: number;
  /** Frame at which the i-th of n revealed parts (revealOrder) appears; used when `build` is on. */
  appearAt: (i: number, n: number) => number;
  build: boolean; lead: number; focus?: FocusEvent[];
};

export const MermaidLayers: React.FC<Props> = ({layout: l, width, height, appearAt, build, lead, focus}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {C} = useTheme();
  const f = useFocus(focus, lead);
  const [vx, vy, vw, vh] = l.vb;
  const scale = Math.min(width / vw, height / vh);
  const W = vw * scale, H = vh * scale;
  const toPx = (x: number, y: number): [number, number] => [(x - vx) * scale, (y - vy) * scale];

  const byName = React.useMemo(() => new Map(l.parts.map((p) => [p.name, p])), [l]);
  const namesOf = React.useMemo(() => new Map(l.parts.map((p) => [p.name, [p.name, p.label].filter(Boolean).map(normName)])), [l]);
  const lens = React.useMemo(() => new Map(l.parts.filter((p) => p.d).map((p) => [p.name, getLength(p.d!)])), [l]);
  /** Whether a part (by name) answers to a focus key: its id or its label. */
  const answers = (name: string | undefined, key: string) => !!name && (namesOf.get(name) ?? [normName(name)]).includes(key);
  const lineNamed = (p: Part, key: string) => {
    const ab = key.split('->');
    if (ab.length !== 2) return false;
    const [a, b] = ab;
    return p.from !== undefined && answers(p.from, a) && answers(p.to, b);
  };
  /** Parts a focus entry names: nodes by id or label; "a->b" names the line(s) between them, and their ends. */
  const named = React.useCallback((raw: string): Part[] => {
    const key = normName(raw);
    if (key.split('->').length > 2) return [];
    if (key.includes('->')) {
      const lines = l.parts.filter((p) => lineNamed(p, key));
      return [...lines, ...lines.flatMap((e) => [byName.get(e.from!), byName.get(e.to!)]).filter((x): x is Part => !!x)];
    }
    return l.parts.filter((p) => p.from === undefined && answers(p.name, key));
  }, [l, byName, namesOf]);
  const t = React.useMemo(
    () => appearTimes(l, build, lead, appearAt, focus, fps, named),
    [l, build, lead, appearAt, focus, fps, named],
  );

  /** What each part's brightness follows (graph semantics: a line is bright when named or when both ends are). */
  const inFocus = (p: Part, depth = 0) => (s: Set<string>): boolean => {
    const keys = [...s].map(normName);
    const hit = (name: string | undefined) => keys.some((k) => !k.includes('->') && answers(name, k));
    if (p.from !== undefined) return keys.some((k) => k.includes('->') && lineNamed(p, k)) || (hit(p.from) && hit(p.to));
    if (hit(p.name) || hit(p.parent)) return true;
    if (l.parts.some((c) => c.parent === p.name && hit(c.name))) return true;   // a group: any member
    if (depth > 3 || p.slot) return false;
    const follow = p.after?.length ? p.after : p.with ?? [];                    // a line label, a start/end marker, a participant
    return follow.some((n) => hit(n) || (byName.has(n) && inFocus(byName.get(n)!, depth + 1)(s)));
  };

  const order = React.useMemo(() => {
    const rank = (p: Part) => (p.anim === 'fade' && !p.after ? 0 : p.anim === 'draw' ? 1 : p.anim === 'fade' ? 3 : 2);
    return l.parts.map((p, i) => ({p, i})).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i);
  }, [l]);
  const baseP = build ? interpolate(frame, [lead, lead + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  const layer: React.CSSProperties = {position: 'absolute', left: 0, top: 0, width: W, height: H};

  const tokens: React.ReactNode[] = [];
  const layers = order.map(({p}) => {
    const start = t.get(p.name)!;
    const raw = interpolate(frame, [start, start + DUR[p.anim]], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    if (raw <= 0) return null;
    const lk = look(f, inFocus(p));
    const style: React.CSSProperties = {...layer, opacity: lk.opacity};
    if (p.anim === 'pop') {
      const s = spring({frame: frame - start, fps, config: {damping: 200}, durationInFrames: DUR.pop});
      const [ox, oy] = toPx(p.ox ?? p.x + p.w / 2, p.oy ?? p.y + p.h / 2);
      Object.assign(style, {opacity: s * lk.opacity, transformOrigin: `${ox}px ${oy}px`,
        transform: `translateY(${(1 - s) * 14}px) scale(${(0.85 + 0.15 * s) * (1 + 0.04 * lk.lift)})`});
    } else if (p.anim === 'draw' && p.d && raw < 1) {
      style.clipPath = drawClip(p.d, lens.get(p.name)!, Easing.inOut(Easing.cubic)(raw), (x, y) => toPx(x + (p.dx ?? 0), y + (p.dy ?? 0)));
    } else if (p.anim === 'wipe' && raw < 1) {
      const e = Easing.out(Easing.cubic)(raw);
      const [x0] = toPx(p.x - 2, 0), [x1] = toPx(p.x + p.w * e + 2, 0);
      style.clipPath = `polygon(${x0}px 0px, ${x1}px 0px, ${x1}px ${H}px, ${x0}px ${H}px)`;
    } else if (p.anim === 'fade' || (p.anim === 'draw' && !p.d)) {
      style.opacity = raw * lk.opacity;
    }
    // a token travels along a line the focus names explicitly
    if (p.d && raw >= 1 && f.cur && [...f.cur].some((k) => k.includes('->') && lineNamed(p, normName(k)))) {
      const len = lens.get(p.name)!;
      const pt = getPointAtLength(p.d, ((((frame - lead) % TOKEN_PERIOD) + TOKEN_PERIOD) % TOKEN_PERIOD / TOKEN_PERIOD) * len);
      const [cx, cy] = toPx(pt.x + (p.dx ?? 0), pt.y + (p.dy ?? 0));
      tokens.push(<div key={p.name} style={{position: 'absolute', left: cx - 9, top: cy - 9, width: 18, height: 18, borderRadius: 9,
        background: C.secondary, border: `3px solid ${C.ink}`, boxSizing: 'border-box', opacity: f.p}} />);
    }
    return <Img key={p.name} src={staticFile(`${l.dir}/${p.file}`)} style={style} />;
  });

  return (
    <div style={{position: 'relative', width: W, height: H}}>
      <Img src={staticFile(`${l.dir}/base.svg`)} style={{...layer, opacity: baseP}} />
      {layers}
      {tokens}
    </div>
  );
};

export const View2D: React.FC<View2DProps<'mermaid'>> = ({visual: v, frame, lead, audioFrames, reveal, focus, rendered}) => {
  const {C, BORDER} = useTheme();
  const p = prog(frame, 4, 18);
  const svg = rendered?.svg ?? (v as {svg?: string}).svg;
  const rawLayout = rendered?.layout ?? (v as {layout?: unknown}).layout;
  const hasFocus = !!focus?.length;
  // build/focus: stack the diagram's part layers and animate them (falls back to the static SVG if there are none)
  const layout = React.useMemo(() => ((v.build || hasFocus) ? parseLayout(rawLayout) : null), [v.build, hasFocus, rawLayout]);
  const appearAt = React.useCallback((i: number, n: number) => at(i, n, lead, audioFrames, reveal), [lead, audioFrames, reveal]);
  if (layout) {
    const h = v.caption ? 560 : 620;
    return (
      <div>
        <Heading text={v.heading} />
        <div style={{width: 1700, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: v.build ? 1 : p}}>
          <MermaidLayers layout={layout} width={1700} height={h} build={!!v.build} lead={lead} focus={focus}
            appearAt={appearAt} />
        </div>
        {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, ...inStyle(p)}}>{v.caption}</div>}
      </div>
    );
  }
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{width: 1700, height: v.caption ? 560 : 620, display: 'flex', alignItems: 'center', justifyContent: 'center', ...inStyle(p)}}>
        {/* The mermaid SVG is not sanitized on output: keep it loaded via <Img>, never inline it. */}
        {svg ? (
          <Img src={staticFile(svg)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
        ) : (
          <div style={{fontSize: 38, color: C.ink, border: `${BORDER}px dashed ${C.ink}`, background: C.primary, padding: '30px 40px'}}>
            diagram not rendered: run explainer.py audio
          </div>
        )}
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, ...inStyle(p)}}>{v.caption}</div>}
    </div>
  );
};
