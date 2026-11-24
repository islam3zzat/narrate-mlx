// Vector-field view with animated flow arrows, O(1) deterministic advected particles, Jacobian stretch, divergence, curl paddlewheel, line & flux integrals.
import React from 'react';
import {mixHex, useTheme} from '../../theme';
import {at, prog} from '../../kit2d';
import {look, partIn, type FocusNow} from '../../focus';
import {PlotAxes, PlotMarker, strokeForTone} from '../../plot-svg';
import {formatNum, stageProgress, toPxX, toPxY, type Viewport} from '../plot-kit';
import {compile2D} from '../math-expr';
import {jacobian2D} from './marching';
import {computeFluxIntegral, computeLineIntegral, precomputeParticles} from './particles';
import type {Field2DV} from './ScalarView';

const SVG_W = 1700;
const PERIOD = 60;

export const VectorView: React.FC<{
  visual: Field2DV;
  frame: number;
  lead: number;
  audioFrames: number;
  reveal?: number[];
  focusNow: FocusNow;
  boxH: number;
}> = ({visual: v, frame, lead, audioFrames, reveal, focusNow, boxH}) => {
  const {C, MONO, BORDER, shadow, onAccent} = useTheme();
  const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const clipId = `${uid}-vec`;
  const arrowId = `${uid}-arr`;
  const accentArrId = `${uid}-acc`;
  const dangerArrId = `${uid}-dng`;

  const pxRect = React.useMemo(() => ({x: 118, y: 20, w: 1520, h: boxH - 100}), [boxH]);
  const vp: Viewport = React.useMemo(() => ({x: v.xDomain, y: v.yDomain, px: pxRect}), [v.xDomain, v.yDomain, pxRect]);

  const fx = React.useMemo(() => compile2D(v.fx ?? '0') ?? (() => 0), [v.fx]);
  const fy = React.useMemo(() => compile2D(v.fy ?? '0') ?? (() => 0), [v.fy]);
  const tracks = React.useMemo(
    () => (v.particles === false ? [] : precomputeParticles(fx, fy, v.xDomain, v.yDomain, PERIOD)),
    [v.particles, fx, fy, v.xDomain, v.yDomain],
  );

  const density = v.density ?? 9;
  const xSpan = v.xDomain[1] - v.xDomain[0];
  const ySpan = v.yDomain[1] - v.yDomain[0];
  const baseIn = prog(frame, 4, 18);
  const overlays = v.overlays ?? [];

  const gridArrows = React.useMemo(() => {
    const out: {x: number; y: number; vx: number; vy: number}[] = [];
    for (let i = 0; i < density; i++) {
      for (let j = 0; j < density; j++) {
        const x = v.xDomain[0] + ((i + 0.5) / density) * xSpan;
        const y = v.yDomain[0] + ((j + 0.5) / density) * ySpan;
        const vx = fx(x, y), vy = fy(x, y);
        if (Number.isFinite(vx) && Number.isFinite(vy)) out.push({x, y, vx, vy});
      }
    }
    return out;
  }, [density, v.xDomain, v.yDomain, xSpan, ySpan, fx, fy]);

  const arrowMaxPx = Math.min(vp.px.w, vp.px.h) / (density * 1.35);
  const badges: {label: string; bg: string}[] = [];

  overlays.forEach((ov, oi) => {
    const p = stageProgress(frame, at(oi, overlays.length, lead, audioFrames, reveal), 20);
    if (p <= 0) return;
    if (ov.kind === 'divergence') {
      const jac = jacobian2D(fx, fy, ov.at[0], ov.at[1], xSpan, ySpan);
      badges.push({label: `div = ${formatNum(jac.div, 2)}`, bg: jac.div >= 0 ? C.accent : C.danger});
    } else if (ov.kind === 'curl') {
      const jac = jacobian2D(fx, fy, ov.at[0], ov.at[1], xSpan, ySpan);
      badges.push({label: `curl = ${formatNum(jac.curl, 2)}`, bg: C.primary});
    } else if (ov.kind === 'line-integral') {
      const li = computeLineIntegral(fx, fy, ov.points, p);
      badges.push({label: `work ∫ F·dr = ${formatNum(li.totalWork, 2)}`, bg: C.secondary});
    } else if (ov.kind === 'flux') {
      const fl = computeFluxIntegral(fx, fy, ov.points);
      badges.push({label: `flux ∫ F·n ds = ${formatNum(fl.totalFlux, 2)}`, bg: C.accent});
    }
  });

  const markerDef = (id: string, col: string) => (
    <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1 L 10 5 L 0 9 z" fill={col} />
    </marker>
  );

  return (
    <div style={{direction: 'ltr', width: SVG_W, height: boxH, position: 'relative'}}>
      <svg width={SVG_W} height={boxH} viewBox={`0 0 ${SVG_W} ${boxH}`} style={{overflow: 'visible'}}>
        <defs>
          {markerDef(arrowId, mixHex(C.ink, C.dim, 0.45))}
          {markerDef(accentArrId, strokeForTone('accent', C))}
          {markerDef(dangerArrId, C.danger)}
        </defs>

        <PlotAxes vp={vp} clipId={clipId} xLabel={v.xLabel} yLabel={v.yLabel} />

        <g clipPath={`url(#${clipId})`} opacity={baseIn}>
          {/* Static background vector field arrows */}
          {gridArrows.map((a, i) => {
            const mag = Math.hypot(a.vx, a.vy);
            if (mag < 1e-6) return null;
            const len = arrowMaxPx * Math.min(1, 0.35 + 0.65 * Math.min(1, mag / 2.5));
            const px = toPxX(a.x, vp), py = toPxY(a.y, vp);
            const ux = a.vx / mag, uy = -a.vy / mag;
            return (
              <line
                key={i}
                x1={px - ux * len * 0.35}
                y1={py - uy * len * 0.35}
                x2={px + ux * len * 0.65}
                y2={py + uy * len * 0.65}
                stroke={mixHex(C.ink, C.dim, 0.55)}
                strokeWidth={2.2}
                markerEnd={`url(#${arrowId})`}
                opacity={0.7}
              />
            );
          })}

          {/* O(1) precomputed advected particles */}
          {tracks.map((tr, ti) => {
            if (tr.pts.length < 2) return null;
            const idx = (frame + tr.phase) % PERIOD;
            if (idx >= tr.pts.length) return null;
            const pt = tr.pts[idx];
            const prev = tr.pts[Math.max(0, idx - 2)];
            const life = idx / tr.pts.length;
            const env = Math.sin(Math.PI * life);
            const col = strokeForTone('accent', C);
            return (
              <g key={ti} opacity={env * 0.88}>
                <line
                  x1={toPxX(prev.x, vp)}
                  y1={toPxY(prev.y, vp)}
                  x2={toPxX(pt.x, vp)}
                  y2={toPxY(pt.y, vp)}
                  stroke={col}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
                <circle cx={toPxX(pt.x, vp)} cy={toPxY(pt.y, vp)} r={4.2} fill={col} />
              </g>
            );
          })}

          {/* Overlays */}
          {overlays.map((ov, oi) => {
            const p = stageProgress(frame, at(oi, overlays.length, lead, audioFrames, reveal), 22);
            if (p <= 0) return null;
            const l = look(focusNow, (set) => (ov.id ? partIn(ov.id)(set) : false));
            const op = p * l.opacity;

            if (ov.kind === 'jacobian') {
              const s = (ov.size ?? 0.5) * 0.5;
              const jac = jacobian2D(fx, fy, ov.at[0], ov.at[1], xSpan, ySpan);
              const k = 0.42 * p;
              const corners: [number, number][] = [[-s, -s], [s, -s], [s, s], [-s, s]];
              const deformed = corners.map(([dx, dy]) => [
                ov.at[0] + dx + k * (jac.dxx * dx + jac.dxy * dy),
                ov.at[1] + dy + k * (jac.dyx * dx + jac.dyy * dy),
              ]);
              const pathD = deformed.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${toPxX(x, vp).toFixed(1)} ${toPxY(y, vp).toFixed(1)}`).join(' ') + ' Z';
              return (
                <g key={oi} opacity={op}>
                  <path d={pathD} fill={mixHex(C.primary, C.panel, 0.5)} stroke={C.ink} strokeWidth={3.5} />
                </g>
              );
            }

            if (ov.kind === 'divergence') {
              const jac = jacobian2D(fx, fy, ov.at[0], ov.at[1], xSpan, ySpan);
              const rW = ov.radius ?? Math.min(xSpan, ySpan) * 0.14;
              const cx = toPxX(ov.at[0], vp), cy = toPxY(ov.at[1], vp);
              const rx = Math.abs(toPxX(ov.at[0] + rW, vp) - cx);
              const outward = jac.div >= 0;
              const col = outward ? strokeForTone('accent', C) : C.danger;
              const mId = outward ? accentArrId : dangerArrId;
              return (
                <g key={oi} opacity={op}>
                  <circle cx={cx} cy={cy} r={rx} fill={mixHex(col, C.panel, 0.78)} stroke={col} strokeWidth={4} strokeDasharray="8 6" />
                  {Array.from({length: 8}, (_, k) => {
                    const ang = (k / 8) * Math.PI * 2;
                    const r0 = outward ? rx * 0.55 : rx * 1.28;
                    const r1 = outward ? rx * 1.28 : rx * 0.55;
                    return (
                      <line
                        key={k}
                        x1={cx + Math.cos(ang) * r0}
                        y1={cy + Math.sin(ang) * r0}
                        x2={cx + Math.cos(ang) * r1}
                        y2={cy + Math.sin(ang) * r1}
                        stroke={col}
                        strokeWidth={4}
                        markerEnd={`url(#${mId})`}
                      />
                    );
                  })}
                </g>
              );
            }

            if (ov.kind === 'curl') {
              const jac = jacobian2D(fx, fy, ov.at[0], ov.at[1], xSpan, ySpan);
              const rW = ov.radius ?? Math.min(xSpan, ySpan) * 0.13;
              const cx = toPxX(ov.at[0], vp), cy = toPxY(ov.at[1], vp);
              const rx = Math.abs(toPxX(ov.at[0] + rW, vp) - cx);
              // Deterministic angular spin proportional to curl and frame
              const deg = (frame * jac.curl * 2.2) % 360;
              return (
                <g key={oi} opacity={op}>
                  <circle cx={cx} cy={cy} r={rx} fill={mixHex(C.primary, C.panel, 0.72)} stroke={C.ink} strokeWidth={3.5} />
                  <g transform={`translate(${cx}, ${cy}) rotate(${-deg})`}>
                    {[0, 90, 180, 270].map((a) => (
                      <line
                        key={a}
                        x1={0}
                        y1={0}
                        x2={rx * 0.85}
                        y2={0}
                        stroke={C.secondary}
                        strokeWidth={5}
                        strokeLinecap="round"
                        transform={`rotate(${a})`}
                      />
                    ))}
                    <circle cx={0} cy={0} r={8} fill={C.ink} />
                  </g>
                </g>
              );
            }

            if (ov.kind === 'line-integral') {
              const li = computeLineIntegral(fx, fy, ov.points, p);
              const fullD = ov.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${toPxX(x, vp).toFixed(1)} ${toPxY(y, vp).toFixed(1)}`).join(' ');
              const progD = li.trail.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toPxX(pt.x, vp).toFixed(1)} ${toPxY(pt.y, vp).toFixed(1)}`).join(' ');
              const cx = toPxX(li.cursor.x, vp), cy = toPxY(li.cursor.y, vp);
              const scale = 32;
              return (
                <g key={oi} opacity={l.opacity}>
                  <path d={fullD} fill="none" stroke={C.dim} strokeWidth={3} strokeDasharray="8 6" />
                  {li.trail.length >= 2 && <path d={progD} fill="none" stroke={C.secondary} strokeWidth={5} strokeLinecap="round" />}
                  {/* Tangential (work) vs perpendicular (zero-work) components */}
                  <line x1={cx} y1={cy} x2={cx + li.tanVec[0] * scale} y2={cy - li.tanVec[1] * scale} stroke={strokeForTone('accent', C)} strokeWidth={4.5} markerEnd={`url(#${accentArrId})`} />
                  <line x1={cx} y1={cy} x2={cx + li.perpVec[0] * scale} y2={cy - li.perpVec[1] * scale} stroke={C.danger} strokeWidth={3.5} strokeDasharray="6 4" markerEnd={`url(#${dangerArrId})`} />
                  <PlotMarker cx={cx} cy={cy} fill={C.primary} r={8} />
                </g>
              );
            }

            if (ov.kind === 'flux') {
              const fl = computeFluxIntegral(fx, fy, ov.points);
              const fullD = ov.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${toPxX(x, vp).toFixed(1)} ${toPxY(y, vp).toFixed(1)}`).join(' ');
              return (
                <g key={oi} opacity={op}>
                  <path d={fullD} fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
                  {fl.samples.map((s, si) => {
                    const px = toPxX(s.x, vp), py = toPxY(s.y, vp);
                    const len = 46;
                    const col = s.fDotN >= 0 ? strokeForTone('accent', C) : C.danger;
                    const mId = s.fDotN >= 0 ? accentArrId : dangerArrId;
                    return (
                      <line
                        key={si}
                        x1={px}
                        y1={py}
                        x2={px + s.nx * len}
                        y2={py - s.ny * len}
                        stroke={col}
                        strokeWidth={4.5}
                        markerEnd={`url(#${mId})`}
                      />
                    );
                  })}
                </g>
              );
            }
            return null;
          })}
        </g>
      </svg>

      {/* Live multivariable calculus badges */}
      {badges.length > 0 && (
        <div style={{position: 'absolute', right: 64, top: 28, display: 'flex', gap: 10}}>
          {badges.map((b, i) => (
            <div
              key={i}
              style={{
                background: b.bg,
                color: onAccent(b.bg),
                border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
                boxShadow: shadow(4, false),
                borderRadius: 6,
                padding: '4px 12px',
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 19,
              }}
            >
              {b.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
