// 2D view of the `flow` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {Heading, at, box, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'flow'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, MONO, accents, onAccent} = th;
  const bx = (extra: React.CSSProperties = {}) => box(extra, rtl, th);
  const n = v.nodes.length;
  return (
    <div>
      <Heading text={v.heading} />
      <div style={{display: 'flex', alignItems: 'stretch', marginTop: 70}}>
        {v.nodes.map((nd, i) => {
          const p = prog(frame, at(i, n, lead, audioFrames, reveal));
          const col = accents[i % 4];
          return (
            <React.Fragment key={i}>
              <div style={{...bx(), flex: 1, background: col, color: onAccent(col), padding: '34px 22px', textAlign: 'center', ...inStyle(p)}}>
                <div style={{fontSize: 40, fontWeight: 700}}>{nd.label}</div>
                {nd.sub && <div style={{fontSize: 26, fontFamily: MONO, marginTop: 14, lineHeight: 1.3}}>{nd.sub}</div>}
              </div>
              {i < n - 1 && (
                <div style={{width: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54, fontWeight: 700, color: C.ink, opacity: prog(frame, at(i + 1, n, lead, audioFrames, reveal) - 4)}}>{rtl ? '←' : '→'}</div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
