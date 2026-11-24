// 3D view of the `bullets` visual. Moved from three/Cards3D.tsx (Bullets3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import {Stage3D, useCardTextures, type CardSpec, type Visual3DProps} from '../../three/common';
import {Fall, LandShadow, Stand, VT, popAt, sx} from '../../three/cards-kit';

export const View3D: React.FC<Visual3DProps<VT<'bullets'>>> = ({visual: v, frame, frames, at, rtl}) => {
  const {fps} = useVideoConfig();
  const {C, accents} = useTheme();
  const n = v.items.length;
  const W = 12.2, IH = 0.95, ID = 0.7, RISE = 0.68, DZ = 1.25, MK = 1.0;
  const specs: CardSpec[] = v.items.map((t) => ({w: W - MK - 0.2, h: IH, fill: C.panel, title: t, titleSize: 60, rtl, pad: 34}));
  const tex = useCardTextures(specs);
  const m = sx(rtl);
  const top = (i: number) => 0.35 + i * RISE;          // height of the step surface under item i
  const zOf = (i: number) => -i * DZ;
  const maxTop = top(n - 1) + IH;
  return (
    <Stage3D min={[-W / 2 - 0.3, 0, zOf(n - 1) - DZ / 2]} max={[W / 2 + 0.5, maxTop + 0.1, DZ / 2 + 0.6]} dir={[0.14, 0.3, 1]} frame={frame} frames={frames} rtl={rtl}>
      {tex && v.items.map((_, i) => {
        const p = popAt(frame, fps, at(i, n));
        const col = accents[i % 4];
        const sh = top(i);
        return (
          <group key={i} position={[0, 0, zOf(i)]}>
            {/* the step: grows up from the floor as the item lands */}
            {p > 0.002 && <Stand w={W + 0.3} h={sh * Math.min(1, p)} d={DZ} fill={C.muted} shadow={0} />}
            <Fall p={p} pos={[0, sh, 0]} rise={2.4}>
              <LandShadow w={W - 0.2} d={ID} p={p} dx={0.22} dz={0.2} />
              <group position={[m * (MK / 2 + 0.1), 0, 0]}>
                <Stand w={W - MK - 0.2} h={IH} d={ID} fill={C.panel} front={tex[i]} />
              </group>
              <group position={[m * (-(W - MK) / 2 - 0.1 + 0.0), 0, 0]}>
                <Stand w={MK} h={IH} d={ID} fill={col} />
              </group>
            </Fall>
          </group>
        );
      })}
    </Stage3D>
  );
};

// ------------------------------------------------------------------------------------------------ callout
