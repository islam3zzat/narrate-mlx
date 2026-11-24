// 2D view of the `callout` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {box, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'callout'>> = ({visual: v, frame}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, MONO, shadow, onAccent} = th;
  const sh = (px?: number) => shadow(px, rtl);
  const bx = (extra: React.CSSProperties = {}) => box(extra, rtl, th);
  const ls = (px: number) => (rtl ? 0 : px);   // Arabic letters must stay joined: no letter-spacing
  const warn = v.tone === 'warn';
  const col = warn ? C.danger : C.primary;
  const p = prog(frame, 4, 22);
  return (
    <div style={{height: '100%', display: 'flex', alignItems: 'center', ...inStyle(p)}}>
      <div style={{...bx({boxShadow: `inset ${rtl ? -36 : 36}px 0 0 ${col}, inset ${rtl ? -40 : 40}px 0 0 ${C.ink}, ${sh(14)}`}), padding: rtl ? '56px 110px 56px 70px' : '56px 70px 56px 110px', width: '100%'}}>
        <div style={{fontSize: 32, letterSpacing: ls(3), textTransform: 'uppercase', fontFamily: MONO, fontWeight: 700, color: onAccent(col), background: col, display: 'inline-block', padding: '4px 16px', marginBottom: 20}}>{v.heading}</div>
        <div style={{fontSize: 92, fontWeight: 800, lineHeight: rtl ? 1.3 : 1.05, letterSpacing: ls(-2)}}>{v.big}</div>
        <div style={{fontSize: 38, color: C.dim, marginTop: 28, lineHeight: 1.35}}>{v.text}</div>
      </div>
    </div>
  );
};
