// Shared React SVG plotting primitives for mathematical 2D visuals (plot2d, linked-plot, field2d).
// Uses useTheme() and mixHex exclusively (zero raw colour literals, purely prop/frame-driven).
import React from 'react';
import {evolvePath} from '@remotion/paths';
import {mixHex, useTheme, type Palette} from './theme';
import {formatTick, niceTicks, toPxX, toPxY, type PlotTone, type Viewport} from './visuals/plot-kit';

/** High-contrast stroke colours on C.panel (darkens bright yellow `primary` and cyan/green `accent`). */
export const strokeForTone = (tone: PlotTone, C: Palette): string => {
  switch (tone) {
    case 'secondary': return C.secondary;
    case 'accent': return mixHex(C.accent, C.ink, 0.25);
    case 'primary': return mixHex(C.primary, C.ink, 0.38);
    case 'danger': return C.danger;
    case 'ink': return C.ink;
  }
};

export const fillForTone = (tone: PlotTone, C: Palette): string => {
  switch (tone) {
    case 'secondary': return C.secondary;
    case 'accent': return C.accent;
    case 'primary': return C.primary;
    case 'danger': return C.danger;
    case 'ink': return C.muted;
  }
};

export type PlotAxesProps = {
  vp: Viewport;
  clipId: string;
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[];
  yTicks?: number[];
  showXLabels?: boolean;
  showYLabels?: boolean;
  showXGrid?: boolean;
  showYGrid?: boolean;
  showXTicks?: boolean;
  showYTicks?: boolean;
  showXOrigin?: boolean;
  showYOrigin?: boolean;
  shadowOffset?: number;
  gridMix?: number;
  originMix?: number;
  mapX?: (t: number) => number;
  mapY?: (t: number) => number;
  formatXTick?: (t: number) => string;
  formatYTick?: (t: number) => string;
  yTickOffset?: number;
  labelWeight?: number;
  labelSize?: number;
  yLabelX?: number;
  fontSize?: number;
};

export const PlotAxes: React.FC<PlotAxesProps> = ({
  vp,
  clipId,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  showXLabels = true,
  showYLabels = true,
  showXGrid = true,
  showYGrid = true,
  showXTicks = true,
  showYTicks = true,
  showXOrigin = true,
  showYOrigin = true,
  shadowOffset,
  gridMix = 0.3,
  originMix = 0.5,
  mapX,
  mapY,
  formatXTick = formatTick,
  formatYTick = formatTick,
  yTickOffset,
  labelWeight = 700,
  labelSize,
  yLabelX,
  fontSize = 20,
}) => {
  const {C, MONO, FONT, BORDER, shadow} = useTheme();
  const {x, y, w, h} = vp.px;
  const xt = xTicks ?? niceTicks(vp.x[0], vp.x[1], 6);
  const yt = yTicks ?? niceTicks(vp.y[0], vp.y[1], 5);
  const gridCol = mixHex(C.muted, C.panel, gridMix);
  const pxOfX = mapX ?? ((t: number) => toPxX(t, vp));
  const pxOfY = mapY ?? ((t: number) => toPxY(t, vp));
  const zeroX = showXOrigin && vp.x[0] <= 0 && vp.x[1] >= 0 ? pxOfX(0) : null;
  const zeroY = showYOrigin && vp.y[0] <= 0 && vp.y[1] >= 0 ? pxOfY(0) : null;
  const yOff = yTickOffset ?? fontSize * 0.35;
  const lblSize = labelSize ?? fontSize + 2;
  const yLblX = yLabelX ?? x - 74;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      {shadowOffset !== undefined && (
        <rect x={x + shadowOffset} y={y + shadowOffset} width={w} height={h} fill={shadow(shadowOffset) === 'none' ? 'none' : C.ink} rx={4} />
      )}
      {/* Plot surface background */}
      <rect x={x} y={y} width={w} height={h} fill={C.panel} />
      {/* Subtle grid lines */}
      <g clipPath={`url(#${clipId})`}>
        {showXGrid && xt.map((t, i) => {
          const px = pxOfX(t);
          return <line key={`gx-${i}`} x1={px} y1={y} x2={px} y2={y + h} stroke={gridCol} strokeWidth={1.5} />;
        })}
        {showYGrid && yt.map((t, i) => {
          const py = pxOfY(t);
          return <line key={`gy-${i}`} x1={x} y1={py} x2={x + w} y2={py} stroke={gridCol} strokeWidth={1.5} />;
        })}
        {/* Emphasized origin axes when inside domain */}
        {zeroX !== null && (
          <line x1={zeroX} y1={y} x2={zeroX} y2={y + h} stroke={mixHex(C.ink, C.panel, originMix)} strokeWidth={2.5} />
        )}
        {zeroY !== null && (
          <line x1={x} y1={zeroY} x2={x + w} y2={zeroY} stroke={mixHex(C.ink, C.panel, originMix)} strokeWidth={2.5} />
        )}
      </g>
      {/* Frame border */}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.ink} strokeWidth={BORDER} />
      {/* X ticks */}
      {showXTicks && xt.map((t, i) => {
        const px = pxOfX(t);
        return (
          <g key={`xt-${i}`}>
            <line x1={px} y1={y + h} x2={px} y2={y + h + 8} stroke={C.ink} strokeWidth={2.5} />
            {showXLabels && (
              <text x={px} y={y + h + 28} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} fill={C.dim}>
                {formatXTick(t)}
              </text>
            )}
          </g>
        );
      })}
      {/* Y ticks */}
      {showYTicks && yt.map((t, i) => {
        const py = pxOfY(t);
        return (
          <g key={`yt-${i}`}>
            <line x1={x - 8} y1={py} x2={x} y2={py} stroke={C.ink} strokeWidth={2.5} />
            {showYLabels && (
              <text x={x - 14} y={py + yOff} textAnchor="end" fontFamily={MONO} fontWeight={700} fontSize={fontSize} fill={C.dim}>
                {formatYTick(t)}
              </text>
            )}
          </g>
        );
      })}
      {/* Axis labels */}
      {xLabel && (
        <text x={x + w / 2} y={y + h + 56} textAnchor="middle" fontFamily={FONT} fontWeight={labelWeight} fontSize={lblSize} fill={C.ink}>
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={yLblX}
          y={y + h / 2}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={labelWeight}
          fontSize={lblSize}
          fill={C.ink}
          transform={`rotate(-90 ${yLblX} ${y + h / 2})`}
        >
          {yLabel}
        </text>
      )}
    </g>
  );
};

export type PlotCurveProps = {
  paths: readonly string[];
  color: string;
  progress?: number;
  strokeWidth?: number;
  dashed?: boolean;
  opacity?: number;
  haloColor?: string;
};

export const PlotCurve: React.FC<PlotCurveProps> = ({
  paths,
  color,
  progress = 1,
  strokeWidth = 5,
  dashed = false,
  opacity = 1,
  haloColor,
}) => {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0.001 || opacity <= 0.001 || !paths.length) return null;
  return (
    <g opacity={opacity}>
      {paths.map((d, i) => {
        let evo: {strokeDasharray?: string; strokeDashoffset?: number} = {};
        if (p < 0.999) {
          try {
            const e = evolvePath(p, d);
            evo = {strokeDasharray: e.strokeDasharray, strokeDashoffset: Number(e.strokeDashoffset)};
          } catch {
            evo = {};
          }
        }
        return (
          <React.Fragment key={i}>
            {haloColor && (
              <path
                d={d}
                fill="none"
                stroke={haloColor}
                strokeWidth={strokeWidth + 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...evo}
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={p >= 0.999 && dashed ? '12 8' : evo.strokeDasharray}
              strokeDashoffset={evo.strokeDashoffset}
            />
          </React.Fragment>
        );
      })}
    </g>
  );
};

export const PlotMarker: React.FC<{
  cx: number;
  cy: number;
  fill: string;
  r?: number;
  tag?: string;
  opacity?: number;
}> = ({cx, cy, fill, r = 9, tag, opacity = 1}) => {
  const {C, MONO} = useTheme();
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || opacity <= 0.001) return null;
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={C.ink} strokeWidth={3.5} />
      {tag && (
        <g transform={`translate(${cx + 14}, ${cy - 18})`}>
          <rect x={0} y={-22} width={Math.max(54, tag.length * 13 + 18)} height={30} rx={5} fill={C.panel} stroke={C.ink} strokeWidth={2.5} />
          <text x={9} y={-1} fontFamily={MONO} fontWeight={700} fontSize={19} fill={C.ink}>
            {tag}
          </text>
        </g>
      )}
    </g>
  );
};

export const PlotLegend: React.FC<{
  items: {label: string; color: string; dashed?: boolean; opacity?: number}[];
}> = ({items}) => {
  const {C, FONT, BORDER} = useTheme();
  if (!items.length) return null;
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center'}}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 14px',
            background: C.panel,
            border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
            borderRadius: 6,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 22,
            color: C.ink,
            opacity: it.opacity ?? 1,
          }}
        >
          <svg width={28} height={10} viewBox="0 0 28 10">
            <line
              x1={2}
              y1={5}
              x2={26}
              y2={5}
              stroke={it.color}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeDasharray={it.dashed ? '6 5' : undefined}
            />
          </svg>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
};
