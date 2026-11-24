// 3D view of the `mermaid` visual. Moved from three/Diagram3D.tsx (Mermaid3D); see three/common.tsx for the shared pieces.
import React from 'react';
import * as THREE from 'three';
import {cancelRender, continueRender, delayRender, spring, staticFile, useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import type {Visual} from '../../types';
import {Mat, Block, Stage3D, canvasTexture, useFontsReady, type Visual3DProps} from '../../three/common';

type MermaidV = Extract<Visual, {type: 'mermaid'}>;

type Loaded = {tex: THREE.CanvasTexture; aspect: number} | null;

/** The scene's SVG drawn onto a canvas texture (sized from its viewBox). Holds the render until it has loaded. */
function useSvgTexture(src: string | undefined): Loaded {
  const [res, setRes] = React.useState<Loaded>(null);
  const ready = useFontsReady();
  const {C} = useTheme();
  // One handle from mount until the texture is on the canvas (committed, then two animation frames, as in
  // useFontsReady), released on unmount too; a failed load fails the render instead of leaving an empty scene.
  const [handle] = React.useState(() => delayRender('mermaid svg'));
  const released = React.useRef(false);
  const release = React.useCallback(() => { if (!released.current) { released.current = true; continueRender(handle); } }, [handle]);
  React.useEffect(() => () => release(), [release]);
  React.useEffect(() => {
    if (!src) { release(); return; }
    if (!ready) return;
    let dead = false, made: THREE.CanvasTexture | null = null, url = '';
    (async () => {
      try {
        const r = await fetch(staticFile(src));
        if (!r.ok) throw new Error(`mermaid svg ${src}: HTTP ${r.status}`);
        const text = await r.text();
        const vb = /viewBox="([-\d.\s,e]+)"/.exec(text)?.[1].split(/[\s,]+/).map(Number);
        const vw = vb?.[2] || 1000, vh = vb?.[3] || 600;
        // give the root an explicit pixel size, so the image has the right natural size
        const sized = text.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '').replace(/\sstyle="[^"]*"/, '').replace('<svg', `<svg width="${vw}" height="${vh}"`));
        // data: URL (not blob:) so SVGs containing <foreignObject> HTML labels do not taint the 2D canvas for WebGL texImage2D
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
        const img = new Image();
        await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error(`mermaid svg ${src}: the image did not load`)); img.src = dataUrl; });
        const maxSide = 1800;
        const scale = Math.min(maxSide / Math.max(vw, vh), Math.max(900 / vw, 1.5));
        const cw = Math.max(1, Math.round(vw * scale)), ch = Math.max(1, Math.round(vh * scale));
        made = canvasTexture(cw, ch, (ctx) => {
          ctx.fillStyle = C.bg; ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
        });
        if (dead) made.dispose();          // unmounted while loading: nobody else will free it
        else setRes({tex: made, aspect: vw / vh});
      } catch (e) {
        if (!dead) cancelRender(e as Error);
      }
    })();
    return () => { dead = true; made?.dispose(); if (url) URL.revokeObjectURL(url); };
  }, [src, ready, release, C.bg]);
  React.useEffect(() => {
    if (!res) return;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(release); });
    return () => cancelAnimationFrame(id);
  }, [res, release]);
  return res;
}

export const View3D: React.FC<Visual3DProps<MermaidV>> = ({visual: v, frame, frames, rtl, rendered}) => {
  const {fps} = useVideoConfig();
  const {C} = useTheme();
  const img = useSvgTexture(rendered?.svg ?? (v as {svg?: string}).svg);
  const p = spring({frame: frame - 4, fps, config: {damping: 16, stiffness: 100}});
  const MAXW = 13.4, MAXH = 6.2, PAD = 0.42, D = 0.4;
  const aspect = img?.aspect ?? 2;
  const bw = Math.min(MAXW, MAXH * aspect), bh = bw / aspect;
  const tilt = (1 - Math.min(p, 1)) * -0.35 + 0.03;
  return (
    <Stage3D min={[-bw / 2 - PAD, -bh / 2 - PAD, -D]} max={[bw / 2 + PAD + 0.2, bh / 2 + PAD, D]} dir={[0.08, 0.2, 1]} fill={[0.9, 0.6]} frame={frame} frames={frames} rtl={rtl}>
      {img && p > 0.001 && (
        <group rotation={[0, tilt * (rtl ? -1 : 1), 0]} scale={[0.85 + 0.15 * Math.min(p, 1), 0.85 + 0.15 * Math.min(p, 1), 1]}>
          <Block w={bw + PAD * 2} h={bh + PAD * 2} d={D} fill={C.primary} shadow={0.14} />
          <mesh position={[0, 0, D / 2 + 0.004]}>
            <planeGeometry args={[bw + 0.14, bh + 0.14]} />
            <Mat color={C.ink} />
          </mesh>
          <mesh position={[0, 0, D / 2 + 0.01]}>
            <planeGeometry args={[bw, bh]} />
            <Mat map={img.tex} />
          </mesh>
        </group>
      )}
    </Stage3D>
  );
};
