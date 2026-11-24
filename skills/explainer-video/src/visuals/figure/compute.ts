// Pure camera pan/zoom & viewport clamping math for `figure`.
// Pure TS leaf (no React, Remotion, or Three).
import type {FigureRegionT} from './schema';

export type CameraTransform = {
  scale: number;
  tx: number; // pixel translate along X before scaling from center
  ty: number; // pixel translate along Y before scaling from center
};

/** Fit an image with natural `aspect` cleanly inside `maxW x maxH`. */
export function fitFigureBox(aspect: number, maxW: number, maxH: number): {w: number; h: number} {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  let w = maxW;
  let h = w / safeAspect;
  if (h > maxH) {
    h = maxH;
    w = h * safeAspect;
  }
  return {w: Math.round(w), h: Math.round(h)};
}

/**
 * Compute target camera transform `(scale, tx, ty)` relative to center `(0, 0)` of a `boxW x boxH` stage,
 * clamping translation so zoomed boundaries stay flush inside the frame (zero blank margin gaps).
 */
export function targetCameraForRegion(
  region: Pick<FigureRegionT, 'x' | 'y' | 'w' | 'h' | 'zoom'> | null,
  boxW: number,
  boxH: number,
): CameraTransform {
  if (!region) return {scale: 1, tx: 0, ty: 0};
  const autoZoom = Math.min(2.6, Math.max(1.35, 0.52 / Math.max(region.w, region.h)));
  const scale = Math.max(1, Math.min(3.5, region.zoom ?? autoZoom));
  if (scale <= 1.001) return {scale: 1, tx: 0, ty: 0};

  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  // Offset needed to bring normalized (cx, cy) to stage center (0.5, 0.5)
  const rawTx = (0.5 - cx) * boxW * scale;
  const rawTy = (0.5 - cy) * boxH * scale;
  const maxTx = ((scale - 1) * boxW) / 2;
  const maxTy = ((scale - 1) * boxH) / 2;
  return {
    scale,
    tx: Math.max(-maxTx, Math.min(maxTx, rawTx)),
    ty: Math.max(-maxTy, Math.min(maxTy, rawTy)),
  };
}

export function lerpCamera(a: CameraTransform, b: CameraTransform, t: number): CameraTransform {
  const k = Math.max(0, Math.min(1, t));
  return {
    scale: a.scale + (b.scale - a.scale) * k,
    tx: a.tx + (b.tx - a.tx) * k,
    ty: a.ty + (b.ty - a.ty) * k,
  };
}
