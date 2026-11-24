// 2D view of the `bullets` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {Heading, at, inStyle, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'bullets'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const {C, accents, isAnime, cel} = useTheme();
  return (
    <div>
      <Heading text={v.heading} />
      {v.items.map((t, i) => {
        const p = prog(frame, at(i, v.items.length, lead, audioFrames, reveal));
        return (
          <div key={i} style={{display: 'flex', alignItems: 'baseline', gap: 26, fontSize: 46, marginBottom: 26, ...inStyle(p)}}>
            <div style={{
              width: 22, height: 22, background: accents[i % 4], border: `3px solid ${C.ink}`, flex: 'none',
              transform: isAnime ? 'translateY(-6px) rotate(45deg)' : 'translateY(-6px)',
              ...(isAnime ? {boxShadow: `3px 3px 0 ${cel.shadowTint}`} : {}),
            }} />
            <div>{t}</div>
          </div>
        );
      })}
    </div>
  );
};
