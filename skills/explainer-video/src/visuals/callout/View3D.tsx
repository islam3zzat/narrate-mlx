// 3D view of the `callout` visual. Moved from three/Cards3D.tsx (Callout3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {interpolate, useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import {Mat, Stage3D, useCardTextures, type Vec3, type Visual3DProps} from '../../three/common';
import {Fall, LandShadow, Stand, VT, popAt} from '../../three/cards-kit';

const scaleBox = (min: Vec3, max: Vec3, k: number): [Vec3, Vec3] => {
  const c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  return [[0, 1, 2].map((i) => c[i] + (min[i] - c[i]) * k) as Vec3, [0, 1, 2].map((i) => c[i] + (max[i] - c[i]) * k) as Vec3];
};

export const View3D: React.FC<Visual3DProps<VT<'callout'>>> = ({visual: v, frame, frames, rtl}) => {
  const {fps} = useVideoConfig();
  const {C, isAnime} = useTheme();
  const warn = v.tone === 'warn';
  const col = warn ? C.danger : C.primary;
  const W = 10.4, H = 3.8, D = 0.9, PW = 11.8, PH = 0.9, PD = 3.0;
  const tex = useCardTextures([{w: W, h: H, fill: C.panel, title: v.big, titleSize: 116, sub: v.text, subSize: 50, rtl, pad: 60}]);
  const pPed = popAt(frame, fps, 0), pMsg = popAt(frame, fps, 10);
  const spot = interpolate(frame, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const outer = isAnime ? (warn ? '#ffd4c7' : '#c6ebff') : (warn ? '#ffd2c9' : '#fff3a6');
  const inner = isAnime ? (warn ? '#ffe9e0' : '#fff4c2') : (warn ? '#ffe9e4' : '#fffbe0');
  // push-in: the framed box shrinks slowly over the whole scene
  const k = interpolate(frame, [0, frames], [1.1, 0.93], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const [bmin, bmax] = scaleBox([-PW / 2 - 0.5, -PH, -PD / 2 - 0.4], [PW / 2 + 0.6, PH + H, PD / 2 + 0.8], k);
  return (
    <Stage3D min={bmin} max={bmax} dir={[0.14, 0.34, 1]} frame={frame} frames={frames} rtl={rtl}>
      {/* the spotlight pool on the floor: flat discs, unlit */}
      <group position={[0, -PH - 0.04, 0.2]} scale={[spot, 1, spot]}>
        <mesh scale={[1, 1, 0.42]}><cylinderGeometry args={[10.5, 10.5, 0.04, 72]} /><Mat color={outer} /></mesh>
        <mesh position={[0, 0.02, 0]} scale={[1, 1, 0.42]}><cylinderGeometry args={[8.3, 8.3, 0.04, 72]} /><Mat color={inner} /></mesh>
      </group>
      <Fall p={pPed} pos={[0, -PH, 0]} rise={-1.2}>
        <Stand w={PW} h={PH} d={PD} fill={col} shadow={0.2} />
      </Fall>
      {tex && (
        <Fall p={pMsg} pos={[0, 0, -0.5]} rise={4}>
          <LandShadow w={W} d={D} p={pMsg} dx={0.3} dz={0.35} />
          <Stand w={W} h={H} d={D} fill={C.panel} front={tex[0]} />
        </Fall>
      )}
    </Stage3D>
  );
};
