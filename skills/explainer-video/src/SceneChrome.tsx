// Shared scene chrome wrapper for Explainer.tsx and CatalogScene.tsx: background, top bar badges, 3D stage + BandProvider, 2D SceneBody, and Captions.
import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import constants from './constants.json';
import {AnimeBackdrop} from './AnimeBackdrop';
import {Captions, SceneBody} from './visuals';
import {lazyView} from './visuals/views';
import {useRtl} from './rtl';
import {useTheme} from './theme';
import {headingStyleOf, THREE_D_TYPES} from './visuals/capabilities';
import type {Scene, Visual} from './types';

const LazyScene3DHost = lazyView(() => import('./three/Scene3DHost'), '3d-host');

export type ChromeScene = Pick<
  Scene,
  'visual' | 'narration' | 'frames' | 'leadFrames' | 'revealSec' | 'focusSec' | 'mermaidRendered' | 'figureAsset' | 'figureAspect' | 'sentences'
>;

export type SceneChromeProps = {
  scene: ChromeScene;
  title: string;
  index?: number;
  count?: number;
  counterLabel?: string;
  prev?: Visual;
  fadeIn?: boolean;
  fadeOut?: boolean;
  mode3d: boolean;
  frame: number;
  audioFrames: number;
  children?: React.ReactNode;
};

export const SceneChrome: React.FC<SceneChromeProps> = ({
  scene,
  title,
  index = 0,
  count = 1,
  counterLabel,
  prev,
  fadeIn: doFadeIn = true,
  fadeOut: doFadeOut = true,
  mode3d,
  frame,
  audioFrames,
  children,
}) => {
  const rtl = useRtl();
  const {C, FONT, MONO, BORDER, isAnime, cel, shadow} = useTheme();
  // A diagram carried into the next scene stays on screen across the cut: no fade out here, no fade in there.
  const fadeIn = doFadeIn ? interpolate(frame, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  const fadeOut = doFadeOut ? interpolate(frame, [scene.frames - 8, scene.frames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  const fade = Math.min(fadeIn, fadeOut);
  const bgStyle: React.CSSProperties = isAnime
    ? {background: 'transparent', fontFamily: FONT, color: C.ink, ...(rtl ? {direction: 'rtl'} : {})}
    : {background: C.bg, backgroundImage: `radial-gradient(${C.ink}22 2px, transparent 2px)`, backgroundSize: '36px 36px', fontFamily: FONT, color: C.ink, ...(rtl ? {direction: 'rtl'} : {})};
  return (
    <AbsoluteFill style={bgStyle}>
      {children}
      {/* top bar: the title sits at the start edge and the counter/variant badge at the end edge (swapped when right to left) */}
      {isAnime ? (
        <>
          <div style={{
            position: 'absolute', top: 32, [rtl ? 'right' : 'left']: 90, display: 'flex', alignItems: 'center', gap: 12,
            background: C.panel, border: `${BORDER}px solid ${C.ink}`, borderRadius: 6, padding: '6px 18px 6px 14px',
            boxShadow: shadow(5, rtl), transform: 'skewX(-10deg)',
          }}>
            <span style={{width: 8, height: 22, background: C.secondary, display: 'inline-block', borderRadius: 2}} />
            <span style={{fontSize: 22, fontFamily: MONO, fontWeight: 700, color: C.ink, letterSpacing: rtl ? 0 : 1, transform: 'skewX(10deg)', display: 'inline-block'}}>
              {title}
            </span>
          </div>
          <div style={{
            position: 'absolute', top: 32, [rtl ? 'left' : 'right']: 90, display: 'flex', alignItems: 'center', gap: 10,
            background: C.primary, border: `${BORDER}px solid ${C.ink}`, borderRadius: 6, padding: '6px 16px',
            boxShadow: `4px 4px 0 ${cel.shadowTint}`, transform: 'skewX(-10deg)',
            ...(rtl ? {direction: 'ltr', unicodeBidi: 'isolate'} : {}),
          }}>
            <span style={{fontSize: 20, fontFamily: MONO, fontWeight: 700, color: C.ink, transform: 'skewX(10deg)', display: 'inline-block'}}>
              {counterLabel !== undefined ? counterLabel : <>{index + 1} / {count}</>}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{position: 'absolute', top: 40, [rtl ? 'right' : 'left']: 90, fontSize: 24, fontFamily: MONO, fontWeight: 700, color: C.ink, letterSpacing: rtl ? 0 : 1}}>
            {title}
          </div>
          <div style={{position: 'absolute', top: 40, [rtl ? 'left' : 'right']: 90, fontSize: 24, fontFamily: MONO, fontWeight: 700, color: C.ink, ...(rtl ? {direction: 'ltr', unicodeBidi: 'isolate'} : {})}}>
            {counterLabel !== undefined ? counterLabel : <>{index + 1} / {count}</>}
          </div>
        </>
      )}
      {(mode3d || (THREE_D_TYPES as readonly string[]).includes(scene.visual.type)) && (
        <AbsoluteFill style={{opacity: fade}}>
          <LazyScene3DHost scene={scene} frame={frame} audioFrames={audioFrames} rtl={rtl} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{opacity: fade, padding: '120px 110px 230px 110px'}}>
        <SceneBody visual={scene.visual} frame={frame} lead={scene.leadFrames} audioFrames={audioFrames} reveal={scene.revealSec} prev={prev} focus={scene.focusSec} textOnly={mode3d} rendered={scene.mermaidRendered} figureAsset={scene.figureAsset} figureAspect={scene.figureAspect} />
      </AbsoluteFill>
      <Captions text={scene.narration} frame={frame} lead={scene.leadFrames} audioFrames={audioFrames} aligned={scene.sentences} />
    </AbsoluteFill>
  );
};

export const ChromeBackdrop: React.FC<{children: React.ReactNode}> = ({children}) => {
  const theme = useTheme();
  return (
    <AbsoluteFill style={{background: theme.C.bg}}>
      {theme.isAnime && <AnimeBackdrop />}
      {children}
    </AbsoluteFill>
  );
};

export {constants};
