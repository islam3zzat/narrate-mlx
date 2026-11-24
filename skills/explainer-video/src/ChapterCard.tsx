import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {useTheme} from './theme';
import {rtlText, useRtl} from './rtl';
import {AnimeBackdrop} from './AnimeBackdrop';

export const ChapterCard: React.FC<{title: string; part: number; videoTitle: string}> = ({title, part, videoTitle}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rtl = useRtl();
  const {C, FONT, MONO, BORDER, isAnime, cel, shadow} = useTheme();
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 160}});
  const y = interpolate(enter, [0, 1], [28, 0]);
  const bgStyle: React.CSSProperties = isAnime
    ? {background: 'transparent', fontFamily: FONT, color: C.ink, ...(rtl ? {direction: 'rtl'} : {})}
    : {background: C.bg, backgroundImage: `radial-gradient(${C.ink}22 2px, transparent 2px)`, backgroundSize: '36px 36px', fontFamily: FONT, color: C.ink, ...(rtl ? {direction: 'rtl'} : {})};
  const label = `PART ${String(part).padStart(2, '0')}`;
  return (
    <AbsoluteFill style={bgStyle}>
      {isAnime && <AnimeBackdrop />}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '0 140px'}}>
        <div style={{
          opacity: enter, transform: `translateY(${y}px)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
          background: C.panel, border: `${BORDER + 1}px solid ${C.ink}`,
          ...(isAnime ? {borderRadius: 14, backgroundImage: `linear-gradient(158deg, transparent 0%, transparent 72%, ${cel.celBand} 72%, ${cel.celBand} 100%)`} : {}),
          boxShadow: isAnime ? `inset 0 4px 0 ${cel.rimLight}, ${shadow(12, rtl)}` : shadow(12, rtl),
          padding: '56px 88px', maxWidth: 1400, textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 14,
            background: C.primary, border: `${BORDER}px solid ${C.ink}`,
            ...(isAnime ? {borderRadius: 6} : {}), padding: '8px 22px',
            boxShadow: shadow(4, rtl), fontFamily: MONO, fontSize: 26, fontWeight: 700,
            ...(rtl ? {direction: 'ltr', unicodeBidi: 'isolate'} : {}),
          }}>
            <span>{label}</span>
            <span style={{opacity: 0.45}}>/</span>
            <span style={{opacity: 0.85}}>{videoTitle}</span>
          </div>
          <div style={{fontSize: 72, fontWeight: 800, lineHeight: 1.15, ...rtlText(rtl)}}>{title}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
