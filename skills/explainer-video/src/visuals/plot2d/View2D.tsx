// 2D view of `plot2d`: animated function curves, secant-to-tangent zoom (with corner contrast), and signed Riemann slices.
import React from 'react';
import {mixHex, useTheme} from '../../theme';
import {Heading, at, prog} from '../../kit2d';
import {look, partIn, useFocus} from '../../focus';
import {PlotAxes, PlotCurve, PlotLegend, PlotMarker, fillForTone, strokeForTone} from '../../plot-svg';
import {formatNum, stageProgress, toPxX, toPxY, type Pt, type Viewport} from '../plot-kit';
import type {View2DProps} from '../props';
import {
  compileCurves,
  computeRiemann,
  computeSecant,
  computeTangent,
  computeViewport,
  curvePathsForViewport,
  type Plot2DV,
} from './compute';

const SVG_W = 1700;

const polyPath = (pts: readonly Pt[], vp: Viewport): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toPxX(p.x, vp).toFixed(2)} ${toPxY(p.y, vp).toFixed(2)}`).join(' ') + ' Z';

export const View2D: React.FC<View2DProps<'plot2d'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, MONO, BORDER, shadow, onAccent} = useTheme();
  const clipId = React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const f = useFocus(focus, lead);

  const boxH = v.caption ? 542 : 590;
  const svgH = v.caption ? 490 : 538;
  const pxRect = React.useMemo(() => ({x: 118, y: 20, w: 1530, h: svgH - 100}), [svgH]);

  const curves = React.useMemo(() => compileCurves(v), [v]);
  const hasStages = !!v.stages?.length;
  const stageStarts = React.useMemo(
    () => (v.stages ?? []).map((_, i) => at(i, v.stages!.length, lead, audioFrames, reveal)),
    [v.stages, lead, audioFrames, reveal],
  );
  const vp = computeViewport(v, curves, pxRect, frame, stageStarts);
  const curvePaths = React.useMemo(
    () => curves.map((c) => curvePathsForViewport(c, vp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [curves, vp.x[0], vp.x[1], vp.y[0], vp.y[1], vp.px.x, vp.px.y, vp.px.w, vp.px.h],
  );

  // Determine the latest active stage of each kind (narration progresses sequentially through stages).
  const stages = v.stages ?? [];
  let activeSecant: {idx: number; p: number} | null = null;
  let activeTangent: {idx: number; p: number} | null = null;
  let activeRiemann: {idx: number; p: number} | null = null;
  const activePoints: {idx: number; p: number}[] = [];

  for (let i = 0; i < stages.length; i++) {
    const p = stageProgress(frame, stageStarts[i], 26);
    if (p <= 0) continue;
    const st = stages[i];
    if (st.kind === 'secant') activeSecant = {idx: i, p};
    else if (st.kind === 'tangent') activeTangent = {idx: i, p};
    else if (st.kind === 'riemann') activeRiemann = {idx: i, p};
    else if (st.kind === 'point') activePoints.push({idx: i, p});
  }

  // Readout badge for current stage (slope / corner / Riemann sum)
  const badges: {label: string; tone: string}[] = [];
  const xSpan = vp.x[1] - vp.x[0];
  const ySpan = vp.y[1] - vp.y[0];

  const secantData = activeSecant
    ? (() => {
        const st = stages[activeSecant.idx] as Extract<NonNullable<Plot2DV['stages']>[number], {kind: 'secant'}>;
        const c = curves[st.curve ?? 0];
        return c ? computeSecant(c.fn, st.x, st.dx, st.toDx, xSpan, activeSecant.p) : null;
      })()
    : null;

  const tangentData = activeTangent
    ? (() => {
        const st = stages[activeTangent.idx] as Extract<NonNullable<Plot2DV['stages']>[number], {kind: 'tangent'}>;
        const c = curves[st.curve ?? 0];
        return c ? computeTangent(c.fn, st.x, xSpan, ySpan, activeTangent.p) : null;
      })()
    : null;

  const riemannData = activeRiemann
    ? (() => {
        const st = stages[activeRiemann.idx] as Extract<NonNullable<Plot2DV['stages']>[number], {kind: 'riemann'}>;
        const c = curves[st.curve ?? 0];
        if (!c) return null;
        return computeRiemann(c.fn, st.range, st.slices ?? 4, st.toSlices ?? st.slices ?? 4, st.method ?? 'midpoint', activeRiemann.p);
      })()
    : null;

  if (secantData) {
    badges.push({
      label: secantData.isTangent
        ? `tangent slope = ${formatNum(secantData.slope, 2)}`
        : `dx = ${formatNum(secantData.dx, 2)}  ·  slope = ${formatNum(secantData.slope, 2)}`,
      tone: secantData.isTangent ? C.accent : C.primary,
    });
  }
  if (tangentData) {
    badges.push({
      label: tangentData.isCorner
        ? `corner: left ${formatNum(tangentData.leftSlope, 1)} ≠ right ${formatNum(tangentData.rightSlope, 1)}`
        : `slope at x=${formatNum(tangentData.x, 1)} is ${formatNum(tangentData.slope, 2)}`,
      tone: tangentData.isCorner ? C.danger : C.accent,
    });
  }
  if (riemannData) {
    badges.push({
      label: riemannData.smoothMode
        ? `signed area = ${formatNum(riemannData.sum, 2)}`
        : `N = ${riemannData.slices}  ·  sum = ${formatNum(riemannData.sum, 2)}`,
      tone: C.primary,
    });
  }

  const lineRay = (x0: number, y0: number, slope: number, dir: -1 | 0 | 1) => {
    const span = xSpan * 0.42;
    const xa = dir === 1 ? x0 : x0 - span;
    const xb = dir === -1 ? x0 : x0 + span;
    const ya = y0 + slope * (xa - x0);
    const yb = y0 + slope * (xb - x0);
    return {x1: toPxX(xa, vp), y1: toPxY(ya, vp), x2: toPxX(xb, vp), y2: toPxY(yb, vp)};
  };

  const zeroPy = toPxY(0, vp);
  const posFill = mixHex(C.accent, C.panel, 0.45);
  const negFill = mixHex(C.danger, C.panel, 0.45);

  return (
    <div>
      <Heading text={v.heading} />
      <div style={{direction: 'ltr', position: 'relative', width: SVG_W, height: boxH}}>
        {/* Top bar: legend + live math readout */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 42}}>
          <PlotLegend
            items={curves.map((c, idx) => {
              const l = look(f, (set) => (c.id ? partIn(c.id)(set) : false));
              const cProg = hasStages ? 1 : prog(frame, at(idx, curves.length, lead, audioFrames, reveal), 18);
              return {
                label: c.label,
                color: strokeForTone(c.tone, C),
                dashed: c.dashed,
                opacity: cProg * l.opacity,
              };
            })}
          />
          <div style={{display: 'flex', gap: 10}}>
            {badges.map((b, i) => (
              <div
                key={i}
                style={{
                  background: b.tone,
                  color: onAccent(b.tone),
                  border: `${BORDER}px solid ${C.ink}`,
                  boxShadow: shadow(4, false),
                  padding: '5px 14px',
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 21,
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>

        <svg width={SVG_W} height={svgH} viewBox={`0 0 ${SVG_W} ${svgH}`} style={{overflow: 'visible'}}>
          <PlotAxes vp={vp} clipId={clipId} xLabel={v.xLabel} yLabel={v.yLabel} />

          <g clipPath={`url(#${clipId})`}>
            {/* Riemann bars or smooth signed areas */}
            {riemannData && !riemannData.smoothMode && riemannData.bars.map((b, i) => {
              const x0 = toPxX(b.x0, vp);
              const x1 = toPxX(b.x1, vp);
              const yVal = toPxY(b.y, vp);
              const rectY = Math.min(zeroPy, yVal);
              const rectH = Math.abs(zeroPy - yVal);
              const fill = b.positive ? posFill : negFill;
              const stroke = b.positive ? strokeForTone('accent', C) : C.danger;
              return (
                <rect
                  key={i}
                  x={x0}
                  y={rectY}
                  width={Math.max(1.5, x1 - x0)}
                  height={rectH}
                  fill={fill}
                  fillOpacity={0.78 * riemannData.progress}
                  stroke={stroke}
                  strokeWidth={2}
                />
              );
            })}
            {riemannData && riemannData.smoothMode && (
              <g opacity={0.75 * riemannData.progress}>
                {riemannData.smoothPos.map((poly, i) => (
                  <path key={`pos-${i}`} d={polyPath(poly, vp)} fill={posFill} stroke={strokeForTone('accent', C)} strokeWidth={2.5} />
                ))}
                {riemannData.smoothNeg.map((poly, i) => (
                  <path key={`neg-${i}`} d={polyPath(poly, vp)} fill={negFill} stroke={C.danger} strokeWidth={2.5} />
                ))}
              </g>
            )}

            {/* Function curves */}
            {curves.map((c, idx) => {
              const cStart = hasStages ? 0 : at(idx, curves.length, lead, audioFrames, reveal);
              const cProg = hasStages ? prog(frame, 4, 22) : prog(frame, cStart, 22);
              const l = look(f, (set) => (c.id ? partIn(c.id)(set) : false));
              const paths = curvePaths[idx];
              return (
                <PlotCurve
                  key={idx}
                  paths={paths}
                  color={strokeForTone(c.tone, C)}
                  progress={cProg}
                  strokeWidth={5.5}
                  dashed={c.dashed}
                  opacity={l.opacity}
                  haloColor={C.panel}
                />
              );
            })}

            {/* Secant rise/run triangle + pivoting line */}
            {secantData && (() => {
              const px1 = toPxX(secantData.x1, vp), py1 = toPxY(secantData.y1, vp);
              const px2 = toPxX(secantData.x2, vp), py2 = toPxY(secantData.y2, vp);
              const ray = lineRay(secantData.x1, secantData.y1, secantData.slope, 0);
              const lineCol = secantData.isTangent ? strokeForTone('accent', C) : C.danger;
              return (
                <g opacity={Math.min(1, secantData.progress * 3)}>
                  {!secantData.isTangent && (
                    <path
                      d={`M ${px1} ${py1} L ${px2} ${py1} L ${px2} ${py2}`}
                      fill="none"
                      stroke={C.dim}
                      strokeWidth={3}
                      strokeDasharray="8 6"
                    />
                  )}
                  <line x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke={lineCol} strokeWidth={4.5} />
                  <PlotMarker cx={px1} cy={py1} fill={fillForTone('primary', C)} r={9} />
                  {!secantData.isTangent && <PlotMarker cx={px2} cy={py2} fill={fillForTone('danger', C)} r={8} />}
                </g>
              );
            })()}

            {/* Tangent (or dual left/right corner rays) */}
            {tangentData && (() => {
              const px = toPxX(tangentData.x, vp), py = toPxY(tangentData.y, vp);
              if (tangentData.isCorner) {
                const leftR = lineRay(tangentData.x, tangentData.y, tangentData.leftSlope, -1);
                const rightR = lineRay(tangentData.x, tangentData.y, tangentData.rightSlope, 1);
                return (
                  <g opacity={tangentData.progress}>
                    <line x1={leftR.x1} y1={leftR.y1} x2={leftR.x2} y2={leftR.y2} stroke={C.secondary} strokeWidth={4.5} strokeDasharray="10 6" />
                    <line x1={rightR.x1} y1={rightR.y1} x2={rightR.x2} y2={rightR.y2} stroke={strokeForTone('accent', C)} strokeWidth={4.5} strokeDasharray="10 6" />
                    <PlotMarker cx={px} cy={py} fill={C.danger} r={10} />
                  </g>
                );
              }
              const ray = lineRay(tangentData.x, tangentData.y, tangentData.slope, 0);
              return (
                <g opacity={tangentData.progress}>
                  <line x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke={strokeForTone('accent', C)} strokeWidth={4.5} />
                  <PlotMarker cx={px} cy={py} fill={fillForTone('primary', C)} r={9} />
                </g>
              );
            })()}

            {/* Point markers */}
            {activePoints.map(({idx, p}) => {
              const st = stages[idx] as Extract<NonNullable<Plot2DV['stages']>[number], {kind: 'point'}>;
              const c = curves[st.curve ?? 0];
              if (!c) return null;
              const y = c.fn(st.x);
              if (!Number.isFinite(y)) return null;
              return (
                <PlotMarker
                  key={`pt-${idx}`}
                  cx={toPxX(st.x, vp)}
                  cy={toPxY(y, vp)}
                  fill={fillForTone(c.tone, C)}
                  tag={st.tag}
                  opacity={p}
                />
              );
            })}
          </g>
        </svg>
      </div>
      {v.caption && (
        <div style={{fontSize: 30, color: C.dim, textAlign: 'center', marginTop: 12, opacity: prog(frame, 2, 10)}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
