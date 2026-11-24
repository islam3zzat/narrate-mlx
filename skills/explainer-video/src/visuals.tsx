import React from 'react';
import constants from './constants.json';
import {useTheme} from './theme';
import type {MermaidRendered, Visual} from './types';
import type {FocusEvent} from './focus';
import {stripTashkeel, useRtl} from './rtl';
import {viewsOf} from './visuals/views';
import {headingStyleOf, THREE_D_TYPES} from './visuals/capabilities';
import {Heading, box} from './kit2d';

export const Captions: React.FC<{text: string; frame: number; lead: number; audioFrames: number; aligned?: {text: string; start: number}[]}> = ({text, frame, lead, audioFrames, aligned}) => {
  if (aligned?.length) {
    let cur = aligned[0].text;
    for (const s of aligned) if (frame >= lead + Math.round(s.start * constants.fps)) cur = s.text;
    return <CaptionBox text={cur} />;
  }
  const sentences = text.match(/[^.!?\u061F]+[.!?\u061F]+(\s|$)|[^.!?\u061F]+$/g)?.map((s) => s.trim()) ?? [text];
  const total = sentences.reduce((a, s) => a + s.length, 0);
  let acc = 0;
  let current = sentences[0];
  for (const s of sentences) {
    const start = lead + (acc / total) * audioFrames;
    if (frame >= start) current = s;
    acc += s.length;
  }
  return <CaptionBox text={current} />;
};

const CaptionBox: React.FC<{text: string}> = ({text}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, isAnime, cel, shadow} = th;
  if (isAnime) {
    return (
      <div style={{position: 'absolute', left: 110, right: 110, bottom: 52, minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{
          background: cel.captionBg,
          border: `3.5px solid ${C.ink}`,
          borderTop: `5px solid ${C.primary}`,
          borderRadius: 10,
          boxShadow: `${rtl ? -6 : 6}px 6px 0 ${cel.captionShadow}, ${rtl ? -10 : 10}px 10px 0 ${C.ink}`,
          padding: '18px 34px', fontSize: 33, lineHeight: rtl ? 1.6 : 1.35, textAlign: 'center',
          color: cel.captionInk, fontWeight: 600,
        }}>
          {rtl ? stripTashkeel(text) : text}
        </div>
      </div>
    );
  }
  return (
    <div style={{position: 'absolute', left: 110, right: 110, bottom: 56, minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{...box({boxShadow: shadow(6, rtl)}, rtl, th), background: C.primary, padding: '18px 30px', fontSize: 33, lineHeight: rtl ? 1.6 : 1.35, textAlign: 'center', color: C.ink, fontWeight: 500}}>
        {rtl ? stripTashkeel(text) : text}
      </div>
    </div>
  );
};

export const SceneBody: React.FC<{visual: Visual; frame: number; lead: number; audioFrames: number; reveal?: number[]; prev?: Visual; focus?: FocusEvent[]; textOnly?: boolean; rendered?: MermaidRendered; figureAsset?: string; figureAspect?: number}> = ({visual: v, frame, lead, audioFrames, reveal, prev, focus, textOnly, rendered, figureAsset, figureAspect}) => {
  const rtl = useRtl();
  const {C, MONO, BORDER, isAnime, cel} = useTheme();
  const ls = (px: number) => (rtl ? 0 : px);   // Arabic letters must stay joined: no letter-spacing
  if (textOnly || (THREE_D_TYPES as readonly string[]).includes(v.type)) {
    // The picture is drawn by the full-frame 3D canvas behind this (Explainer.tsx); only the 2D text sits here.
    const cap = 'caption' in v ? v.caption : undefined;
    const isBadge = headingStyleOf(v.type) === 'badge';
    const warn = 'tone' in v && v.tone === 'warn';
    return (
      <div style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
        {isBadge && 'heading' in v
          // a badge heading (e.g. callout) is a small label, styled as in 2D (not a scene heading)
          ? <div style={{
              fontSize: 32, letterSpacing: ls(3), textTransform: 'uppercase', fontFamily: MONO, fontWeight: 700,
              color: isAnime && warn ? '#ffffff' : C.ink,
              background: warn ? C.danger : C.primary, alignSelf: 'flex-start', padding: '4px 16px',
              ...(isAnime ? {border: `${BORDER}px solid ${C.ink}`, borderRadius: 6, boxShadow: `4px 4px 0 ${cel.shadowTint}`, transform: 'skewX(-8deg)'} : {}),
            }}>{v.heading}</div>
          : 'heading' in v && <Heading text={v.heading} />}
        <div style={{flex: 1}} />
        {cap && <div style={{fontSize: 30, color: C.dim, textAlign: 'center', ...(isAnime ? {fontWeight: 600} : {})}}>{cap}</div>}
      </div>
    );
  }
  const View2D = viewsOf(v).View2D;
  return View2D ? <View2D visual={v} frame={frame} lead={lead} audioFrames={audioFrames} reveal={reveal} prev={prev} focus={focus} rendered={rendered} figureAsset={figureAsset} figureAspect={figureAspect} /> : null;
};
