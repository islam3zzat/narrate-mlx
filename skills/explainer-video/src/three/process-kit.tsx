// Helpers shared by several 3D views in Process3D.tsx's family (src/visuals/*/View3D.tsx). Moved from Process3D.tsx unchanged, with `export` added.
import {spring} from 'remotion';

export const SPRING = {damping: 14, stiffness: 140};

export const enter = (frame: number, start: number, fps: number) => Math.min(1.15, Math.max(0, spring({frame: frame - start, fps, config: SPRING})));

/** Vertical drop-in offset for an entrance progress s. */
export const drop = (s: number) => (1 - Math.min(1, s)) * 2.2;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
