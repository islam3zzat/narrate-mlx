// 2D view of the `fanout` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {Heading, at, box, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'fanout'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, MONO, accents, shadow} = th;
  const sh = (px?: number) => shadow(px, rtl);
  const bx = (extra: React.CSSProperties = {}) => box(extra, rtl, th);
  const n = v.targets.length;
  const pSrc = prog(frame, 4);
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{display: 'flex', alignItems: 'center', gap: 20, marginTop: 10}}>
        <div style={{...bx(), width: 420, background: C.primary, padding: '40px 20px', textAlign: 'center', fontSize: 42, fontWeight: 700, ...inStyle(pSrc)}}>{v.source.label}</div>
        <div style={{fontSize: 60, fontWeight: 700, color: C.ink, opacity: pSrc}}>{rtl ? '⇐' : '⇒'}</div>
        <div style={{flex: 1}}>
          {v.targets.map((t, i) => {
            const p = prog(frame, reveal ? at(i, n, lead, audioFrames, reveal) : at(i + 0.5, n + 0.5, lead, audioFrames));
            const col = accents[(i + 1) % 4];
            return (
              <div key={i} style={{...bx({boxShadow: `inset ${rtl ? -22 : 22}px 0 0 ${col}, inset ${rtl ? -26 : 26}px 0 0 ${C.ink}, ${sh(6)}`}), padding: rtl ? '18px 52px 18px 28px' : '18px 28px 18px 52px', marginBottom: 20, ...inStyle(p)}}>
                <div style={{fontSize: 38, fontWeight: 700, fontFamily: MONO}}>{t.label}</div>
                <div style={{fontSize: 27, color: C.dim, marginTop: 8, lineHeight: 1.3}}>{t.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
