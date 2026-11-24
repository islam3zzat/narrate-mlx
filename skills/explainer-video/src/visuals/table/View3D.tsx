// 3D view of the `table` visual. Moved from three/Cards3D.tsx (Table3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import {Mat, Block, Stage3D, canvasTexture, PX, type Visual3DProps} from '../../three/common';
import {Stand, VT, WHITE, popAt, useTextures} from '../../three/cards-kit';

export const View3D: React.FC<Visual3DProps<VT<'table'>>> = ({visual: v, frame, frames, at, rtl}) => {
  const {fps} = useVideoConfig();
  const th = useTheme();
  const {C, FONT, MONO, isAnime} = th;
  const n = v.rows.length;
  const W = 12, RH = 1.0, GAP = 0.12, HH = 1.0, POST = 0.4, DEPTH = 1.6, OUT = 0.8;
  const flex = v.headers.map((_, j) => (j === 0 ? 1.7 : 1.3));
  const fsum = flex.reduce((a, b) => a + b, 0);
  const rowTex = (cells: string[], fill: string, ink: string, h: number, mono: boolean, bold: (j: number) => boolean, size: number) =>
    canvasTexture(W * PX, h * PX, (ctx) => {
      const W2 = W * PX, H2 = h * PX, pad = 36;
      ctx.fillStyle = fill; ctx.fillRect(0, 0, W2, H2);
      ctx.fillStyle = ink; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textBaseline = 'middle'; ctx.textAlign = rtl ? 'right' : 'left';
      let acc = 0;
      cells.forEach((c, j) => {
        const cw = ((W2 - pad * 2) * flex[j]) / fsum;
        const x0 = rtl ? W2 - pad - acc : pad + acc;
        acc += cw;
        const fam = mono ? MONO : FONT;
        let s = size; ctx.font = `${bold(j) ? 700 : 400} ${s}px ${fam}`;
        const txt = mono && !rtl ? c.toUpperCase() : c;
        while (ctx.measureText(txt).width > cw - 24 && s > 18) { s -= 2; ctx.font = `${bold(j) ? 700 : 400} ${s}px ${fam}`; }
        ctx.fillText(txt, x0, H2 / 2 + 2);
      });
    });
  const head = useTextures(JSON.stringify([th.name, v.headers, rtl]), () => [rowTex(v.headers, C.ink, isAnime ? C.primary : WHITE, HH, true, () => true, 42)]);
  const rows = useTextures(JSON.stringify([th.name, v.rows, rtl]), () => v.rows.map((r, i) => rowTex(r, i % 2 ? C.muted : C.panel, C.ink, RH, false, (j) => j === 0, 46)));
  const inner = n * (RH + GAP) + GAP;
  const total = HH + inner + 0.25;                     // cabinet height: top rail + drawer bay + plinth
  const top = total;                                   // y of the cabinet's top (floor = 0)
  const CW = W + POST * 2;
  return (
    <Stage3D min={[-CW / 2 - 0.2, 0, -DEPTH / 2 - 0.2]} max={[CW / 2 + 0.5, top + 0.1, DEPTH / 2 + OUT + 0.4]} dir={[0.16, 0.3, 1]} frame={frame} frames={frames} rtl={rtl}>
      {/* carcass: back panel, two side posts, plinth */}
      <group position={[0, 0, -DEPTH / 2 + 0.15]}><Stand w={CW} h={top - HH} d={0.3} fill={C.primary} /></group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (W / 2 + POST / 2), 0, 0]}><Stand w={POST} h={top - HH} d={DEPTH} fill={C.primary} shadow={s > 0 ? 0.15 : 0} /></group>
      ))}
      <group position={[0, 0, 0]}><Stand w={W} h={0.25} d={DEPTH} fill={C.ink} outline={false} /></group>
      {/* top rail = header */}
      {head && (
        <group position={[0, top - HH, 0]}>
          <Stand w={CW} h={HH} d={DEPTH} fill={C.ink} front={head[0]} outline={false} shadow={0.15} />
        </group>
      )}
      {/* drawers */}
      {rows && v.rows.map((_, i) => {
        const p = popAt(frame, fps, at(i, n));
        const y = top - HH - GAP - (i + 1) * RH - i * GAP;
        const out = OUT * Math.min(1.12, Math.max(0, p));
        const shown = p > 0.05;
        return (
          <group key={i} position={[0, y, out]}>
            <group position={[0, RH / 2, 0]}>
              <Block w={W - 0.04} h={RH} d={DEPTH - 0.2} fill={i % 2 ? C.muted : C.panel} front={shown ? rows[i] : undefined} shadow={shown ? 0.1 : 0} />
            </group>
            {!shown && (
              <mesh position={[0, RH / 2, DEPTH / 2 - 0.1 + 0.08]}>
                <boxGeometry args={[1.6, 0.14, 0.1]} /><Mat color={C.ink} />
              </mesh>
            )}
          </group>
        );
      })}
    </Stage3D>
  );
};
