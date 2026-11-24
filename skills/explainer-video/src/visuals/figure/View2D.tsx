// 2D local paper figure viewer with narration-timed dim-outside spotlight, bounding boxes, and pan/zoom.
// Uses `<Img src={staticFile(figureAsset)} />` exclusively (never raw SVG HTML) and theme tokens only.
import React, {useId, useMemo} from 'react';
import {Easing, Img, interpolate, staticFile} from 'remotion';
import type {View2DProps} from '../props';
import {Heading, at} from '../../kit2d';
import {useFocus} from '../../focus';
import {mixHex, useTheme} from '../../theme';
import {strokeForTone} from '../../plot-svg';
import {fitFigureBox, lerpCamera, targetCameraForRegion} from './compute';

const TRANSITION_FRAMES = 18;

export const View2D: React.FC<View2DProps<'figure'>> = ({
  visual: v,
  frame,
  lead,
  audioFrames,
  reveal,
  focus,
  figureAsset,
  figureAspect,
}) => {
  const {C, FONT, BORDER, shadow} = useTheme();
  const rawId = useId();
  const maskId = `fig-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const focusNow = useFocus(focus, lead);

  const maxW = 1660;
  const maxH = v.caption ? 520 : 568;
  const aspect = v.aspect ?? figureAspect ?? 16 / 9;
  const {w: figW, h: figH} = useMemo(() => fitFigureBox(aspect, maxW, maxH), [aspect, maxW, maxH]);
  const regions = v.regions ?? [];

  const regionStarts = useMemo(
    () => regions.map((_, i) => at(i, regions.length, lead, audioFrames, reveal)),
    [regions, lead, audioFrames, reveal],
  );

  // Determine current and previous spotlighted region (explicit `focus` overrides timed region sequence).
  let curIdx = -1;
  let prevIdx = -1;
  let transitionStart = lead;
  let usingFocus = false;

  if (focusNow.cur !== null) {
    if (focusNow.cur.size > 0) {
      const match = regions.findIndex((r) => r.id && focusNow.cur!.has(r.id));
      if (match >= 0) {
        curIdx = match;
        if (focusNow.prev && focusNow.prev.size > 0) {
          prevIdx = regions.findIndex((r) => r.id && focusNow.prev!.has(r.id));
        }
        usingFocus = true;
      }
    }
  } else if (focusNow.prev && focusNow.prev.size > 0) {
    // Exiting `focus` via empty `"on": []`: ease smoothly back from the previously focused region.
    prevIdx = regions.findIndex((r) => r.id && focusNow.prev!.has(r.id));
    curIdx = -1;
    usingFocus = true;
  } else {
    for (let i = 0; i < regionStarts.length; i++) {
      if (frame >= regionStarts[i]) {
        prevIdx = curIdx;
        curIdx = i;
        transitionStart = regionStarts[i];
      }
    }
  }

  const p = usingFocus
    ? focusNow.p
    : interpolate(
        frame,
        [transitionStart, transitionStart + TRANSITION_FRAMES],
        [0, 1],
        {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)},
      );

  const prevRegion = prevIdx >= 0 ? regions[prevIdx] : null;
  const curRegion = curIdx >= 0 ? regions[curIdx] : null;
  const cam = lerpCamera(
    targetCameraForRegion(prevRegion, figW, figH),
    targetCameraForRegion(curRegion, figW, figH),
    curRegion ? p : 1,
  );

  const cardIn = interpolate(frame, [0, lead + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rx = curRegion ? curRegion.x * 1000 : 0;
  const ry = curRegion ? curRegion.y * 1000 : 0;
  const rw = curRegion ? curRegion.w * 1000 : 1000;
  const rh = curRegion ? curRegion.h * 1000 : 1000;
  const boxStroke = curRegion ? strokeForTone(curRegion.tone ?? 'primary', C) : C.primary;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center'}}>
      <div style={{width: 1700}}>
        <Heading text={v.heading} />
      </div>
      <div
        style={{
          position: 'relative',
          width: figW,
          height: figH,
          border: `${BORDER}px solid ${C.ink}`,
          boxShadow: shadow(6),
          borderRadius: 6,
          overflow: 'hidden',
          background: C.panel,
          direction: 'ltr',
          opacity: cardIn,
        }}
      >
        {/* Pan/zoom camera layer around figure & SVG spotlight overlay */}
        <div
          style={{
            position: 'relative',
            width: figW,
            height: figH,
            transformOrigin: '50% 50%',
            transform: `translate(${cam.tx.toFixed(2)}px, ${cam.ty.toFixed(2)}px) scale(${cam.scale.toFixed(4)})`,
          }}
        >
          {figureAsset ? (
            <Img
              src={staticFile(figureAsset)}
              style={{width: '100%', height: '100%', objectFit: 'fill', display: 'block'}}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 24,
                color: C.dim,
                background: mixHex(C.muted, C.panel, 0.5),
              }}
            >
              {v.alt}
            </div>
          )}

          {/* SVG spotlight dim-outside mask + active region frame */}
          {curRegion && (
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              style={{position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none'}}
            >
              <defs>
                <mask id={maskId}>
                  <rect x={0} y={0} width={1000} height={1000} fill="white" />
                  <rect x={rx} y={ry} width={rw} height={rh} rx={12} fill="black" />
                </mask>
              </defs>
              <rect
                x={0}
                y={0}
                width={1000}
                height={1000}
                fill={C.ink}
                fillOpacity={0.5 * p}
                mask={`url(#${maskId})`}
              />
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                rx={12}
                fill="none"
                stroke={C.panel}
                strokeWidth={9 / cam.scale}
                opacity={p}
              />
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                rx={12}
                fill="none"
                stroke={boxStroke}
                strokeWidth={4.5 / cam.scale}
                opacity={p}
              />
            </svg>
          )}
        </div>

        {/* Fixed HUD Callout pill in bottom-left inside clipped frame */}
        {curRegion && (
          <div
            style={{
              position: 'absolute',
              left: 18,
              bottom: 18,
              maxWidth: figW - 36,
              background: C.panel,
              border: `${BORDER}px solid ${C.ink}`,
              boxShadow: shadow(4),
              borderRadius: 6,
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity: p,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: boxStroke,
                border: `2px solid ${C.ink}`,
                flexShrink: 0,
              }}
            />
            <span style={{fontFamily: FONT, fontWeight: 900, fontSize: 22, color: C.ink}}>
              {curRegion.label}
            </span>
            {curRegion.note && (
              <span style={{fontFamily: FONT, fontWeight: 600, fontSize: 19, color: C.dim}}>
                — {curRegion.note}
              </span>
            )}
          </div>
        )}
      </div>
      {v.caption && (
        <div style={{fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.dim, textAlign: 'center', marginTop: 2}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
