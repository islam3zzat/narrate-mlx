// 3D view of the `fanout` visual. Moved from three/Process3D.tsx (Fanout3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import type {ScriptVisual} from '../../schema';
import {dotFill} from '../../flow';
import {Mat, Beam3D, Dots3D, Block, Stage3D, useCardTextures, type CardSpec, type Vec3, type Visual3DProps} from '../../three/common';
import {clamp01, drop, enter} from '../../three/process-kit';

type FanoutV = Extract<ScriptVisual, {type: 'fanout'}>;

// ------------------------------------------------------------------ fanout
export const View3D: React.FC<Visual3DProps<FanoutV>> = ({visual: v, frame, frames, at, rtl}) => {
  const {fps} = useVideoConfig();
  const {C, accents} = useTheme();
  const n = v.targets.length;
  const TW = 3.6, TH = 2.1, TD = 0.9, HW = 3.0, HH = 1.2, HD = 1.3;
  const R = n >= 3 ? 7.2 : n === 2 ? 5.8 : 5.2;
  const span = n === 1 ? 0 : n === 2 ? 36 : n === 3 ? 56 : 66;     // degrees either side of straight back
  const dirX = rtl ? -1 : 1;
  const ang = (i: number) => (n === 1 ? 0 : (-span + (2 * span * i) / (n - 1)) * Math.PI / 180);
  const tpos = (i: number): Vec3 => [Math.sin(ang(i)) * R * dirX, 0, -Math.cos(ang(i)) * R];
  const specs: CardSpec[] = [
    {w: HW, h: HH, fill: C.primary, title: v.source.label, titleSize: 62, align: 'center', rtl, pad: 22},
    ...v.targets.map((t, i): CardSpec => ({
      w: TW, h: TH, fill: accents[(i + 1) % 4], title: t.label, titleSize: 56, sub: t.sub, subSize: 36, align: 'center', rtl, pad: 22,
    })),
  ];
  const tex = useCardTextures(specs);
  const starts = v.targets.map((_, i) => at(i, n));
  const sS = enter(frame, 4, fps);
  const maxX = Math.max(HW / 2, ...v.targets.map((_, i) => Math.abs(tpos(i)[0]) + TW / 2));
  const minZ = Math.min(...v.targets.map((_, i) => tpos(i)[2])) - TD / 2;
  return (
    <Stage3D min={[-maxX, 0, minZ]} max={[maxX, HH + 0.3, HD / 2 + 0.4]} dir={[0.06, 0.5, 1]} frame={frame} frames={frames} rtl={rtl}>
      {/* hub pad */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[2.7, 2.7, 0.12, 40]} />
        <Mat color={C.muted} />
      </mesh>
      {tex && sS > 0.01 && (
        <group position={[0, HH / 2 + 0.12 + drop(sS) * 0.6, 0]}>
          <Block w={HW} h={HH} d={HD} fill={C.primary} front={tex[0]} shadow={0.16} />
        </group>
      )}
      {v.targets.map((_, i) => {
        const [x, , z] = tpos(i);
        const s = enter(frame, starts[i], fps);
        const p = clamp01((frame - starts[i] + 6) / 16);
        const len = Math.hypot(x, z);
        const ux = x / len, uz = z / len;
        // spoke along the floor, from the pad's edge to just before the target's front face
        const a: Vec3 = [ux * 1.9, 0.2, uz * 1.9];
        const b: Vec3 = [x, 0.2, z + TD / 2 + 1.5];
        const t0 = starts[i] + 14;
        return (
          <group key={i}>
            {tex && s > 0.01 && (
              <group position={[x, 0.12 + TH / 2 + drop(s) * 0.7, z]}>
                <Block w={TW} h={TH} d={TD} fill={accents[(i + 1) % 4]} front={tex[i + 1]} shadow={0.16} />
              </group>
            )}
            {p > 0 && <Beam3D a={a} b={b} p={p} thick={0.1} />}
            {/* data moving = spheres travelling along the arrow, the same symbol as every other diagram */}
            <Dots3D a={a} b={b} frame={frame} from={t0} color={dotFill(undefined, C)} period={56} />
          </group>
        );
      })}
    </Stage3D>
  );
};
