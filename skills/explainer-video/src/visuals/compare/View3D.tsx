// 3D view of the `compare` visual. Moved from three/Cards3D.tsx (Compare3D); see three/common.tsx for the shared pieces.
import React from 'react';
import * as THREE from 'three';
import {useVideoConfig} from 'remotion';
import {useTheme, type ThemeDef} from '../../theme';
import {Stage3D, canvasTexture, PX, wrapText, type Vec3, type Visual3DProps} from '../../three/common';
import {Fall, LandShadow, Stand, VT, WHITE, clamp01, popAt, sx, useTextures} from '../../three/cards-kit';

const lerpBox = (a: [Vec3, Vec3], b: [Vec3, Vec3], t: number): [Vec3, Vec3] => [
  [0, 1, 2].map((i) => a[0][i] + (b[0][i] - a[0][i]) * t) as Vec3,
  [0, 1, 2].map((i) => a[1][i] + (b[1][i] - a[1][i]) * t) as Vec3,
];

// ------------------------------------------------------------------------------------------------ title

const looksCode = (s: string) => s.includes('_') || /^[A-Za-z]+[A-Z]/.test(s);

/** One stacked item's face: white block, black square bullet, text wrapped and shrunk to fit. */
function cardCanvas(text: string, w: number, h: number, rtl: boolean, th: ThemeDef): THREE.CanvasTexture {
  return canvasTexture(w * PX, h * PX, (ctx) => {
    const W2 = w * PX, H2 = h * PX, pad = 28;
    ctx.fillStyle = th.C.panel; ctx.fillRect(0, 0, W2, H2);
    if (th.isAnime) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(0, 0, W2, Math.max(8, Math.round(H2 * 0.12)));
    }
    ctx.fillStyle = th.C.ink; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = rtl ? 'right' : 'left';
    const x = rtl ? W2 - pad : pad, ind = 38;
    let size = 44, lines: string[] = [];
    for (let t = 0; t < 12; t++) {
      ctx.font = `500 ${size}px ${th.FONT}`;
      lines = wrapText(ctx, text, W2 - pad * 2 - ind);
      if (lines.length * size * 1.18 <= H2 - 22) break;
      size *= 0.92;
    }
    const total = lines.length * size * 1.18;
    let y = (H2 - total) / 2 + size * 0.95;
    ctx.fillRect(rtl ? x - 16 : x, H2 / 2 - 8, 16, 16);
    for (const l of lines) { ctx.fillText(l, rtl ? x - ind : x + ind, y); y += size * 1.18; }
  });
}

// ------------------------------------------------------------------------------------------------ table

export const View3D: React.FC<Visual3DProps<VT<'compare'>>> = ({visual: v, frame, frames, at, rtl}) => {
  const {fps} = useVideoConfig();
  const th = useTheme();
  const {C, FONT, MONO, accents, onAccent, isAnime} = th;
  const n = v.columns.length;
  const colW = n <= 2 ? 6 : n === 3 ? 4.9 : 4, GAP = n <= 2 ? 1.6 : 1.0;
  const PH = 0.5, PD = 3.2, IH = 1.15, ID = 1.5, TH = 1.7;
  const longest = Math.max(...v.columns.map((c) => c.items.length));
  const totalW = n * colW + (n - 1) * GAP;
  const stackH = longest * IH + TH;
  const caps = useTextures(JSON.stringify([th.name, v.columns.map((c) => [c.title, c.tag]), rtl, colW]), () => v.columns.map((c, i) => canvasTexture(colW * PX, TH * PX, (ctx) => {
    const w = colW * PX, h = TH * PX, fill = accents[i % 4], ink = onAccent(fill);
    ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h);
    if (isAnime) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.fillRect(0, 0, w, Math.round(h * 0.14));
    }
    ctx.fillStyle = ink; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const fam = looksCode(c.title) ? MONO : FONT;
    let size = 64; ctx.font = `700 ${size}px ${fam}`;
    while (ctx.measureText(c.title).width > w - 48 && size > 24) { size -= 2; ctx.font = `700 ${size}px ${fam}`; }
    ctx.fillText(c.title, w / 2, h * 0.5);
    let ts = 32; ctx.font = `700 ${ts}px ${MONO}`; ctx.globalAlpha = 0.8;
    while (ctx.measureText(c.tag).width > w - 48 && ts > 16) { ts -= 2; ctx.font = `700 ${ts}px ${MONO}`; }
    ctx.fillText(c.tag, w / 2, h * 0.5 + 54);
  })));
  const items = useTextures(JSON.stringify([th.name, v.columns.map((c) => c.items), rtl, colW]), () => v.columns.flatMap((c) => c.items.map((t) => cardCanvas(t, colW - 0.3, IH, rtl, th))));
  const starts = v.columns.map((_, i) => at(i, n));
  // The islands are the stage: they all land at the start (a little staggered), so the scene is never empty while the
  // narration builds up to the first option and the viewer sees how many options there are. Each island's title and
  // items still arrive when the narration names that option.
  const pPlat = starts.map((_, i) => popAt(frame, fps, 3 + i * 5));
  // camera: ease to the island that was revealed last, then back to the whole row before the next one
  let active = -1;
  for (let i = 0; i < n; i++) if (frame >= starts[i]) active = i;
  const full: [Vec3, Vec3] = [[-totalW / 2 - 0.3, -PH, -PD / 2 - 0.2], [totalW / 2 + 0.4, stackH + 0.1, PD / 2 + 0.6]];
  let box = full;
  if (active >= 0) {
    const age = frame - starts[active];
    const gap = active < n - 1 ? starts[active + 1] - starts[active] : Math.max(30, Math.min(70, frames - 14 - starts[active]));
    const w = 0.85 * clamp01(age / 12) * clamp01((gap - age) / 14);
    const cx = (-totalW / 2 + colW / 2 + active * (colW + GAP));
    const x = rtl ? -cx : cx;
    const focus: [Vec3, Vec3] = [[x - colW / 2 - 1.0, -PH, -PD / 2], [x + colW / 2 + 1.0, stackH + 0.1, PD / 2 + 0.6]];
    box = lerpBox(full, focus, w);
  }
  const m = sx(rtl);
  let base = 0;
  const offsets = v.columns.map((c) => { const o = base; base += c.items.length; return o; });
  return (
    <Stage3D min={box[0]} max={box[1]} dir={[0.14, 0.3, 1]} frame={frame} frames={frames} rtl={rtl}>
      {caps && items && v.columns.map((c, i) => {
        const x = m * (-totalW / 2 + colW / 2 + i * (colW + GAP));
        const p0 = pPlat[i], k = c.items.length;
        const s0 = starts[i];
        const pTitle = popAt(frame, fps, s0 + 6 + k * 4);
        return (
          <group key={i} position={[x, 0, 0]}>
            <Fall p={p0} pos={[0, -PH, 0]} rise={-1.4}>
              <Stand w={colW + 0.6} h={PH} d={PD} fill={accents[i % 4]} shadow={0.18} />
            </Fall>
            {/* items stack bottom-up (last item lowest), so the first item sits just under the title */}
            {c.items.map((_, j) => {
              const level = k - 1 - j;                     // 0 = bottom
              const pj = popAt(frame, fps, s0 + 4 + level * 4);
              return (
                <Fall key={j} p={pj} pos={[0, level * IH, 0]} rise={3}>
                  {level === 0 && <LandShadow w={colW - 0.3} d={ID} p={pj} />}
                  <Stand w={colW - 0.3} h={IH} d={ID} fill={C.panel} front={items[offsets[i] + j]} />
                </Fall>
              );
            })}
            <Fall p={pTitle} pos={[0, k * IH, 0]} rise={3.2}>
              <Stand w={colW} h={TH} d={ID + 0.3} fill={accents[i % 4]} front={caps[i]} />
            </Fall>
          </group>
        );
      })}
    </Stage3D>
  );
};
