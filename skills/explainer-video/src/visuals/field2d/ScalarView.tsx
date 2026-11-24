// Scalar contour map view with slice cross-section, gradient arrows, RK4 ascent/descent trails, and extrema pins.
import React from 'react';
import {mixHex, useTheme} from '../../theme';
import {at, prog} from '../../kit2d';
import {look, partIn, type FocusNow} from '../../focus';
import {PlotAxes, PlotCurve, PlotMarker, fillForTone, strokeForTone} from '../../plot-svg';
import {formatNum, sampleCurve, segmentsToPaths, stageProgress, toPxX, toPxY, type Pt, type Viewport} from '../plot-kit';
import {compile2D} from '../math-expr';
import {grad2D, marchingSquaresSegments, sampleScalarGrid} from './marching';
import {integrateGradientPath} from './particles';
import type {Visual} from '../../types';

export type Field2DV = Extract<Visual, {type: 'field2d'}>;

const SVG_W = 1700;

export const ScalarView: React.FC<{
  visual: Field2DV;
  frame: number;
  lead: number;
  audioFrames: number;
  reveal?: number[];
  focusNow: FocusNow;
  boxH: number;
}> = ({visual: v, frame, lead, audioFrames, reveal, focusNow, boxH}) => {
  const {C, MONO, BORDER, shadow} = useTheme();
  const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const mainClip = `${uid}-sc`;
  const sliceClip = `${uid}-sl`;
  const arrowId = `${uid}-arr`;

  const overlays = React.useMemo(() => v.overlays ?? [], [v.overlays]);
  const activeSlice = overlays.find((o) => o.kind === 'slice') as Extract<NonNullable<Field2DV['overlays']>[number], {kind: 'slice'}> | undefined;
  const hasSlice = !!activeSlice;

  const mainW = hasSlice ? 1050 : 1520;
  const pxRect = React.useMemo(() => ({x: 118, y: 20, w: mainW, h: boxH - 100}), [mainW, boxH]);
  const vp: Viewport = React.useMemo(() => ({x: v.xDomain, y: v.yDomain, px: pxRect}), [v.xDomain, v.yDomain, pxRect]);

  const fn = React.useMemo(() => compile2D(v.expr ?? '0') ?? (() => 0), [v.expr]);
  const grid = React.useMemo(() => sampleScalarGrid(fn, v.xDomain, v.yDomain, 36, 24), [fn, v.xDomain, v.yDomain]);
  const levels = v.levels ?? 8;
  const contours = React.useMemo(() => {
    const out: {level: number; t: number; segs: [Pt, Pt][]}[] = [];
    for (let k = 1; k <= levels; k++) {
      const t = k / (levels + 1);
      const lvl = grid.min + t * (grid.max - grid.min);
      out.push({level: lvl, t, segs: marchingSquaresSegments(grid, lvl)});
    }
    return out;
  }, [grid, levels]);

  const xSpan = v.xDomain[1] - v.xDomain[0];
  const ySpan = v.yDomain[1] - v.yDomain[0];
  const baseIn = prog(frame, 4, 18);

  const heatmapEls = React.useMemo(() => {
    const cellFill = (val: number) => {
      const t = Math.max(0, Math.min(1, (val - grid.min) / (grid.max - grid.min || 1)));
      return t < 0.5
        ? mixHex(C.panel, C.accent, t * 0.44)
        : mixHex(mixHex(C.panel, C.accent, 0.22), C.primary, (t - 0.5) * 0.72);
    };
    return Array.from({length: grid.ny}, (_, j) =>
      Array.from({length: grid.nx}, (_, i) => {
        const avg = 0.25 * (grid.values[j][i] + grid.values[j][i + 1] + grid.values[j + 1][i] + grid.values[j + 1][i + 1]);
        if (!Number.isFinite(avg)) return null;
        const x0 = toPxX(grid.xs[i], vp), x1 = toPxX(grid.xs[i + 1], vp);
        const y0 = toPxY(grid.ys[j + 1], vp), y1 = toPxY(grid.ys[j], vp);
        return (
          <rect
            key={`c-${j}-${i}`}
            x={x0}
            y={y0}
            width={Math.max(1, x1 - x0 + 0.6)}
            height={Math.max(1, y1 - y0 + 0.6)}
            fill={cellFill(avg)}
          />
        );
      }),
    );
  }, [grid, vp, C.panel, C.accent, C.primary]);

  const contourEls = React.useMemo(() => {
    const stroke = mixHex(C.ink, C.dim, 0.35);
    return contours.map((c, ci) => (
      <g key={ci}>
        {c.segs.map(([a, b], si) => (
          <line
            key={si}
            x1={toPxX(a.x, vp)}
            y1={toPxY(a.y, vp)}
            x2={toPxX(b.x, vp)}
            y2={toPxY(b.y, vp)}
            stroke={stroke}
            strokeWidth={2}
          />
        ))}
      </g>
    ));
  }, [contours, vp, C.ink, C.dim]);

  const gradArrows = React.useMemo(() => {
    const map = new Map<number, {px: number; py: number; ux: number; uy: number; baseLen: number}[]>();
    const arrowMaxPx = Math.min(vp.px.w, vp.px.h) * 0.095;
    overlays.forEach((ov, oi) => {
      if (ov.kind !== 'gradient') return;
      const pts: [number, number][] = ov.points ?? (() => {
        const auto: [number, number][] = [];
        for (let gx = 1; gx <= 5; gx++) {
          for (let gy = 1; gy <= 4; gy++) {
            auto.push([v.xDomain[0] + (gx / 6) * xSpan, v.yDomain[0] + (gy / 5) * ySpan]);
          }
        }
        return auto;
      })();
      const arrows: {px: number; py: number; ux: number; uy: number; baseLen: number}[] = [];
      for (const [gx, gy] of pts) {
        const [dx, dy] = grad2D(fn, gx, gy, xSpan, ySpan);
        const mag = Math.hypot(dx, dy);
        if (mag < 1e-4) continue;
        arrows.push({
          px: toPxX(gx, vp),
          py: toPxY(gy, vp),
          ux: dx / mag,
          uy: -dy / mag,
          baseLen: Math.max(16, arrowMaxPx * (0.35 + 0.65 * Math.min(1, mag / 0.9))),
        });
      }
      map.set(oi, arrows);
    });
    return map;
  }, [overlays, fn, v.xDomain, v.yDomain, xSpan, ySpan, vp]);

  const pathTrails = React.useMemo(() => {
    const map = new Map<number, Pt[][]>();
    overlays.forEach((ov, oi) => {
      if (ov.kind === 'path') {
        map.set(oi, ov.starts.map((st) => integrateGradientPath(fn, st, ov.direction, v.xDomain, v.yDomain, ov.steps ?? 48)));
      }
    });
    return map;
  }, [overlays, fn, v.xDomain, v.yDomain]);

  const sliceVp: Viewport | null = React.useMemo(() => {
    if (!activeSlice) return null;
    const dom = activeSlice.axis === 'x' ? v.yDomain : v.xDomain;
    return {
      x: dom,
      y: [grid.min - (grid.max - grid.min) * 0.08, grid.max + (grid.max - grid.min) * 0.08],
      px: {x: 1270, y: 20, w: 380, h: boxH - 100},
    };
  }, [activeSlice, v.xDomain, v.yDomain, grid.min, grid.max, boxH]);

  const slicePaths = React.useMemo(() => {
    if (!activeSlice || !sliceVp) return [];
    const f1d = activeSlice.axis === 'x' ? (t: number) => fn(activeSlice.at, t) : (t: number) => fn(t, activeSlice.at);
    return segmentsToPaths(sampleCurve(f1d, sliceVp.x[0], sliceVp.x[1], sliceVp.y[0], sliceVp.y[1], 140), sliceVp);
  }, [activeSlice, sliceVp, fn]);

  return (
    <div style={{direction: 'ltr', width: SVG_W, height: boxH, position: 'relative'}}>
      <svg width={SVG_W} height={boxH} viewBox={`0 0 ${SVG_W} ${boxH}`} style={{overflow: 'visible'}}>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill={C.secondary} />
          </marker>
        </defs>

        <PlotAxes vp={vp} clipId={mainClip} xLabel={v.xLabel} yLabel={v.yLabel} />

        <g clipPath={`url(#${mainClip})`} opacity={baseIn}>
          {/* Elevation tint cells */}
          {heatmapEls}

          {/* Topographic contour lines */}
          {contourEls}

          {/* Overlays */}
          {overlays.map((ov, oi) => {
            const start = at(oi, overlays.length, lead, audioFrames, reveal);
            const p = stageProgress(frame, start, 22);
            if (p <= 0) return null;
            const l = look(focusNow, (set) => (ov.id ? partIn(ov.id)(set) : false));
            const op = p * l.opacity;

            if (ov.kind === 'slice') {
              const x1 = ov.axis === 'x' ? toPxX(ov.at, vp) : vp.px.x;
              const x2 = ov.axis === 'x' ? toPxX(ov.at, vp) : vp.px.x + vp.px.w;
              const y1 = ov.axis === 'y' ? toPxY(ov.at, vp) : vp.px.y;
              const y2 = ov.axis === 'y' ? toPxY(ov.at, vp) : vp.px.y + vp.px.h;
              return (
                <line key={oi} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.danger} strokeWidth={4.5} strokeDasharray="10 6" opacity={op} />
              );
            }

            if (ov.kind === 'gradient') {
              const arrows = gradArrows.get(oi) ?? [];
              return (
                <g key={oi} opacity={op}>
                  {arrows.map((ar, pi) => {
                    const len = ar.baseLen * p;
                    return (
                      <line
                        key={pi}
                        x1={ar.px}
                        y1={ar.py}
                        x2={ar.px + ar.ux * len}
                        y2={ar.py + ar.uy * len}
                        stroke={C.secondary}
                        strokeWidth={3.5}
                        markerEnd={`url(#${arrowId})`}
                      />
                    );
                  })}
                </g>
              );
            }

            if (ov.kind === 'path') {
              const trails = pathTrails.get(oi) ?? [];
              return (
                <g key={oi} opacity={op}>
                  {trails.map((trail, si) => {
                    const count = Math.max(2, Math.round(trail.length * p));
                    const shown = trail.slice(0, count);
                    const d = shown.map((pt, k) => `${k === 0 ? 'M' : 'L'} ${toPxX(pt.x, vp).toFixed(1)} ${toPxY(pt.y, vp).toFixed(1)}`).join(' ');
                    const last = shown[shown.length - 1];
                    const tone = si === 0 ? 'secondary' : si === 1 ? 'accent' : 'danger';
                    return (
                      <g key={si}>
                        <path d={d} fill="none" stroke={C.panel} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
                        <path d={d} fill="none" stroke={strokeForTone(tone, C)} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
                        <PlotMarker cx={toPxX(last.x, vp)} cy={toPxY(last.y, vp)} fill={fillForTone(tone, C)} r={8} />
                      </g>
                    );
                  })}
                </g>
              );
            }

            if (ov.kind === 'extrema') {
              return (
                <g key={oi} opacity={op}>
                  {ov.points.map((ep, ei) => (
                    <PlotMarker
                      key={ei}
                      cx={toPxX(ep.at[0], vp)}
                      cy={toPxY(ep.at[1], vp)}
                      fill={fillForTone(ep.tone ?? 'primary', C)}
                      r={9}
                      tag={ep.tag}
                    />
                  ))}
                </g>
              );
            }
            return null;
          })}
        </g>

        {/* Slice cross-section 1D subplot when slice overlay exists */}
        {activeSlice && sliceVp && (() => {
          const idx = overlays.indexOf(activeSlice);
          const sp = stageProgress(frame, at(idx, overlays.length, lead, audioFrames, reveal), 22);
          const l = look(focusNow, (set) => (activeSlice.id ? partIn(activeSlice.id)(set) : false));
          return (
            <g opacity={Math.max(0.2, sp) * l.opacity}>
              <PlotAxes
                vp={sliceVp}
                clipId={sliceClip}
                xLabel={`${activeSlice.axis === 'x' ? 'y' : 'x'} (slice ${activeSlice.axis}=${formatNum(activeSlice.at, 1)})`}
                fontSize={18}
              />
              <g clipPath={`url(#${sliceClip})`}>
                <PlotCurve paths={slicePaths} color={C.danger} progress={sp} strokeWidth={4.5} haloColor={C.panel} />
              </g>
            </g>
          );
        })()}
      </svg>

      {/* Scalar gradient color key badge */}
      <div
        style={{
          position: 'absolute',
          right: hasSlice ? 545 : 75,
          top: 28,
          background: C.panel,
          border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
          boxShadow: shadow(3, false),
          borderRadius: 6,
          padding: '4px 12px',
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 18,
          color: C.ink,
          opacity: baseIn,
        }}
      >
        {`z ∈ [${formatNum(grid.min, 1)}, ${formatNum(grid.max, 1)}]`}
      </div>
    </div>
  );
};
