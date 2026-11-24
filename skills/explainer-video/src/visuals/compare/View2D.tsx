// 2D view of the `compare` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {Heading, at, box, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'compare'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, FONT, MONO, accents, shadow} = th;
  const sh = (px?: number) => shadow(px, rtl);
  const bx = (extra: React.CSSProperties = {}) => box(extra, rtl, th);
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{display: 'flex', gap: 30}}>
        {v.columns.map((c, i) => {
          const p = prog(frame, at(i, v.columns.length, lead, audioFrames, reveal));
          const col = accents[i % 4];
          return (
            <div key={i} style={{flex: 1, ...bx({boxShadow: `inset 0 18px 0 ${col}, inset 0 22px 0 ${C.ink}, ${sh()}`}), padding: '48px 34px 30px', ...inStyle(p)}}>
              <div style={{fontSize: 42, fontWeight: 700, fontFamily: c.title.includes('_') || /^[A-Za-z]+[A-Z]/.test(c.title) ? MONO : FONT}}>{c.title}</div>
              <div style={{fontSize: 26, fontFamily: MONO, fontWeight: 700, color: C.dim, margin: '8px 0 22px'}}>{c.tag}</div>
              {c.items.map((t, j) => (
                <div key={j} style={{fontSize: 31, color: C.ink, marginBottom: 14, lineHeight: 1.3}}>• {t}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
