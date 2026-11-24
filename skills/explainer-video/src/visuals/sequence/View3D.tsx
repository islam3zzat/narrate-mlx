// 3D view of the `sequence` visual. Moved from three/Sequence3D.tsx (Sequence3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {interpolate, spring, useVideoConfig} from 'remotion';
import {useTheme, type ThemeDef} from '../../theme';
import {dotFill, fillOf} from '../../flow';
import type {SequenceVisualInput} from '../../visuals/sequence/schema';
import {useRtl} from '../../rtl';
import type {FocusEvent} from '../../focus';
import {Mat, Dim, Stage3D, focusAt, look, partIn, linkIn, Block, canvasTexture, useFontsReady, type Visual3DProps} from '../../three/common';

type V = SequenceVisualInput;

const SPACING = 4.6;           // between lifelines

const STEP = 3.4;              // depth per message (wide enough that a label never touches the beam behind it)

const WINDOW = 3;              // messages the camera keeps in view at once

const CHIP_MAX = 7.5;          // widest message label, world units

const Y = 1.0;                 // height of lifelines and messages above the floor

const HEAD = {w: 3.2, h: 1.3, d: 0.9};

const PX = 160;                // texture pixels per world unit

const headTexture = (fill: string, label: string, sub: string | undefined, rtl: boolean, th: ThemeDef) =>
  canvasTexture(HEAD.w * PX, HEAD.h * PX, (ctx) => {
    ctx.fillStyle = fill; ctx.fillRect(0, 0, HEAD.w * PX, HEAD.h * PX);
    if (th.isAnime) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.fillRect(0, 0, HEAD.w * PX, Math.round(HEAD.h * PX * 0.14));
    }
    ctx.fillStyle = th.onAccent(fill); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    const cx = (HEAD.w * PX) / 2, h = HEAD.h * PX;
    ctx.font = `700 ${sub ? 54 : 62}px ${th.FONT}`;
    ctx.fillText(label, cx, sub ? h * 0.38 : h / 2, HEAD.w * PX - 40);
    if (sub) { ctx.font = `400 34px ${th.FONT}`; ctx.globalAlpha = 0.75; ctx.fillText(sub, cx, h * 0.72, HEAD.w * PX - 40); }
  });

/** A label chip, sized to its text. Returns the texture and its world size. */
const chipTexture = (label: string, fill: string, rtl: boolean, th: ThemeDef) => {
  // at most CHIP_MAX world units wide: a long label shrinks its font instead of running past the frame
  const probe = document.createElement('canvas').getContext('2d')!;
  let size = 60;
  probe.font = `700 ${size}px ${th.MONO}`;
  while (probe.measureText(label).width + 56 > CHIP_MAX * PX && size > 30) { size -= 2; probe.font = `700 ${size}px ${th.MONO}`; }
  const font = probe.font;
  const w = Math.ceil(Math.min(probe.measureText(label).width + 56, CHIP_MAX * PX)), h = 96;
  const tex = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = th.C.ink; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fill; ctx.fillRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = th.onAccent(fill); ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillText(label, w / 2, h / 2 + 2);
  });
  return {tex, w: w / PX, h: h / PX};
};

/** A beam from x1 to x2 at depth z, grown by p (0..1). Dashed for replies. */
const Beam: React.FC<{x1: number; x2: number; z: number; p: number; dashed?: boolean}> = ({x1, x2, z, p, dashed}) => {
  const {C} = useTheme();
  const len = Math.abs(x2 - x1) - 0.5, dir = Math.sign(x2 - x1) || 1;
  const shown = len * p;
  const pieces: [number, number][] = [];
  if (dashed) for (let a = 0; a < shown; a += 0.7) pieces.push([a, Math.min(a + 0.42, shown)]);
  else pieces.push([0, shown]);
  return (
    <group>
      {pieces.map(([a, b], k) => (
        <mesh key={k} position={[x1 + dir * (a + b) / 2, Y, z]}>
          <boxGeometry args={[Math.max(b - a, 0.001), 0.14, 0.14]} />
          <Mat color={C.ink} />
        </mesh>
      ))}
      {p > 0.98 && (
        <mesh position={[x2 - dir * 0.45, Y, z]} rotation={[0, 0, -dir * Math.PI / 2]}>
          <coneGeometry args={[0.24, 0.5, 4]} />
          <Mat color={C.ink} />
        </mesh>
      )}
    </group>
  );
};

/** Self-call: a small rectangular loop out to the side. */
const SelfLoop: React.FC<{x: number; z: number; p: number; side: number}> = ({x, z, p, side}) => {
  const {C} = useTheme();
  return (
  <group scale={[1, 1, 1]} visible={p > 0.02}>
    {[[x + side * 0.6, Y + 0.35, 1.2, 0.12], [x + side * 1.2, Y, 0.12, 0.82], [x + side * 0.6, Y - 0.35, 1.2, 0.12]].map(([px, py, w, h], k) => (
      <mesh key={k} position={[px, py, z]} scale={[p, 1, 1]}>
        <boxGeometry args={[w, h, 0.12]} />
        <Mat color={C.ink} />
      </mesh>
    ))}
  </group>
  );
};

const Sequence3D: React.FC<{visual: V; frame: number; frames: number; at: (i: number) => number; focus?: FocusEvent[]; lead: number}> = ({visual: v, frame, frames, at, focus, lead}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C} = th;
  const FILL = fillOf(C);
  const {fps} = useVideoConfig();
  const ready = useFontsReady();
  const n = v.participants.length;
  // participants left to right (right to left when rtl), centred on x = 0
  const xOf = new Map(v.participants.map((p, i) => [p.id, ((i - (n - 1) / 2) * SPACING) * (rtl ? -1 : 1)]));
  const tex = React.useMemo(() => {
    if (!ready) return null;
    return {
      heads: v.participants.map((p) => headTexture(p.tone ? FILL[p.tone] : C.panel, p.label, p.sub, rtl, th)),
      chips: v.messages.map((m) => chipTexture(m.label, m.tone ? FILL[m.tone] : C.bg, rtl, th)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, th.name, JSON.stringify(v.participants), JSON.stringify(v.messages), rtl]);
  React.useEffect(() => () => { tex?.heads.forEach((t) => t.dispose()); tex?.chips.forEach((c) => c.tex.dispose()); }, [tex]);

  const prog = v.messages.map((_, i) => spring({frame: frame - at(i), fps, config: {damping: 16, stiffness: 120}}));
  // participants are on stage from the start; a message once it has been reached
  const shownAt = (id: string) => {
    if (!id.includes('->')) return v.participants.some((p) => p.id === id) ? 0 : Infinity;
    const ks = v.messages.map((m, i) => (`${m.from}->${m.to}` === id ? at(i) : Infinity));
    return Math.min(...ks);
  };
  const f = focusAt(focus, lead, frame, shownAt);
  // Camera: the fitted Stage3D camera (same guarantee as every other 3D visual: the framed box always lands inside the
  // band between the heading and the subtitles). It frames a window WINDOW messages deep sliding down the corridor:
  // the participant blocks and the first messages at the start, then the newest messages as they arrive, or the
  // focused messages during a focus. `slot` is the window's first message (0 = the participant row is in view).
  const cur = prog.reduce((a, b) => a + b, 0);
  const follow = Math.max(0, cur - WINDOW);
  const slotFor = (st: Set<string> | null) => {
    if (!st) return follow;
    const ks = v.messages.map((m, i) => (linkIn(m.from, m.to)(st) ? i : -1)).filter((i) => i >= 0);
    if (!ks.length) return follow;
    // centred on the focused messages, but never behind the newest one: a message arriving during a focus stays in view
    return Math.max(follow, Math.max(0, ks.reduce((a, b) => a + b, 0) / ks.length - (WINDOW - 1) / 2));
  };
  const slot = slotFor(f.prev) + (slotFor(f.cur) - slotFor(f.prev)) * f.p;
  const zFront = interpolate(slot, [0, 1], [HEAD.d / 2 + 0.3, -STEP * 0.5], {extrapolateRight: 'extend', extrapolateLeft: 'clamp'});
  // which way a self-call loop goes: outward, except on the rightmost participant (then inward, to stay on stage)
  const loopSide = (id: string) => (Math.abs(xOf.get(id)!) === Math.max(...[...xOf.values()].map(Math.abs)) && xOf.get(id)! > 0 ? -1 : 1);
  // the camera box covers the participants and every label's actual extent (self-call labels sit beside the loop)
  const labelReach = tex ? Math.max(0, ...v.messages.map((m, i) => {
    const x1 = xOf.get(m.from)!, w = tex.chips[i].w;
    return m.from === m.to ? Math.abs(x1 + loopSide(m.from) * (1.4 + w)) : Math.abs((x1 + xOf.get(m.to)!) / 2) + w / 2;
  })) : 0;
  const halfW = Math.max(((n - 1) / 2) * SPACING + HEAD.w / 2 + 1.2, labelReach + 0.3);
  const boxMin: [number, number, number] = [-halfW, 0, zFront - WINDOW * STEP];
  const boxMax: [number, number, number] = [halfW, Y + 2.4, zFront];
  const dimOf = (l: {opacity: number}) => (1 - l.opacity) / (1 - 0.22);
  const depth = (v.messages.length + 0.6) * STEP;
  const animate = v.animate !== false;

  return (
    <Stage3D min={boxMin} max={boxMax} dir={[0.1, 0.8, 1]} fill={[0.9, 0.6]} frame={frame} frames={frames} rtl={rtl}>
      {tex && v.participants.map((p, i) => {
        const x = xOf.get(p.id)!;
        return (
          <Dim key={p.id} v={dimOf(look(f, partIn(p.id)))}>
            <group position={[x, Y + 0.2, 0]}>
              <Block w={HEAD.w} h={HEAD.h} d={HEAD.d} fill={p.tone ? FILL[p.tone] : C.panel} front={tex.heads[i]} shadow={0.12} />
            </group>
            {/* lifeline: a rod at message height running back, plus its flat shadow on the floor */}
            <mesh position={[x, Y, -depth / 2 - HEAD.d / 2]}>
              <boxGeometry args={[0.08, 0.08, depth]} />
              <Mat color={C.ink} />
            </mesh>
            {/* the name again at the far end, so the lifeline stays identified once the heads are out of frame */}
            <group position={[x, Y + 0.2, -depth - HEAD.d / 2 - 0.6]}>
              <Block w={HEAD.w} h={HEAD.h} d={HEAD.d} fill={p.tone ? FILL[p.tone] : C.panel} front={tex.heads[i]} shadow={0.12} />
            </group>
            <mesh position={[x, 0.01, -depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.5, depth]} />
              <Mat color={C.muted} />
            </mesh>
          </Dim>
        );
      })}
      {tex && v.messages.map((m, i) => {
        const p = prog[i];
        if (p <= 0.001) return null;
        const z = -(i + 1) * STEP;
        const x1 = xOf.get(m.from)!, x2 = xOf.get(m.to)!;
        const self = m.from === m.to;
        const outer = loopSide(m.from);
        const chip = tex.chips[i];
        const cx = self ? x1 + outer * (1.4 + chip.w / 2) : (x1 + x2) / 2;
        const t = ((frame - at(i)) % 45) / 45;
        const lm = look(f, linkIn(m.from, m.to));
        return (
          <Dim key={i} v={dimOf(lm)}>
          <group position={[0, lm.lift * 0.35, lm.lift * 0.3]}>
            {self ? <SelfLoop x={x1} z={z} p={p} side={outer} /> : <Beam x1={x1} x2={x2} z={z} p={Math.min(1, p * 1.15)} dashed={m.reply} />}
            {/* label chip standing upright above the beam, popping up when the beam lands */}
            <mesh position={[cx, Y + 0.55 + chip.h / 2, z]} scale={[1, Math.min(1, p), 1]}>
              <planeGeometry args={[chip.w, chip.h]} />
              <Mat map={chip.tex} />
            </mesh>
            {animate && !self && p > 0.98 && [0, 0.5].map((ph) => {
              const u = (t + ph) % 1;
              return (
                <mesh key={ph} position={[x1 + (x2 - x1) * (0.08 + u * 0.84), Y, z]}>
                  <sphereGeometry args={[0.2, 20, 14]} />
                  <Mat color={dotFill(m.tone, C)} />
                </mesh>
              );
            })}
          </group>
          </Dim>
        );
      })}
    </Stage3D>
  );
};

/** The scene's props, as every 3D view gets them: `at` takes (i, n) here and is narrowed to the message count. */
export const View3D: React.FC<Visual3DProps<V>> = (p) => (
  <Sequence3D visual={p.visual} frame={p.frame} frames={p.frames} at={(i) => p.at(i, p.visual.messages.length)} focus={p.focus} lead={p.lead} />
);
