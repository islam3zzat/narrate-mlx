// Shared 2D building blocks for the per-type views (src/visuals/<type>/View2D.tsx) and for visuals.tsx.
import React from 'react';
import {interpolate} from 'remotion';
import constants from './constants.json';
import {C, BORDER, shadow, useTheme, type ThemeDef} from './theme';
import {useRtl} from './rtl';

export const box = (extra: React.CSSProperties = {}, rtl = false, th?: ThemeDef): React.CSSProperties => {
  if (th?.isAnime) {
    return {
      background: th.C.panel,
      backgroundImage: `linear-gradient(158deg, transparent 0%, transparent 72%, ${th.cel.celBand} 72%, ${th.cel.celBand} 100%)`,
      border: `${th.BORDER}px solid ${th.C.ink}`,
      borderRadius: 10,
      boxShadow: `inset 0 4px 0 ${th.cel.rimLight}, ${th.shadow(undefined, rtl)}`,
      ...extra,
    };
  }
  const c = th ? th.C : C;
  const b = th ? th.BORDER : BORDER;
  const sh = th ? th.shadow(undefined, rtl) : shadow(undefined, rtl);
  return {background: c.panel, border: `${b}px solid ${c.ink}`, boxShadow: sh, ...extra};
};

/** Theme-aware box helper hook for 2D views. */
export const useBox = () => {
  const rtl = useRtl();
  const th = useTheme();
  return (extra: React.CSSProperties = {}) => box(extra, rtl, th);
};

/** 0..1 progress of an element that starts at frame `at` and takes `len` frames. */
export const prog = (frame: number, at: number, len = 14) =>
  interpolate(frame, [at, at + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
export const inStyle = (p: number): React.CSSProperties => ({opacity: p, transform: `translateY(${(1 - p) * 22}px)`});
/** When item i of n appears, spread over the first 80% of the narration. */
export const at = (i: number, n: number, lead: number, audioFrames: number, reveal?: number[]) =>
  reveal && reveal[Math.floor(i)] !== undefined ? lead + Math.round(reveal[Math.floor(i)] * constants.fps) : lead + Math.round((i / Math.max(n, 1)) * audioFrames * 0.8);

export const Heading: React.FC<{text: string; color?: string}> = ({text, color}) => {
  const rtl = useRtl();
  const th = useTheme();
  const ink = color ?? th.C.ink;
  if (th.isAnime) {
    return (
      <div style={{display: 'inline-flex', flexDirection: 'column', alignSelf: 'flex-start', marginBottom: 40}}>
        <div style={{
          fontSize: 66, fontWeight: 800, color: ink, letterSpacing: rtl ? 0 : -1, lineHeight: 1.05,
          textShadow: `3px 3px 0 rgba(42, 38, 88, 0.22)`,
        }}>{text}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 8}}>
          <div style={{
            height: 11, width: '100%', minWidth: 160, background: th.C.primary,
            border: `2.5px solid ${th.C.ink}`, transform: 'skewX(-16deg)',
            boxShadow: `3px 3px 0 ${th.cel.shadowTint}`,
          }} />
          <div style={{
            height: 11, width: 28, flex: 'none', background: th.C.secondary,
            border: `2.5px solid ${th.C.ink}`, transform: 'skewX(-16deg)',
          }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{fontSize: 68, fontWeight: 700, marginBottom: 44, color: ink, letterSpacing: rtl ? 0 : -1, display: 'inline-block', alignSelf: 'flex-start', borderBottom: `10px solid ${th.C.primary}`, lineHeight: 1.05, paddingBottom: 4}}>{text}</div>
  );
};
