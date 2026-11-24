import React from 'react';
import {Heading, inStyle, prog} from '../../kit2d';
import {sameType} from '../../continuity';
import type {View2DProps} from '../props';
import {interpolate, useCurrentFrame} from 'remotion';
import {useTheme} from '../../theme';
import type {SequenceVisualInput} from './schema';
import {Dots, dotFill, edgeDraw, fillOf, liftStyle, useAppear} from '../../flow';
import {GLIDE_FRAMES, carriedPrefix, glide, revealFrames} from '../../continuity';
import {linkIn, look, partIn, useFocus, type FocusEvent} from '../../focus';
import {rtlText, useRtl} from '../../rtl';

const HEAD_H = 76;
const HEAD_W = 280;

/** One message: arrow, label chip (centred on the arrow, like graph labels) and travelling dots. */
const Message: React.FC<{m: SequenceVisualInput['messages'][number]; x1: number; x2: number; y: number; at: number; phase: number; animate: boolean; flip: boolean; dim: number}> = ({m, x1, x2, y, at, phase, animate, flip, dim}) => {
  const frame = useCurrentFrame();
  const rtl = useRtl();
  const maskId = React.useId();
  const {C, BORDER, MONO, onAccent, isAnime} = useTheme();
  const FILL = fillOf(C);
  const p = useAppear(at);
  const self = m.from === m.to;
  const dir = Math.sign(x2 - x1) || 1;
  // self message: a small loop beside the lifeline, on the inner side (right; left when right to left), and on the outer
  // side for the last participant, so its label stays on screen
  const side = (flip ? -1 : 1) * (rtl ? -1 : 1);
  const d = self ? `M ${x1} ${y - 14} H ${x1 + side * 70} V ${y + 14} H ${x1 + side * 6}` : `M ${x1} ${y} H ${x2 - dir * 4}`;
  const tipX = self ? x1 : x2;
  const tipY = self ? y + 14 : y;
  const tipDir = self ? -side : dir;
  const fill = m.tone ? FILL[m.tone] : C.bg;
  const cx = self ? x1 + side * 90 : (x1 + x2) / 2;
  const draw = edgeDraw(d, p, m.reply, maskId, BORDER);
  const tipOp = interpolate(p, [0.85, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <g opacity={dim}>
      {draw.maskEl}
      <path d={d} fill="none" stroke={C.ink} strokeWidth={BORDER} style={draw.style} />
      <polygon points={`${tipX},${tipY} ${tipX - tipDir * 22},${tipY - 11} ${tipX - tipDir * 22},${tipY + 11}`} fill={C.ink} opacity={tipOp} />
      {animate && p >= 1 && <Dots d={d} frame={frame} at={at} color={dotFill(m.tone, C)} phase={phase} opacity={1} count={2} />}
      <foreignObject x={self ? (side > 0 ? cx : cx - 800) : cx - 400} y={y - 18} width={800} height={36} style={{overflow: 'visible', opacity: p}}>
        <div style={{display: 'flex', justifyContent: self ? (side > 0 ? 'flex-start' : 'flex-end') : 'center', ...(rtl ? {direction: 'ltr'} : {})}}>
          <span style={{background: fill, color: onAccent(fill), border: `3px solid ${C.ink}`, ...(isAnime ? {borderRadius: 6} : {}), padding: '0 12px', fontFamily: MONO, fontSize: 24, fontWeight: 700, lineHeight: rtl ? '36px' : '30px', whiteSpace: 'nowrap', ...rtlText(rtl)}}>{m.label}</span>
        </div>
      </foreignObject>
    </g>
  );
};

/** Where things sit: x of each lifeline and the y of message i. */
const geometry = (v: SequenceVisualInput, width: number, height: number, rtl: boolean) => {
  const colW = width / v.participants.length;
  const top = HEAD_H + 20;
  const step = Math.min(84, (height - top - 24) / v.messages.length);
  return {cx: new Map(v.participants.map((p, i) => [p.id, rtl ? width - colW * (i + 0.5) : colW * (i + 0.5)])), y: (i: number) => top + step * (i + 0.5)};
};

export const SequenceView: React.FC<{visual: SequenceVisualInput; prev?: SequenceVisualInput; focus?: FocusEvent[]; width: number; height: number; lead: number; audioFrames: number; reveal?: number[]}> = ({visual: v, prev, focus, width, height, lead, audioFrames, reveal}) => {
  const frame = useCurrentFrame();
  const rtl = useRtl();
  const {C, BORDER, FONT, MONO, onAccent, shadow, isAnime, cel} = useTheme();
  const FILL = fillOf(C);
  const f = useFocus(focus, lead);
  const cur = geometry(v, width, height, rtl);
  // continuing the previous scene: carried lifelines and messages move from where they were, new lifelines fade in after
  const old = prev ? geometry(prev, width, height, rtl) : null;
  const g = old ? glide(frame) : 1;
  const mix = (a: number | undefined, b: number) => (a === undefined ? b : a + (b - a) * g);
  const x = (id: string) => mix(old?.cx.get(id), cur.cx.get(id)!);
  const kept = carriedPrefix(prev?.messages, v.messages);
  const ats = revealFrames(v.messages.map((_, i) => i < kept), lead, audioFrames, reveal);
  // a self-call loops on the outer side of the last lifeline (so its label stays on screen); a carried one keeps its side
  const lastId = (sv: SequenceVisualInput) => sv.participants[sv.participants.length - 1].id;
  const flipOf = (m: SequenceVisualInput['messages'][number], i: number) => m.from === m.to && (i < kept && prev ? lastId(prev) : lastId(v)) === m.from;
  const headIn = (id: string) => (!old || old.cx.has(id) ? 1 : appearAt(frame, GLIDE_FRAMES));
  return (
    <svg width={width} height={height} style={{fontFamily: FONT, overflow: 'visible'}}>
      {v.participants.map((p) => {
        const px = x(p.id);
        const fill = FILL[p.tone ?? 'neutral'];
        const l = look(f, partIn(p.id));
        return (
          <g key={p.id} opacity={headIn(p.id) * l.opacity}>
            <line x1={px} x2={px} y1={HEAD_H} y2={height} stroke={C.ink} strokeWidth={3} strokeDasharray="10 10" />
            <foreignObject x={px - HEAD_W / 2} y={0} width={HEAD_W} height={HEAD_H + 12} style={{overflow: 'visible'}}>
              <div style={{boxSizing: 'border-box', height: HEAD_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', background: fill, color: onAccent(fill), border: `${BORDER}px solid ${C.ink}`, ...(isAnime ? {borderRadius: 10, backgroundImage: `linear-gradient(158deg, transparent 0%, transparent 72%, ${cel.celBand} 72%, ${cel.celBand} 100%)`} : {}), boxShadow: isAnime ? `inset 0 4px 0 ${cel.rimLight}, ${shadow(6, rtl)}` : shadow(6, rtl), fontSize: 32, fontWeight: 700, lineHeight: rtl ? 1.3 : 1.1, ...rtlText(rtl), ...liftStyle(l.lift, 6, rtl)}}>
                {p.label}
                {p.sub && <div style={{fontFamily: MONO, fontSize: 18, fontWeight: 400, marginTop: 4}}>{p.sub}</div>}
              </div>
            </foreignObject>
          </g>
        );
      })}
      {v.messages.map((m, i) => (
        <Message key={i} m={m} x1={x(m.from)} x2={x(m.to)} y={i < kept ? mix(old!.y(i), cur.y(i)) : cur.y(i)}
          at={ats[i]} phase={(i * 0.31) % 1} animate={v.animate !== false} flip={flipOf(m, i)}
          dim={look(f, linkIn(m.from, m.to)).opacity} />
      ))}
    </svg>
  );
};

/** Fade-in progress (0..1) of something appearing at frame `at`. */
const appearAt = (frame: number, at: number) => Math.min(1, Math.max(0, (frame - at) / 14));

export const View2D: React.FC<View2DProps<'sequence'>> = ({visual: v, frame, lead, audioFrames, reveal, prev, focus}) => {
  const {C} = useTheme();
  // a continued diagram is already on screen: no entrance
  const p = prev ? 1 : prog(frame, 2, 10);
  const h = v.caption ? 560 : 640;
  const props = {width: 1700, height: h, lead, audioFrames, reveal, focus};
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{width: 1700, height: h, ...inStyle(p)}}>
        <SequenceView visual={v} prev={sameType(v, prev)} {...props} />
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, ...inStyle(p)}}>{v.caption}</div>}
    </div>
  );
};
