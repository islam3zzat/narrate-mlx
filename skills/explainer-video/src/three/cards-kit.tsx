// Helpers shared by several 3D views in Cards3D.tsx's family (src/visuals/*/View3D.tsx). Moved from Cards3D.tsx unchanged, with `export` added.
import React from 'react';
import * as THREE from 'three';
import {spring} from 'remotion';
import {useTheme} from '../theme';
import {Mat, Block, type Vec3, useFontsReady} from './common';
import type {ScriptVisual} from '../schema';

export type VT<T extends string> = Extract<ScriptVisual, {type: T}>;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Spring 0..1 (slight overshoot) starting at `start`. A plain function, so it may be called in loops. */
export const popAt = (frame: number, fps: number, start: number) => spring({frame: frame - start, fps, config: {damping: 14, stiffness: 140}});

/** Textures from a builder, made once fonts are ready; disposed on change. */
export function useTextures(key: string, build: () => THREE.CanvasTexture[]): THREE.CanvasTexture[] | null {
  const ready = useFontsReady();
  const tex = React.useMemo(() => (ready ? build() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, key]);
  React.useEffect(() => () => tex?.forEach((t) => t.dispose()), [tex]);
  return tex;
}

/** Falls from `rise` above its resting place; invisible until it starts. The group origin is the resting surface. */
export const Fall: React.FC<{p: number; pos: Vec3; rise?: number; children: React.ReactNode}> = ({p, pos, rise = 2.2, children}) => {
  if (p <= 0.002) return null;
  // clamped: the spring overshoots past 1, which would sink the object below the surface it lands on
  return <group position={[pos[0], pos[1] + (1 - Math.min(p, 1)) * rise, pos[2]]}>{children}</group>;
};

/** A flat ink/cel patch on a surface (y = 0 of the parent), growing as the object lands. */
export const LandShadow: React.FC<{w: number; d: number; p: number; dx?: number; dz?: number}> = ({w, d, p, dx = 0.22, dz = 0.2}) => {
  const th = useTheme();
  return (
    <mesh position={[dx, 0.015, dz]} rotation={[-Math.PI / 2, 0, 0]} scale={[clamp01(p), clamp01(p), 1]}>
      <planeGeometry args={[w, d]} />
      <Mat color={th.isAnime ? th.cel.shadowTint : th.C.ink} />
    </mesh>
  );
};

/** A slab with a flat face texture, standing on y = 0 (its bottom), centred on x, z = 0. */
export const Stand: React.FC<{w: number; h: number; d: number; fill: string; front?: THREE.Texture; shadow?: number; outline?: boolean}> = ({w, h, d, fill, front, shadow = 0, outline = true}) => (
  <group position={[0, h / 2, 0]}><Block w={w} h={h} d={d} fill={fill} front={front} shadow={shadow} outline={outline} /></group>
);

export const sx = (rtl: boolean) => (rtl ? -1 : 1);

export const WHITE = '#ffffff';
