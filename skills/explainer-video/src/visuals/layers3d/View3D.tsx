// 3D view of the `layers3d` visual. Moved from three/Layers3D.tsx (Layers3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import type {Visual} from '../../types';
import {useRtl} from '../../rtl';
import {Block, Stage3D, useCardTextures, type CardSpec, type Visual3DProps} from '../../three/common';

type V = Extract<Visual, {type: 'layers3d'}>;

const W = 7, D = 3.2, H = 0.95, GAP = 1.75;   // slab size and vertical pitch, in world units

const DROP = 3.5;                             // how far above its place a slab starts falling

const Layers3D: React.FC<{visual: V; frame: number; frames: number; at: (i: number) => number}> = ({visual: v, frame, frames, at}) => {
  const rtl = useRtl();
  const {fps} = useVideoConfig();
  const {C} = useTheme();
  const TONE: Record<string, string> = {neutral: C.panel, primary: C.primary, secondary: C.secondary, accent: C.accent, danger: C.danger};
  const CYCLE = [C.primary, C.accent, C.secondary, C.panel];
  const fills = v.layers.map((l, i) => (l.tone ? TONE[l.tone] : CYCLE[i % CYCLE.length]));
  const specs: CardSpec[] = v.layers.map((l, i) => ({w: W, h: H, fill: fills[i], title: l.label, titleSize: l.sub ? 44 : 52, sub: l.sub, subSize: 28, rtl, pad: 40}));
  const tex = useCardTextures(specs);
  const top = (v.layers.length - 1) * GAP + H / 2;
  return (
    <Stage3D min={[-W / 2, -H / 2 - 0.2, -D / 2 - 0.2]} max={[W / 2 + 0.2, top, D / 2]} dir={[0.42, 0.36, 1]} frame={frame} frames={frames} rtl={rtl}>
      {tex && v.layers.map((l, i) => {
        // clamped: the spring overshoots past 1, which would push a slab below its place in the stack
        const s = Math.min(1, spring({frame: frame - at(i), fps, config: {damping: 14, stiffness: 140}}));
        if (s <= 0.001) return null;
        return (
          <group key={l.id} position={[0, i * GAP + (1 - s) * DROP, 0]}>
            <Block w={W} h={H} d={D} fill={fills[i]} front={tex[i]} shadow={0.14} />
          </group>
        );
      })}
    </Stage3D>
  );
};

/** The scene's props, as every 3D view gets them: `at` takes (i, n) here and is narrowed to the layer count. */
export const View3D: React.FC<Visual3DProps<V>> = (p) => <Layers3D visual={p.visual} frame={p.frame} frames={p.frames} at={(i) => p.at(i, p.visual.layers.length)} />;
