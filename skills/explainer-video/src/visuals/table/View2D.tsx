// 2D view of the `table` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {Heading, at, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'table'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const {C, MONO, BORDER, isAnime, shadow} = useTheme();
  const ls = (px: number) => (rtl ? 0 : px);   // Arabic letters must stay joined: no letter-spacing
  const n = v.rows.length;
  return (
    <div>
      <Heading text={v.heading} />
      <div style={isAnime ? {borderRadius: 10, overflow: 'hidden', boxShadow: shadow(8, rtl)} : undefined}>
        <div style={{display: 'flex', background: C.ink, color: isAnime ? C.primary : C.bg, border: `${BORDER}px solid ${C.ink}`, padding: '18px 30px', fontSize: 28, fontFamily: MONO, fontWeight: 700, letterSpacing: ls(1), textTransform: 'uppercase'}}>
          {v.headers.map((h, i) => <div key={i} style={{flex: i === 0 ? 1.7 : 1.3}}>{h}</div>)}
        </div>
        {v.rows.map((r, i) => {
          const p = prog(frame, at(i, n, lead, audioFrames, reveal));
          return (
            <div key={i} style={{display: 'flex', padding: '22px 30px', fontSize: 36, background: i % 2 ? C.muted : C.panel, border: `${BORDER}px solid ${C.ink}`, borderTop: 'none', ...inStyle(p)}}>
              {r.map((cell, j) => <div key={j} style={{flex: j === 0 ? 1.7 : 1.3, paddingInlineEnd: 24, fontWeight: j === 0 ? 700 : 400, color: C.ink}}>{cell}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
