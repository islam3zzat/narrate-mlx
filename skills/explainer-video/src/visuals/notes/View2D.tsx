// 2D (slides layout) view of the `notes` visual: a heading and the notes, each marked with the avatar of the speaker it belongs to.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {Heading, at, inStyle, prog} from '../../kit2d';
import {Avatar} from '../../sdk/avatar';
import {distinctIds, speakerById, useSpeakers} from '../../speakers';
import type {View2DProps} from '../props';

export const View2D: React.FC<View2DProps<'notes'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const {C, accents, isAnime, cel} = useTheme();
  const list = useSpeakers()?.list;
  const order = distinctIds(v.items.flatMap((i) => (i.by ? [i.by] : [])));
  const n = v.items.length;
  return (
    <div>
      <Heading text={v.heading} />
      {v.items.map((it, i) => {
        const p = prog(frame, at(i, n, lead, audioFrames, reveal));
        const sp = it.by ? speakerById(list, it.by, order) : undefined;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 24, fontSize: 42, minHeight: 66, marginBottom: 10, ...inStyle(p), ...(rtl ? {direction: 'rtl'} : {})}}>
            <div style={{width: 60, flex: 'none', display: 'flex', justifyContent: 'center'}}>
              {sp ? <Avatar index={sp.index} name={sp.name} size="sm" /> : (
                <div style={{width: 22, height: 22, background: accents[i % 4], border: `3px solid ${C.ink}`, transform: isAnime ? 'rotate(45deg)' : 'none', ...(isAnime ? {boxShadow: `3px 3px 0 ${cel.shadowTint}`} : {})}} />
              )}
            </div>
            <div>{it.text}</div>
          </div>
        );
      })}
    </div>
  );
};
