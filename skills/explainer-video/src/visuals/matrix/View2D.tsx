// 2D intensity matrix / attention / confusion grid view using pure theme tokens + mixHex.
import React from 'react';
import {interpolate, spring, useVideoConfig} from 'remotion';
import type {View2DProps} from '../props';
import {Heading, at} from '../../kit2d';
import {look, useFocus} from '../../focus';
import {mixHex, useTheme, type Palette} from '../../theme';
import {strokeForTone} from '../../plot-svg';
import {
  boundsOfHighlight,
  cellMatchesFocusSet,
  formatMatrixCell,
  inferMatrixDomain,
  normalizeIntensity,
} from './compute';

const toneColor = (tone: 'secondary' | 'primary' | 'accent' | 'danger', C: Palette): string => {
  switch (tone) {
    case 'secondary': return C.secondary;
    case 'primary': return C.primary;
    case 'accent': return C.accent;
    case 'danger': return C.danger;
  }
};

export const View2D: React.FC<View2DProps<'matrix'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, FONT, MONO, BORDER, shadow, onAccent} = useTheme();
  const {fps} = useVideoConfig();
  const focusNow = useFocus(focus, lead);

  const boxW = 1700;
  const boxH = v.caption ? 542 : 590;
  const nRows = v.rows.length;
  const nCols = v.cols.length;
  const scale = v.scale ?? 'sequential';
  const baseTone = v.tone ?? 'secondary';
  const showValues = v.showValues !== false;

  const {domain, decimals} = React.useMemo(() => inferMatrixDomain(v), [v]);
  const [domLo, domHi] = domain;

  // Layout geometry centred inside boxW x boxH
  const rowLabelW = 200;
  const colHeaderH = v.colLabel ? 78 : 48;
  const legendW = 128;
  const maxGridW = Math.min(1080, boxW - rowLabelW - legendW - 120);
  const maxGridH = boxH - colHeaderH - 64;
  const cellW = Math.floor(Math.min(148, maxGridW / nCols));
  const cellH = Math.floor(Math.min(92, maxGridH / nRows));
  const gridW = cellW * nCols;
  const gridH = cellH * nRows;

  const totalBlockW = rowLabelW + gridW + 32 + legendW;
  const startX = Math.round((boxW - totalBlockW) / 2);
  const gridX = startX + rowLabelW;
  const gridY = colHeaderH + Math.round((maxGridH - gridH) / 2);
  const hasHighlights = Boolean(v.highlights?.length);

  const cellBgAndInk = (norm: number): {bg: string; textCol: string} => {
    if (scale === 'diverging') {
      if (norm >= 0) {
        const bg = mixHex(C.panel, C.accent, norm * 0.85);
        return {bg, textCol: C.ink};
      }
      const mag = Math.min(1, -norm);
      const bg = mixHex(C.panel, C.danger, mag * 0.86);
      const hiInk = onAccent(C.danger);
      return {bg, textCol: hiInk !== C.ink && mag > 0.62 ? hiInk : C.ink};
    }
    const targetCol = toneColor(baseTone, C);
    const bg = mixHex(C.panel, targetCol, norm * 0.9);
    const hiInk = onAccent(targetCol);
    return {bg, textCol: hiInk !== C.ink && norm > 0.56 ? hiInk : C.ink};
  };

  // Highlight timings when highlights are present
  const highlights = v.highlights ?? [];
  const hlStates = highlights.map((h, i) => {
    const st = at(i, highlights.length, lead, audioFrames, reveal);
    const pop = spring({frame: Math.max(0, frame - st), fps, config: {damping: 15, stiffness: 150}});
    const op = interpolate(frame, [st - 2, st + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return {h, bounds: boundsOfHighlight(h, nRows, nCols), st, pop, op};
  });

  // Colour legend gradient stops
  const legendX = gridX + gridW + 34;
  const legendH = Math.min(340, Math.max(180, gridH));
  const legendY = gridY + Math.round((gridH - legendH) / 2);
  const gradSteps = 18;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Heading text={v.heading} />
      <div style={{position: 'relative', width: boxW, height: boxH, direction: 'ltr'}}>
        <svg width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`} style={{display: 'block'}}>
          {/* Axis annotations */}
          {v.colLabel && (
            <text
              x={gridX + gridW / 2}
              y={Math.max(22, gridY - 48)}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight={800}
              fontSize={21}
              fill={C.dim}
            >
              {v.colLabel}
            </text>
          )}
          {v.rowLabel && (
            <text
              x={Math.max(24, startX + 18)}
              y={gridY + gridH / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${Math.max(24, startX + 18)} ${gridY + gridH / 2})`}
              fontFamily={FONT}
              fontWeight={800}
              fontSize={21}
              fill={C.dim}
            >
              {v.rowLabel}
            </text>
          )}

          {/* Column headers */}
          {v.cols.map((col, c) => {
            const fl = look(focusNow, (s) => s.has(`c${c}`));
            return (
              <text
                key={`ch-${c}`}
                x={gridX + c * cellW + cellW / 2}
                y={gridY - 14}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={fl.lift > 0.5 ? 900 : 800}
                fontSize={nCols > 7 ? 17 : 20}
                fill={C.ink}
                opacity={focusNow.cur ? Math.max(0.42, fl.opacity) : 1}
              >
                {col}
              </text>
            );
          })}

          {/* Row labels */}
          {v.rows.map((row, r) => {
            const fl = look(focusNow, (s) => s.has(`r${r}`));
            return (
              <text
                key={`rh-${r}`}
                x={gridX - 16}
                y={gridY + r * cellH + cellH / 2 + 7}
                textAnchor="end"
                fontFamily={FONT}
                fontWeight={fl.lift > 0.5 ? 900 : 800}
                fontSize={nRows > 7 ? 17 : 20}
                fill={C.ink}
                opacity={focusNow.cur ? Math.max(0.42, fl.opacity) : 1}
              >
                {row}
              </text>
            );
          })}

          {/* Frame drop shadow */}
          <rect
            x={gridX + 6}
            y={gridY + 6}
            width={gridW}
            height={gridH}
            fill={shadow(6) === 'none' ? 'none' : C.ink}
            rx={4}
          />
          <rect x={gridX} y={gridY} width={gridW} height={gridH} fill={C.panel} />

          {/* Matrix cells */}
          {v.values.map((rowVals, r) => {
            const rowStart = hasHighlights ? lead : at(r, nRows, lead, audioFrames, reveal);
            const rowWave = hasHighlights
              ? 1
              : interpolate(frame, [rowStart - 2, rowStart + 8], [0.38, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
            return rowVals.map((val, c) => {
              const baseIn = interpolate(frame, [lead + c * 1.1, lead + c * 1.1 + 8], [0.15, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              const op = hasHighlights ? baseIn : baseIn * rowWave;
              const fl = look(focusNow, (s) => cellMatchesFocusSet(r, c, s, v));
              const norm = normalizeIntensity(val, domain, scale);
              const {bg, textCol} = cellBgAndInk(norm);
              const cx = gridX + c * cellW;
              const cy = gridY + r * cellH;
              const cellText = formatMatrixCell(val, decimals, v.unit);
              const textSize = nCols >= 8 || nRows >= 8 ? 16 : nCols >= 6 ? 19 : 22;

              return (
                <g key={`cell-${r}-${c}`} opacity={op * fl.opacity}>
                  <rect
                    x={cx}
                    y={cy}
                    width={cellW}
                    height={cellH}
                    fill={bg}
                    stroke={mixHex(C.ink, C.panel, 0.25)}
                    strokeWidth={1.5}
                  />
                  {showValues && (
                    <text
                      x={cx + cellW / 2}
                      y={cy + cellH / 2 + Math.round(textSize * 0.34)}
                      textAnchor="middle"
                      fontFamily={MONO}
                      fontWeight={800}
                      fontSize={textSize}
                      fill={textCol}
                    >
                      {cellText}
                    </text>
                  )}
                </g>
              );
            });
          })}

          {/* Outer grid border */}
          <rect x={gridX} y={gridY} width={gridW} height={gridH} fill="none" stroke={C.ink} strokeWidth={BORDER} />

          {/* Narration-timed highlight overlays */}
          {hlStates.map(({h, bounds, pop, op}, i) => {
            if (op <= 0.01) return null;
            const hx = gridX + bounds.c0 * cellW;
            const hy = gridY + bounds.r0 * cellH;
            const hw = (bounds.c1 - bounds.c0 + 1) * cellW;
            const hh = (bounds.r1 - bounds.r0 + 1) * cellH;
            const fl = h.id ? look(focusNow, (s) => s.has(h.id!)) : {opacity: focusNow.cur ? 0.35 : 1, lift: 0};
            const strokeCol = strokeForTone(h.tone ?? 'primary', C);

            return (
              <g
                key={`hl-${i}`}
                opacity={op * fl.opacity}
                transform={`scale(${0.96 + 0.04 * Math.min(1, pop)})`}
                style={{transformOrigin: `${hx + hw / 2}px ${hy + hh / 2}px`}}
              >
                <rect
                  x={hx + 2}
                  y={hy + 2}
                  width={Math.max(4, hw - 4)}
                  height={Math.max(4, hh - 4)}
                  rx={4}
                  fill="none"
                  stroke={C.panel}
                  strokeWidth={7}
                />
                <rect
                  x={hx + 2}
                  y={hy + 2}
                  width={Math.max(4, hw - 4)}
                  height={Math.max(4, hh - 4)}
                  rx={4}
                  fill="none"
                  stroke={strokeCol}
                  strokeWidth={4.5}
                />
              </g>
            );
          })}

          {/* Legend pills for highlights rendered cleanly below grid (wrapping across rows if needed) */}
          {hlStates.some((s) => s.op > 0.01) && (
            <g transform={`translate(${gridX}, ${gridY + gridH + 16})`}>
              {(() => {
                let xOff = 0;
                let yOff = 0;
                const wrapW = Math.max(gridW, 560);
                return hlStates.map(({h, op}, i) => {
                  if (op <= 0.01) return null;
                  const strokeCol = strokeForTone(h.tone ?? 'primary', C);
                  const fl = h.id ? look(focusNow, (s) => s.has(h.id!)) : {opacity: focusNow.cur ? 0.35 : 1, lift: 0};
                  const pillW = Math.min(260, Math.max(90, h.label.length * 10 + 36));
                  if (xOff > 0 && xOff + pillW > wrapW) {
                    xOff = 0;
                    yOff += 34;
                  }
                  const curX = xOff;
                  const curY = yOff;
                  xOff += pillW + 10;
                  return (
                    <g key={`hl-pill-${i}`} transform={`translate(${curX}, ${curY})`} opacity={op * fl.opacity}>
                      <rect x={0} y={0} width={pillW} height={28} rx={5} fill={C.panel} stroke={C.ink} strokeWidth={2} />
                      <rect x={10} y={8} width={12} height={12} rx={2} fill={strokeCol} stroke={C.ink} strokeWidth={1.5} />
                      <text x={30} y={19} fontFamily={FONT} fontWeight={800} fontSize={15} fill={C.ink}>
                        {h.label}
                      </text>
                    </g>
                  );
                });
              })()}
            </g>
          )}

          {/* Colour scale legend */}
          <g transform={`translate(${legendX}, ${legendY})`}>
            <rect x={3} y={3} width={28} height={legendH} fill={shadow(3) === 'none' ? 'none' : C.ink} rx={3} />
            {Array.from({length: gradSteps}).map((_, k) => {
              const frac = 1 - k / (gradSteps - 1);
              const norm = scale === 'diverging' ? frac * 2 - 1 : frac;
              const segH = legendH / gradSteps + 0.8;
              return (
                <rect
                  key={`lg-${k}`}
                  x={0}
                  y={(k * legendH) / gradSteps}
                  width={28}
                  height={segH}
                  fill={cellBgAndInk(norm).bg}
                />
              );
            })}
            <rect x={0} y={0} width={28} height={legendH} fill="none" stroke={C.ink} strokeWidth={2.5} />
            <text x={38} y={14} fontFamily={MONO} fontWeight={800} fontSize={18} fill={C.ink}>
              {formatMatrixCell(domHi, decimals, v.unit)}
            </text>
            {scale === 'diverging' && (
              <text x={38} y={legendH / 2 + 6} fontFamily={MONO} fontWeight={800} fontSize={18} fill={C.dim}>
                0
              </text>
            )}
            <text x={38} y={legendH - 2} fontFamily={MONO} fontWeight={800} fontSize={18} fill={C.ink}>
              {formatMatrixCell(domLo, decimals, v.unit)}
            </text>
          </g>
        </svg>
      </div>
      {v.caption && (
        <div style={{fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.dim, textAlign: 'center', marginTop: 2}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
