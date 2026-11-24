// 3D view of the `title` visual. Moved from three/Cards3D.tsx (Title3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import {Stage3D, canvasTexture, PX, useCardTextures, type Visual3DProps} from '../../three/common';
import {Fall, LandShadow, Stand, VT, popAt, useTextures} from '../../three/cards-kit';

export const View3D: React.FC<Visual3DProps<VT<'title'>>> = ({visual: v, frame, frames, rtl}) => {
  const {fps} = useVideoConfig();
  const {C, MONO, isAnime, name} = useTheme();
  const W = 9.8, H = 3.6, D = 0.9;                  // monolith
  const PW = 11.4, PH = 0.9, PD = 3.0;              // plinth
  const main = useCardTextures([{w: W, h: H, fill: C.panel, title: v.headline, titleSize: 124, sub: v.sub, subSize: 54, rtl, pad: 56}]);
  // The kicker is printed on the plinth's front face: an object standing in front of the monolith hid its text, and
  // a separate accent bar was a generic object competing with the title. The yellow plinth is the accent.
  const plinth = useTextures(`${name}|${v.kicker}|${rtl}`, () => [canvasTexture(PW * PX, PH * PX, (ctx) => {
    const w = PW * PX, h = PH * PX, pad = 56;
    ctx.fillStyle = C.primary; ctx.fillRect(0, 0, w, h);
    if (isAnime) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fillRect(0, 0, w, Math.round(h * 0.22));
      ctx.fillStyle = C.secondary;
      ctx.fillRect(rtl ? w - 26 : 0, 0, 26, h);
    }
    ctx.fillStyle = C.ink; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left'; ctx.textBaseline = 'middle';
    let size = 54; ctx.font = `700 ${size}px ${MONO}`;
    const txt = rtl ? v.kicker : v.kicker.toUpperCase();
    while (ctx.measureText(txt).width > w - pad * 2 && size > 20) { size -= 2; ctx.font = `700 ${size}px ${MONO}`; }
    ctx.fillText(txt, rtl ? w - pad : pad, h / 2 + 2);
  })]);
  const pPlinth = popAt(frame, fps, 0), pMono = popAt(frame, fps, 8);
  const monoZ = -0.7;
  return (
    <Stage3D min={[-PW / 2 - 0.3, -PH, -PD / 2 - 0.2]} max={[PW / 2 + 0.4, PH + H, PD / 2 + 0.8]} dir={[0.2, 0.3, 1]} frame={frame} frames={frames} rtl={rtl}>
      {plinth && (
        <Fall p={pPlinth} pos={[0, -PH, 0]} rise={-1.5}>
          <Stand w={PW} h={PH} d={PD} fill={C.primary} front={plinth[0]} shadow={0.2} />
        </Fall>
      )}
      {main && (
        <Fall p={pMono} pos={[0, 0, monoZ]} rise={4}>
          <LandShadow w={W} d={D} p={pMono} dx={0.3} dz={0.35} />
          <Stand w={W} h={H} d={D} fill={C.panel} front={main[0]} />
        </Fall>
      )}
    </Stage3D>
  );
};

// ------------------------------------------------------------------------------------------------ bullets
