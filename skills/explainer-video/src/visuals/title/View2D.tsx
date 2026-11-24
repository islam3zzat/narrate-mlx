// 2D view of the `title` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'title'>> = ({visual: v, frame}) => {
  const rtl = useRtl();
  const {C, MONO, BORDER, isAnime, cel} = useTheme();
  const ls = (px: number) => (rtl ? 0 : px);   // Arabic letters must stay joined: no letter-spacing
  const p = prog(frame, 4, 22);
  if (isAnime) {
    return (
      <div style={{height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', ...inStyle(p)}}>
        <div style={{
          fontSize: 28, letterSpacing: ls(4), textTransform: 'uppercase', marginBottom: 28, fontFamily: MONO, fontWeight: 700,
          background: C.ink, color: C.primary, padding: '8px 22px', alignSelf: 'flex-start',
          border: `${BORDER}px solid ${C.ink}`, borderRadius: 6, boxShadow: `5px 5px 0 ${C.accent}`, transform: 'skewX(-10deg)',
        }}>
          <span style={{display: 'inline-block', transform: 'skewX(10deg)'}}>{v.kicker}</span>
        </div>
        <div style={{
          fontSize: 98, fontWeight: 800, lineHeight: rtl ? 1.3 : 1.05, letterSpacing: ls(-3), color: C.ink,
          textShadow: `5px 5px 0 rgba(42, 38, 88, 0.22)`,
        }}>{v.headline}</div>
        <div style={{fontSize: 44, color: C.dim, marginTop: 30, lineHeight: rtl ? 1.4 : undefined, fontWeight: 500}}>{v.sub}</div>
        <div style={{display: 'flex', gap: 14, marginTop: 44}}>
          <div style={{width: 220, height: 18, background: C.secondary, border: `${BORDER}px solid ${C.ink}`, transform: 'skewX(-16deg)', boxShadow: `4px 4px 0 ${cel.shadowTint}`}} />
          <div style={{width: 68, height: 18, background: C.primary, border: `${BORDER}px solid ${C.ink}`, transform: 'skewX(-16deg)', boxShadow: `4px 4px 0 ${cel.shadowTint}`}} />
          <div style={{width: 32, height: 18, background: C.accent, border: `${BORDER}px solid ${C.ink}`, transform: 'skewX(-16deg)'}} />
        </div>
      </div>
    );
  }
  return (
    <div style={{height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', ...inStyle(p)}}>
      <div style={{fontSize: 30, letterSpacing: ls(4), textTransform: 'uppercase', marginBottom: 28, fontFamily: MONO, fontWeight: 700, background: C.ink, color: C.bg, padding: '8px 18px', alignSelf: 'flex-start'}}>{v.kicker}</div>
      <div style={{fontSize: 98, fontWeight: 800, lineHeight: rtl ? 1.3 : 1.05, letterSpacing: ls(-3)}}>{v.headline}</div>
      <div style={{fontSize: 44, color: C.dim, marginTop: 34, lineHeight: rtl ? 1.4 : undefined}}>{v.sub}</div>
      <div style={{width: 220, height: 20, background: C.secondary, border: `${BORDER}px solid ${C.ink}`, marginTop: 48}} />
    </div>
  );
};
