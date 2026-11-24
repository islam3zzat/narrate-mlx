// 2D view of `linked-plot`: stacked synchronized accumulation F(x) and rate f(x) plots sharing one live cursor.
import React from 'react';
import {mixHex, useTheme} from '../../theme';
import {Heading, at, prog} from '../../kit2d';
import {look, partIn, useFocus} from '../../focus';
import {PlotAxes, PlotCurve, PlotMarker, fillForTone, strokeForTone} from '../../plot-svg';
import {formatNum, toPxX, toPxY, type Pt, type Viewport} from '../plot-kit';
import type {View2DProps} from '../props';
import {buildAreaPolygons, buildLinkedData, computeCursorState, panelPaths} from './compute';

const SVG_W = 1700;

const polyPath = (pts: readonly Pt[], vp: Viewport): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toPxX(p.x, vp).toFixed(2)} ${toPxY(p.y, vp).toFixed(2)}`).join(' ') + ' Z';

export const View2D: React.FC<View2DProps<'linked-plot'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, FONT, MONO, BORDER, shadow, onAccent} = useTheme();
  const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const topClip = `${uid}-top`;
  const botClip = `${uid}-bot`;
  const f = useFocus(focus, lead);

  const data = React.useMemo(() => buildLinkedData(v), [v]);
  const stageStarts = React.useMemo(
    () => v.stages.map((_, i) => at(i, v.stages.length, lead, audioFrames, reveal)),
    [v.stages, lead, audioFrames, reveal],
  );
  const cur = computeCursorState(v, data, frame, stageStarts);

  const boxH = v.caption ? 542 : 590;
  const panelH = v.caption ? 186 : 210;
  const topY = 26;
  const gapY = 58;
  const botY = topY + panelH + gapY;
  const svgH = boxH;

  const topVp: Viewport = React.useMemo(
    () => ({x: v.xDomain, y: v.top.yDomain, px: {x: 120, y: topY, w: 1525, h: panelH}}),
    [v.xDomain, v.top.yDomain, topY, panelH],
  );
  const botVp: Viewport = React.useMemo(
    () => ({x: v.xDomain, y: v.bottom.yDomain, px: {x: 120, y: botY, w: 1525, h: panelH}}),
    [v.xDomain, v.bottom.yDomain, botY, panelH],
  );

  const topPaths = React.useMemo(() => panelPaths(data.topFn, topVp), [data.topFn, topVp]);
  const botPaths = React.useMemo(() => panelPaths(data.bottomFn, botVp), [data.bottomFn, botVp]);
  const areaPolys = React.useMemo(
    () => (cur.showArea ? buildAreaPolygons(data.bottomFn, v.xDomain[0], cur.cursorX, v.xDomain[1]) : {pos: [], neg: []}),
    [cur.showArea, cur.cursorX, data.bottomFn, v.xDomain],
  );

  const topFocus = look(f, partIn('top'));
  const botFocus = look(f, partIn('bottom'));
  const drawP = prog(frame, 4, 22);

  const cursorPx = toPxX(cur.cursorX, topVp);
  const topPy = toPxY(cur.topY, topVp);
  const botPy = toPxY(cur.bottomY, botVp);

  const xSpan = v.xDomain[1] - v.xDomain[0];
  const tangentSpan = xSpan * 0.14;
  const tx1 = cur.cursorX - tangentSpan;
  const tx2 = cur.cursorX + tangentSpan;
  const ty1 = cur.topY + cur.topSlope * (tx1 - cur.cursorX);
  const ty2 = cur.topY + cur.topSlope * (tx2 - cur.cursorX);

  const posFill = mixHex(C.accent, C.panel, 0.45);
  const negFill = mixHex(C.danger, C.panel, 0.45);
  const topStroke = strokeForTone(data.topTone, C);
  const botStroke = strokeForTone(data.botTone, C);

  const topUnit = v.top.unit ? ` ${v.top.unit}` : '';
  const botUnit = v.bottom.unit ? ` ${v.bottom.unit}` : '';

  return (
    <div>
      <Heading text={v.heading} />
      <div style={{direction: 'ltr', position: 'relative', width: SVG_W, height: boxH}}>
        <svg width={SVG_W} height={svgH} viewBox={`0 0 ${SVG_W} ${svgH}`} style={{overflow: 'visible'}}>
          {/* Top panel: accumulation F(x) */}
          <g opacity={topFocus.opacity}>
            <PlotAxes vp={topVp} clipId={topClip} yLabel={v.top.yLabel} showXLabels={false} fontSize={19} />
            <g clipPath={`url(#${topClip})`}>
              <PlotCurve paths={topPaths} color={topStroke} progress={drawP} strokeWidth={5} haloColor={C.panel} />
              {cur.showTangent && Number.isFinite(cur.topY) && Number.isFinite(cur.topSlope) && (
                <line
                  x1={toPxX(tx1, topVp)}
                  y1={toPxY(ty1, topVp)}
                  x2={toPxX(tx2, topVp)}
                  y2={toPxY(ty2, topVp)}
                  stroke={C.danger}
                  strokeWidth={4.5}
                />
              )}
              {Number.isFinite(cur.topY) && <PlotMarker cx={cursorPx} cy={topPy} fill={fillForTone(data.topTone, C)} r={8.5} />}
            </g>
            {/* Top panel label badge */}
            <g transform={`translate(${topVp.px.x + 14}, ${topY + 12})`}>
              <rect x={0} y={0} width={Math.max(120, v.top.label.length * 13 + 26)} height={32} rx={5} fill={C.panel} stroke={C.ink} strokeWidth={2.5} />
              <text x={12} y={22} fontFamily={FONT} fontWeight={700} fontSize={20} fill={topStroke}>
                {v.top.label}
              </text>
            </g>
          </g>

          {/* Bottom panel: rate f(x) */}
          <g opacity={botFocus.opacity}>
            <PlotAxes vp={botVp} clipId={botClip} xLabel={v.xLabel} yLabel={v.bottom.yLabel} fontSize={19} />
            <g clipPath={`url(#${botClip})`}>
              <g opacity={0.75}>
                {areaPolys.pos.map((poly, i) => (
                  <path key={`p-${i}`} d={polyPath(poly, botVp)} fill={posFill} stroke={strokeForTone('accent', C)} strokeWidth={2} />
                ))}
                {areaPolys.neg.map((poly, i) => (
                  <path key={`n-${i}`} d={polyPath(poly, botVp)} fill={negFill} stroke={C.danger} strokeWidth={2} />
                ))}
              </g>
              <PlotCurve paths={botPaths} color={botStroke} progress={drawP} strokeWidth={5} haloColor={C.panel} />
              {Number.isFinite(cur.bottomY) && <PlotMarker cx={cursorPx} cy={botPy} fill={fillForTone(data.botTone, C)} r={8.5} />}
            </g>
            <g transform={`translate(${botVp.px.x + 14}, ${botY + 12})`}>
              <rect x={0} y={0} width={Math.max(120, v.bottom.label.length * 13 + 26)} height={32} rx={5} fill={C.panel} stroke={C.ink} strokeWidth={2.5} />
              <text x={12} y={22} fontFamily={FONT} fontWeight={700} fontSize={20} fill={botStroke}>
                {v.bottom.label}
              </text>
            </g>
          </g>

          {/* Shared vertical cursor line spanning both stacked panels */}
          <line
            x1={cursorPx}
            y1={topY}
            x2={cursorPx}
            y2={botY + panelH}
            stroke={C.ink}
            strokeWidth={3}
            strokeDasharray="7 6"
          />
        </svg>

        {/* Bridge bar between top and bottom plots showing synchronized numerical identity */}
        <div
          style={{
            position: 'absolute',
            left: 120,
            right: 55,
            top: topY + panelH + 10,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'none',
          }}
        >
          <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
            {cur.showTangent && (
              <div
                style={{
                  background: C.primary,
                  color: onAccent(C.primary),
                  border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
                  boxShadow: shadow(3, false),
                  borderRadius: 6,
                  padding: '3px 12px',
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 19,
                }}
              >
                {`slope = ${formatNum(cur.topSlope, 2)}  =  ${v.bottom.label} (${formatNum(cur.bottomY, 2)}${botUnit})`}
              </div>
            )}
            {cur.showArea && (
              <div
                style={{
                  background: C.accent,
                  color: onAccent(C.accent),
                  border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
                  boxShadow: shadow(3, false),
                  borderRadius: 6,
                  padding: '3px 12px',
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 19,
                }}
              >
                {`area = ${formatNum(cur.area, 2)}  =  Δ${v.top.label} (${formatNum(cur.deltaTop, 2)}${topUnit})`}
              </div>
            )}
          </div>
          {cur.note && (
            <div
              style={{
                background: C.panel,
                color: C.ink,
                border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
                borderRadius: 6,
                padding: '3px 12px',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 19,
              }}
            >
              {cur.note}
            </div>
          )}
        </div>
      </div>
      {v.caption && (
        <div style={{fontSize: 30, color: C.dim, textAlign: 'center', marginTop: 10, opacity: prog(frame, 2, 10)}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
