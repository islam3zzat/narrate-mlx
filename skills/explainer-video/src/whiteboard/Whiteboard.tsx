// `layout: "whiteboard"` renderer. No title bar, counter, slide transitions or boxed captions: scenes are drawn live on a paper board.
import React from 'react';
import {AbsoluteFill, Audio, Freeze, Sequence, staticFile, useCurrentFrame} from 'remotion';
import constants from '../constants.json';
import {ThemeContext, getTheme, type ThemeDef} from '../theme';
import {RtlContext} from '../rtl';
import {SceneBody} from '../visuals';
import type {Scene, VideoData} from '../types';
import {Annotations, HAND, INK, PAPER, clamp01} from '../sdk/annotate';
import {buildBoard} from './layouts';

/** The paper theme with the hand font as its text face (fixed fallbacks to the bundled Space Grotesk, never a system font,
 * so glyphs the hand font lacks, such as arrows, still render the same on every machine). Mono stays Space Mono: code
 * and numbers are laid out in character cells. */
export const boardTheme = (): ThemeDef => {
  const paper = getTheme('paper');
  return {...paper, FONT: `${HAND}, ${paper.FONT}`};
};

const Subtitle: React.FC<{scene: Scene; frame: number}> = ({scene, frame}) => {
  let cur = scene.sentences?.[0]?.text ?? scene.narration;
  for (const s of scene.sentences ?? []) if (frame >= scene.leadFrames + Math.round(s.start * constants.fps)) cur = s.text;
  return (
    <div style={{position: 'absolute', left: 140, right: 140, bottom: 34, textAlign: 'center', fontFamily: HAND, fontSize: 34, color: INK, opacity: 0.8, lineHeight: 1.25,
      textShadow: `0 0 6px ${PAPER}, 0 0 6px ${PAPER}, 0 0 10px ${PAPER}`}}>{cur}</div>
  );
};

const WipeOut: React.FC<{frame: number; frames: number; last: boolean}> = ({frame, frames, last}) => {
  const p = last ? 0 : clamp01((frame - (frames - 10)) / 10);
  if (p <= 0) return null;
  return <div style={{position: 'absolute', top: 0, bottom: 0, left: 0, width: p * 2000, background: PAPER, borderRight: `18px solid ${PAPER}`, boxShadow: '30px 0 40px 10px rgba(246,243,234,0.9)'}} />;
};

/** Hand-drawn look for every 2D type the board has no dedicated drawing for: the normal view, in hand lettering, with its
 * lines nudged off true by a seeded displacement (a fixed filter: no per-frame state, so renders repeat exactly). */
const Sketch: React.FC<{children: React.ReactNode; uid: string}> = ({children, uid}) => (
  <AbsoluteFill style={{padding: '120px 110px 230px 110px'}}>
    <svg width={0} height={0} style={{position: 'absolute'}}>
      <filter id={`${uid}-sketch`} x="-2%" y="-2%" width="104%" height="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <div style={{width: '100%', height: '100%', filter: `url(#${uid}-sketch)`}}>{children}</div>
  </AbsoluteFill>
);

export const BoardScene: React.FC<{scene: Scene; index: number; last: boolean; audio?: boolean}> = ({scene, index, last, audio = true}) => {
  const frame = useCurrentFrame();
  const items = React.useMemo(() => buildBoard(scene.visual, scene, index + 1), [scene, index]);
  const audioFrames = Math.round(scene.durationSec * constants.fps);
  return (
    <AbsoluteFill style={{background: 'transparent'}}>
      {items ? (
        <Annotations items={items} frame={frame} uid={`wb${index}`} />
      ) : (
        // no dedicated drawing for this type (graph, sequence, mermaid, table, plots, svg, ...): its own view, sketched
        <Sketch uid={`wb${index}`}>
          <SceneBody visual={scene.visual} frame={frame} lead={scene.leadFrames} audioFrames={audioFrames} reveal={scene.revealSec} focus={scene.focusSec} rendered={scene.mermaidRendered} figureAsset={scene.figureAsset} figureAspect={scene.figureAspect} />
        </Sketch>
      )}
      <Subtitle scene={scene} frame={frame} />
      <WipeOut frame={frame} frames={scene.frames} last={last} />
      {audio && <Sequence from={scene.leadFrames}><Audio src={staticFile(scene.audio)} /></Sequence>}
    </AbsoluteFill>
  );
};

/** Static paper: warm off-white with a seeded fractal-noise grain and a vignette, multiplied over everything (so the eraser wipe is textured too). */
export const PaperOverlay: React.FC = () => (
  <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'multiply'}}>
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
      <filter id="wb-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} />
        <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0.22 0" />
      </filter>
      <filter id="wb-fibre" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves={3} seed={9} />
        <feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0.16 0" />
      </filter>
      <rect width={1920} height={1080} filter="url(#wb-grain)" />
      <rect width={1920} height={1080} filter="url(#wb-fibre)" />
    </svg>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0) 55%, rgba(120,105,80,0.28) 100%)'}} />
  </AbsoluteFill>
);

export const WhiteboardExplainer: React.FC<{video: VideoData; frameMap?: number[]}> = ({video, frameMap}) => {
  const theme = boardTheme();
  let from = 0;
  const tree = (
    <ThemeContext.Provider value={theme}>
      <RtlContext.Provider value={false}>
        <AbsoluteFill style={{background: PAPER, fontFamily: HAND, color: INK}}>
          {video.scenes.map((s, i) => {
            const el = (
              <Sequence key={s.id} from={from} durationInFrames={s.frames}>
                <BoardScene scene={s} index={i} last={i === video.scenes.length - 1} />
              </Sequence>
            );
            from += s.frames;
            return el;
          })}
          <PaperOverlay />
        </AbsoluteFill>
      </RtlContext.Provider>
    </ThemeContext.Provider>
  );
  return Array.isArray(frameMap) && frameMap.length > 0 ? <FrameMapper frameMap={frameMap}>{tree}</FrameMapper> : tree;
};

const FrameMapper: React.FC<{frameMap: number[]; children: React.ReactNode}> = ({frameMap, children}) => {
  const f = useCurrentFrame();
  return <Freeze frame={frameMap[f] ?? 0}>{children}</Freeze>;
};
