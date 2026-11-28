// 2D (slides layout) view of the `duo` visual: the two speakers as faceless figures facing each other, whoever speaks this scene
// at full strength and the other pulled toward the background (a solid colour mix, never transparency), the question on a card
// between them and an optional pull quote as a speech bubble. The speakers come from the video's `speakers` (src/speakers.ts).
import React from 'react';
import {useTheme, mixHex} from '../../theme';
import {useRtl} from '../../rtl';
import {at, inStyle, prog} from '../../kit2d';
import {Avatar} from '../../sdk/avatar';
import {speakerPair, useSpeakers, type SpeakerEntry} from '../../speakers';
import type {View2DProps} from '../props';

const FIGURE = 270;
const DIM = 0.62;
const ANON: SpeakerEntry[] = [{id: 'a', name: '?', role: '', index: 0}, {id: 'b', name: '?', role: '', index: 1}];

export const View2D: React.FC<View2DProps<'duo'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, FONT, MONO, BORDER, accents, onAccent, shadow} = th;
  const sp = useSpeakers();
  const pair = (sp?.list.length ? speakerPair(sp.list, []) : ANON).slice(0, 2);
  const current = sp?.current;
  const n = v.quote ? 2 : 1;
  const pq = prog(frame, at(0, n, lead, audioFrames, reveal));
  const pu = prog(frame, at(1, n, lead, audioFrames, reveal));
  const figure = (s: SpeakerEntry, side: 'start' | 'end') => {
    const lit = !current || current.id === s.id;
    const ink = lit ? C.ink : mixHex(C.ink, C.bg, DIM);
    return (
      <div key={s.id} style={{position: 'absolute', bottom: 0, [side === 'start' ? 'left' : 'right']: 20, width: FIGURE, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
        <Avatar index={s.index} name={s.name} px={FIGURE} fade={lit ? 0 : DIM} />
        <div style={{fontFamily: FONT, fontSize: 34, fontWeight: 700, color: ink}}>{s.name}</div>
        {/* two lines of room, so a long role never lifts one figure above the other */}
        <div style={{fontFamily: MONO, fontSize: 17, lineHeight: '22px', height: 44, color: lit ? C.dim : mixHex(C.dim, C.bg, DIM), textAlign: 'center'}}>{s.role}</div>
      </div>
    );
  };
  const speakerIdx = current ? current.index % 2 : 0;
  const bubble = accents[speakerIdx];
  return (
    <div style={{position: 'relative', width: 1700, height: 650, ...(rtl ? {direction: 'rtl'} : {})}}>
      {pair.map((s, i) => figure(s, i === 0 ? 'start' : 'end'))}
      <div style={{position: 'absolute', left: FIGURE + 90, right: FIGURE + 90, top: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34}}>
        <div style={{width: '100%', boxSizing: 'border-box', background: C.panel, border: `${BORDER}px solid ${C.ink}`, boxShadow: shadow(8, rtl), padding: '36px 44px', textAlign: 'center', ...inStyle(pq)}}>
          <div style={{fontFamily: FONT, fontSize: 62, fontWeight: 800, lineHeight: 1.12, color: C.ink}}>{v.question}</div>
        </div>
        {v.quote && (
          <div style={{width: '88%', boxSizing: 'border-box', background: bubble, color: onAccent(bubble), border: `${BORDER}px solid ${C.ink}`, borderRadius: 28, boxShadow: shadow(6, rtl), padding: '22px 34px', textAlign: 'center', ...inStyle(pu)}}>
            <div style={{fontFamily: FONT, fontSize: 44, fontWeight: 600, lineHeight: 1.2}}>{`“${v.quote}”`}</div>
            {current && <div style={{fontFamily: MONO, fontSize: 20, marginTop: 8}}>{current.name}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
