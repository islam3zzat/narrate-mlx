// 2.5D cel-shaded anime atmospheric backdrop: multi-stop cel sky, diagonal sunlight shafts,
// subtle receding 2.5D horizon grid, manga speedlines, and corner halftone dots.
// Rendered as a static anime matte painting at the composition root so every render tab produces
// identical background pixels with zero cross-tab flicker.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useTheme} from './theme';

export const AnimeBackdrop: React.FC = () => {
  const {cel} = useTheme();
  const horizonY = 785;

  return (
    <AbsoluteFill style={{overflow: 'hidden', pointerEvents: 'none'}}>
      {/* 1. Multi-stop cel-painted sky */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${cel.skyTop} 0%, ${cel.skyMid} 58%, ${cel.skyBot} 100%)`,
        }}
      />

      {/* 2. Static sky layers: light shafts, receding horizon grid, corner halftones, speedlines */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0}}>
        <defs>
          <pattern id="anime-halftone" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="2.2" fill={cel.halftone} />
          </pattern>
          <linearGradient id="anime-shaft" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={cel.shaftHighlight} stopOpacity="0.44" />
            <stop offset="100%" stopColor={cel.shaftHighlight} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Diagonal sunlight shafts */}
        <polygon points="1180,0 1440,0 1120,1080 860,1080" fill="url(#anime-shaft)" />
        <polygon points="1540,0 1690,0 1380,1080 1230,1080" fill="url(#anime-shaft)" opacity="0.65" />

        {/* Distant cel-shaded horizon + 2.5D receding perspective grid */}
        <g opacity="0.55">
          <rect x="0" y={horizonY} width="1920" height={1080 - horizonY} fill={cel.horizonGround} fillOpacity="0.45" />
          <line x1="0" y1={horizonY} x2="1920" y2={horizonY} stroke={cel.shadowTint} strokeWidth="2" strokeOpacity="0.24" />
          {[-900, -640, -400, -180, 0, 180, 400, 640, 900].map((dx, i) => (
            <line
              key={i}
              x1={960 + dx * 0.42}
              y1={horizonY}
              x2={960 + dx * 1.45}
              y2={1080}
              stroke={cel.shadowTint}
              strokeWidth="1.5"
              strokeOpacity="0.16"
            />
          ))}
          {[825, 875, 940, 1020].map((y, i) => (
            <line key={i} x1="0" y1={y} x2="1920" y2={y} stroke={cel.shadowTint} strokeWidth="1.5" strokeOpacity={0.11 + i * 0.03} />
          ))}
        </g>

        {/* Corner Ben-Day halftone triangles */}
        <polygon points="0,0 320,0 0,210" fill="url(#anime-halftone)" />
        <polygon points="1920,1080 1560,1080 1920,820" fill="url(#anime-halftone)" />

        {/* Subtle speedlines framing the outer edges */}
        <g stroke={cel.speedline} strokeWidth="3" strokeLinecap="round">
          <line x1="0" y1="90" x2="130" y2="125" />
          <line x1="0" y1="150" x2="88" y2="174" />
          <line x1="1920" y1="110" x2="1780" y2="145" />
          <line x1="1920" y1="185" x2="1835" y2="205" />
          <line x1="0" y1="930" x2="115" y2="900" />
          <line x1="1920" y1="920" x2="1800" y2="890" />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
