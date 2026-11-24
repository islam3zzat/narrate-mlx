// 2D view of the `steps` visual. Moved from the SceneBody switch in visuals.tsx.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {Heading, at, prog} from '../../kit2d';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'steps'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const {C, MONO, BORDER, shadow, isAnime} = useTheme();
  const sh = (px?: number) => shadow(px, rtl);
  return (
    <div>
      <Heading text={v.heading} />
      {v.items.map((t, i) => {
        // `active` set: fixed highlight. Omitted: the highlight follows the narration, step i lights up when it is spoken.
        const n = v.items.length;
        let current = v.active ?? 0;
        if (v.active === undefined) for (let k = 0; k < n; k++) if (frame >= at(k, n, lead, audioFrames, reveal)) current = k;
        const startFrame = v.active === undefined ? at(i, n, lead, audioFrames, reveal) : 0;
        const done = i < current, on = i === current;
        const pulse = on ? prog(frame, startFrame + 2, 12) : 1;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, marginBottom: 20, padding: '14px 26px',
            background: on ? C.primary : 'transparent', border: `${BORDER}px solid ${on ? C.ink : 'transparent'}`,
            ...(isAnime ? {borderRadius: 10} : {}), boxShadow: on ? sh(8) : 'none',
            opacity: on ? 1 : done ? 0.6 : 0.35, transform: on ? `scale(${0.98 + 0.02 * pulse})` : 'none', transformOrigin: rtl ? 'right center' : 'left center'}}>
            <div style={{width: 58, height: 58, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, fontFamily: MONO,
              border: `3px solid ${C.ink}`, ...(isAnime ? {borderRadius: 8} : {}), background: done ? C.accent : on ? C.ink : C.muted, color: on ? C.bg : C.ink}}>
              {done ? '✓' : i + 1}
            </div>
            <div style={{fontSize: 40, fontWeight: on ? 700 : 500}}>{t}</div>
          </div>
        );
      })}
    </div>
  );
};
