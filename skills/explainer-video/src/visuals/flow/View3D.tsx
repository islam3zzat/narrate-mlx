// 3D view of the `flow` visual. Moved from three/Process3D.tsx (Flow3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import type {ScriptVisual} from '../../schema';
import {dotFill} from '../../flow';
import {Beam3D, Dots3D, Block, Stage3D, useCardTextures, type CardSpec, type Vec3, type Visual3DProps} from '../../three/common';
import {clamp01, drop, enter} from '../../three/process-kit';

type FlowV = Extract<ScriptVisual, {type: 'flow'}>;

// ------------------------------------------------------------------ flow
export const View3D: React.FC<Visual3DProps<FlowV>> = ({visual: v, frame, frames, at, rtl}) => {
  const {fps} = useVideoConfig();
  const {C, accents} = useTheme();
  const n = v.nodes.length;
  const W = n > 4 ? 3.1 : 3.4, H = 2.2, D = 1.1, GAP = n > 4 ? 1.8 : 2.2;
  const BELT_H = 0.3, LANE_Z = 1.25;
  const fills = v.nodes.map((_, i) => accents[i % 4]);
  const specs: CardSpec[] = v.nodes.map((nd, i) => ({
    w: W, h: H, fill: fills[i], title: nd.label, titleSize: 66, sub: nd.sub, subSize: 40, align: 'center', rtl, pad: 22,
  }));
  const tex = useCardTextures(specs);
  const pitch = W + GAP;
  const dirX = rtl ? -1 : 1;
  const xOf = (i: number) => (i - (n - 1) / 2) * pitch * dirX;
  const total = n * W + (n - 1) * GAP;
  const beltW = total + 1.2;
  const starts = v.nodes.map((_, i) => at(i, n));

  return (
    <Stage3D min={[-beltW / 2, 0, -D / 2 - 0.4]} max={[beltW / 2, BELT_H + H + 0.3, LANE_Z + 0.8]} dir={[0.12, 0.4, 1]} frame={frame} frames={frames} rtl={rtl}>
      {/* the track */}
      <group position={[0, BELT_H / 2, 0.3]}>
        <Block w={beltW} h={BELT_H} d={3.0} fill={C.muted} shadow={0.14} />
      </group>
      {/* direction chevrons on the lane, one per gap, appearing with the next station */}
      {v.nodes.map((_, i) => {
        if (i === 0) return null;
        const p = clamp01((frame - starts[i] + 4) / 14);
        if (p <= 0) return null;
        const a: Vec3 = [xOf(i - 1) + dirX * (W / 2 - 0.2), BELT_H + 0.06, LANE_Z];
        const b: Vec3 = [xOf(i) - dirX * (W / 2 - 0.2), BELT_H + 0.06, LANE_Z];
        return (
          <group key={i}>
            <Beam3D a={a} b={b} p={p} thick={0.1} />
            {/* data moving = spheres travelling along the arrow, the same symbol as every other diagram */}
            <Dots3D a={[a[0], a[1] + 0.12, a[2]]} b={[b[0], b[1] + 0.12, b[2]]} frame={frame} from={starts[i] + 12} color={dotFill(undefined, C)} />
          </group>
        );
      })}
      {tex && v.nodes.map((_, i) => {
        const s = enter(frame, starts[i], fps);
        if (s <= 0.01) return null;
        return (
          <group key={i} position={[xOf(i), BELT_H + H / 2 + drop(s) * 0.7, -0.2]}>
            <Block w={W} h={H} d={D} fill={fills[i]} front={tex[i]} shadow={0.16} />
          </group>
        );
      })}
    </Stage3D>
  );
};
