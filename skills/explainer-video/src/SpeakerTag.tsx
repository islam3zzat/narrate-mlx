// Dialogue videos (podcast style): the speaker's avatar and a name-and-role pill for whoever speaks the scene. Drawn only when the video has
// `speakers`, so every other video renders exactly as before. Shared by the slides chrome and the whiteboard.
import React from 'react';
import {interpolate} from 'remotion';
import {useRtl} from './rtl';
import {useTheme} from './theme';
import {Avatar} from './sdk/avatar';
import type {SpeakerInfo} from './speakers';
import {BOARD_TAG_EDGE, BOARD_TAG_MAX_W} from './speaker-tag-geom';

/** Where the pill sits. `top`: the top end edge, free on the whiteboard (no title bar or counter); at most BOARD_TAG_MAX_W wide, and the board's headings stop short of it (speaker-tag-geom.ts). `above-captions`: the slides
 * chrome fills the top row with the title and the counter, so the pill takes the 70 px strip between the content area
 * (which ends 230 px from the bottom) and the caption box, at the start edge, smaller to fit the strip. */
export type SpeakerPlace = 'top' | 'above-captions';

/** A pure function of the frame: it fades in over the scene's lead frames, while the voice has not started. */
export const SpeakerTag: React.FC<{speaker: SpeakerInfo; frame: number; lead: number; fade?: number; place?: SpeakerPlace}> = ({speaker, frame, lead, fade = 1, place = 'top'}) => {
  const rtl = useRtl();
  const {C, FONT, MONO, BORDER, accents, shadow, onAccent} = useTheme();
  const fill = accents[speaker.index % 2];
  const appear = interpolate(frame, [0, Math.max(1, lead)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const strip = place === 'above-captions';
  const where: React.CSSProperties = strip
    ? {bottom: 186, left: 110, right: 110, justifyContent: 'flex-start'}
    : {top: 26, left: BOARD_TAG_EDGE, right: BOARD_TAG_EDGE, justifyContent: 'flex-end'};
  // the avatar sits on the pill's start edge, overlapping it a little, and is as tall as the pill so the tag's footprint stays a strip
  const lap = strip ? 12 : 16;
  return (
    <div style={{position: 'absolute', display: 'flex', pointerEvents: 'none', opacity: Math.min(appear, fade), ...where, ...(rtl ? {direction: 'rtl'} : {})}}>
      <div style={{display: 'flex', alignItems: 'center', maxWidth: strip ? 820 : BOARD_TAG_MAX_W}}>
        <div style={{position: 'relative', zIndex: 1, marginInlineEnd: -lap, display: 'flex'}}>
          <Avatar index={speaker.index} name={speaker.name} size={strip ? 'sm' : 'md'} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0, padding: strip ? `4px 18px 4px ${lap + 14}px` : `8px 22px 8px ${lap + 16}px`, background: fill, color: onAccent(fill),
          border: `${BORDER}px solid ${C.ink}`, borderRadius: 999, boxShadow: shadow(strip ? 3 : 4, rtl), whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          <span style={{fontFamily: FONT, fontSize: strip ? 26 : 30, fontWeight: 700}}>{speaker.name}</span>
          <span style={{fontFamily: MONO, fontSize: strip ? 16 : 18, textOverflow: 'ellipsis', overflow: 'hidden'}}>{speaker.role}</span>
        </div>
      </div>
    </div>
  );
};
