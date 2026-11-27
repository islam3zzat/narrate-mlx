// Canonical 2D React/Remotion Visual SDK facade (outside src/visuals/).
import React from 'react';
import {useTheme} from '../theme';
import {Heading} from '../kit2d';
import {sanitizeStableId, sceneCanvasSize} from './pure';

export {interpolate, spring, Easing, useVideoConfig} from 'remotion';
export {
  useTheme,
  mixHex,
  type ThemeDef,
  type Palette,
  type ThemeName,
  type CelTokens,
} from '../theme';
export {useRtl, stripTashkeel} from '../rtl';
export {box, useBox, Heading, prog, inStyle, at} from '../kit2d';
export {
  useFocus,
  look,
  partIn,
  linkIn,
  camera,
  type FocusEvent,
  type FocusNow,
  type Rect,
} from '../focus';
export {PlotAxes, strokeForTone} from '../plot-svg';
export {type View2DProps} from '../visuals/props';
export {
  SCENE_CANVAS_W,
  SCENE_CANVAS_H,
  SCENE_CANVAS_H_CAPTION,
  sceneCanvasSize,
  sanitizeStableId,
} from './pure';

/** Deterministic SVG-safe element id derived from React.useId() to prevent TransitionSeries collisions. */
export const useStableId = (prefix: string): string => sanitizeStableId(prefix, React.useId());

export type SceneCanvasProps = {
  heading: string;
  caption?: string;
  ltr?: boolean;
  children: React.ReactNode | ((size: {width: number; height: number}) => React.ReactNode);
};

/** Safe-area 2D scene container with Heading, bounded drawing box, and optional bottom caption. */
export const SceneCanvas: React.FC<SceneCanvasProps> = ({heading, caption, ltr = false, children}) => {
  const {C, FONT} = useTheme();
  const size = sceneCanvasSize(!!caption);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Heading text={heading} />
      <div style={{position: 'relative', width: size.width, height: size.height, ...(ltr ? {direction: 'ltr'} : {})}}>
        {typeof children === 'function' ? children(size) : children}
      </div>
      {caption && (
        <div style={{fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.dim, textAlign: 'center', marginTop: 2}}>
          {caption}
        </div>
      )}
    </div>
  );
};
