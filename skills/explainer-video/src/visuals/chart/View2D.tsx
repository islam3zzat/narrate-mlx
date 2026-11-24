// 2D empirical chart renderer: benchmark bar charts, scaling line curves, and Pareto scatter plots.
// Uses useTheme() tokens + mixHex exclusively; completely prop/frame-driven and RTL-safe (LTR chart axes).
import React, {useId} from 'react';
import {interpolate, spring, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import type {View2DProps} from '../props';
import {Heading, at} from '../../kit2d';
import {mixHex, useTheme, type Palette} from '../../theme';
import {look, partIn, useFocus} from '../../focus';
import {stageProgress, type PlotTone, type PxRect, type Viewport} from '../plot-kit';
import {PlotAxes, PlotLegend, fillForTone, strokeForTone} from '../../plot-svg';
import {
  computeParetoFrontier,
  formatAxisTick,
  formatChartValue,
  inferChartDomains,
  layoutScatterLabels,
  scaleTicks,
  toPlotVal,
  type AxisScale,
  type ScatterProjectedPt,
} from './compute';

const SERIES_DEFAULT_TONES: readonly PlotTone[] = ['secondary', 'ink', 'accent', 'danger', 'primary'];

const toneOf = (explicit: PlotTone | undefined, idx: number, highlight?: boolean): PlotTone => {
  if (explicit) return explicit;
  if (highlight) return 'primary';
  return SERIES_DEFAULT_TONES[idx % SERIES_DEFAULT_TONES.length];
};

const boxFill = (tone: PlotTone, C: Palette, highlight?: boolean): string => {
  const base = fillForTone(tone, C);
  if (tone === 'ink') return mixHex(C.muted, C.panel, 0.25);
  return highlight ? base : mixHex(base, C.panel, 0.14);
};

export const View2D: React.FC<View2DProps<'chart'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, FONT, MONO, BORDER, shadow} = useTheme();
  const {fps} = useVideoConfig();
  const rawId = useId();
  const clipId = `chart-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const focusNow = useFocus(focus, lead);

  const boxW = 1700;
  const boxH = v.caption ? 542 : 590;
  const xScale: AxisScale = v.xScale ?? 'linear';
  const yScale: AxisScale = v.yScale ?? 'linear';
  const {xDomain, yDomain, valueDecimals} = inferChartDomains(v);

  const focusLook = (id: string | undefined) =>
    id ? look(focusNow, partIn(id)) : {opacity: focusNow.cur ? 0.22 : 1, lift: 0};

  // Header + legend area above plot
  const hasLegend = v.kind === 'line' || (v.kind === 'bar' && (v.series?.length ?? 0) > 1);
  const legendItems = (v.series ?? []).map((s, i) => {
    const tone = toneOf(s.tone, i, s.highlight);
    const fl = focusLook(s.id);
    const col = v.kind === 'bar' ? boxFill(tone, C, s.highlight) : strokeForTone(tone, C);
    return {
      label: s.label,
      color: fl.opacity < 0.8 ? mixHex(col, C.panel, 0.65) : col,
      dashed: v.kind === 'line' ? Boolean(s.dashed) : false,
    };
  });

  const horizontalBar = v.kind === 'bar' && v.layout === 'horizontal';
  const px: PxRect = {
    x: horizontalBar ? 235 : 120,
    y: hasLegend ? 54 : 24,
    w: horizontalBar ? 1375 : 1510,
    h: boxH - (hasLegend ? 54 : 24) - 66,
  };

  // Plot viewport in transformed coordinate space (linear or log10)
  const plotVp: Viewport = horizontalBar
    ? {x: [toPlotVal(yDomain[0], yScale), toPlotVal(yDomain[1], yScale)], y: [0, 1], px}
    : {
        x: [toPlotVal(xDomain[0], xScale), toPlotVal(xDomain[1], xScale)],
        y: [toPlotVal(yDomain[0], yScale), toPlotVal(yDomain[1], yScale)],
        px,
      };

  const mapX = (val: number) =>
    px.x + ((val - plotVp.x[0]) / Math.max(1e-12, plotVp.x[1] - plotVp.x[0])) * px.w;
  const mapY = (val: number) =>
    px.y + px.h - ((val - plotVp.y[0]) / Math.max(1e-12, plotVp.y[1] - plotVp.y[0])) * px.h;

  const renderGridAndFrame = (xTicksRaw: number[], yTicksRaw: number[], showXAxisTicks: boolean, showYAxisTicks: boolean) => (
    <PlotAxes
      vp={{x: xDomain, y: yDomain, px}}
      clipId={clipId}
      xLabel={v.xLabel}
      yLabel={v.yLabel}
      xTicks={xTicksRaw}
      yTicks={yTicksRaw}
      showXGrid={showXAxisTicks}
      showYGrid={showYAxisTicks}
      showXTicks={showXAxisTicks}
      showYTicks={showYAxisTicks}
      showXOrigin={!horizontalBar && v.kind !== 'bar'}
      showYOrigin={!horizontalBar}
      shadowOffset={6}
      gridMix={0.32}
      originMix={0.45}
      mapX={(t) => mapX(horizontalBar ? toPlotVal(t, yScale) : toPlotVal(t, xScale))}
      mapY={(t) => mapY(toPlotVal(t, yScale))}
      formatXTick={formatAxisTick}
      formatYTick={formatAxisTick}
      fontSize={19}
      yTickOffset={7}
      labelWeight={800}
      labelSize={21}
      yLabelX={horizontalBar ? 34 : 30}
    />
  );

  const renderBaseline = () => {
    if (!v.baseline) return null;
    const bVal = toPlotVal(v.baseline.value, yScale);
    const col = strokeForTone(v.baseline.tone ?? 'danger', C);
    if (horizontalBar) {
      const bx = mapX(bVal);
      if (bx < px.x || bx > px.x + px.w) return null;
      return (
        <g>
          <line x1={bx} y1={px.y} x2={bx} y2={px.y + px.h} stroke={col} strokeWidth={3} strokeDasharray="10 7" />
          {v.baseline.label && (
            <g transform={`translate(${Math.min(px.x + px.w - 150, bx + 8)}, ${px.y + 18})`}>
              <rect x={0} y={0} width={Math.min(220, v.baseline.label.length * 11 + 20)} height={28} rx={4} fill={C.panel} stroke={col} strokeWidth={2} />
              <text x={10} y={20} fontFamily={FONT} fontWeight={800} fontSize={16} fill={col}>{v.baseline.label}</text>
            </g>
          )}
        </g>
      );
    }
    const by = mapY(bVal);
    if (by < px.y || by > px.y + px.h) return null;
    return (
      <g>
        <line x1={px.x} y1={by} x2={px.x + px.w} y2={by} stroke={col} strokeWidth={3} strokeDasharray="10 7" />
        {v.baseline.label && (
          <g transform={`translate(${px.x + px.w - Math.min(250, v.baseline.label.length * 11 + 26)}, ${by - 34})`}>
            <rect x={0} y={0} width={Math.min(240, v.baseline.label.length * 11 + 20)} height={28} rx={4} fill={C.panel} stroke={col} strokeWidth={2} />
            <text x={10} y={20} fontFamily={FONT} fontWeight={800} fontSize={16} fill={col}>{v.baseline.label}</text>
          </g>
        )}
      </g>
    );
  };

  const renderBarChart = () => {
    const cats = v.categories ?? [];
    const series = v.series ?? [];
    const nCat = cats.length;
    const nSer = series.length;
    const valTicks = scaleTicks(yDomain[0], yDomain[1], yScale, 5);
    const singleSeriesMode = nSer <= 1;
    const slotCount = singleSeriesMode ? nCat : nSer;

    const zeroPlot = yScale === 'log' ? plotVp.y[0] : Math.max(plotVp.y[0], Math.min(plotVp.y[1], 0));
    const zeroPx = horizontalBar ? mapX(zeroPlot) : mapY(zeroPlot);

    return (
      <g>
        {renderGridAndFrame(horizontalBar ? valTicks : [], horizontalBar ? [] : valTicks, horizontalBar, !horizontalBar)}
        {/* Category axis labels */}
        {cats.map((cat, ci) => {
          if (horizontalBar) {
            const bandH = px.h / Math.max(1, nCat);
            const cy = px.y + bandH * (ci + 0.5);
            return (
              <text key={`cat-${ci}`} x={px.x - 16} y={cy + 7} textAnchor="end" fontFamily={FONT} fontWeight={800} fontSize={21} fill={C.ink}>
                {cat}
              </text>
            );
          }
          const bandW = px.w / Math.max(1, nCat);
          const cx = px.x + bandW * (ci + 0.5);
          return (
            <text key={`cat-${ci}`} x={cx} y={px.y + px.h + 30} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={21} fill={C.ink}>
              {cat}
            </text>
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {renderBaseline()}
          {series.map((s, si) => {
            const tone = toneOf(s.tone, si, s.highlight);
            const fillCol = boxFill(tone, C, s.highlight);
            const fl = focusLook(s.id);
            const alpha = fl.opacity;
            const focused = fl.lift > 0.5;

            return cats.map((_, ci) => {
              const val = s.values?.[ci] ?? 0;
              const slotIdx = singleSeriesMode ? ci : si;
              const st = at(slotIdx, slotCount, lead, audioFrames, reveal);
              const grow = spring({frame: Math.max(0, frame - st), fps, config: {damping: 16, stiffness: 130}});
              const op = interpolate(frame, [st - 2, st + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) * alpha;
              if (op <= 0.01) return null;

              const valPlot = toPlotVal(val, yScale);
              const tipPx = horizontalBar ? mapX(valPlot) : mapY(valPlot);

              let errLowPx: number | null = null;
              let errHighPx: number | null = null;
              if (s.errors && s.errors[ci] !== undefined) {
                const e = s.errors[ci];
                const loV = yScale === 'log' ? Math.max(1e-12, val - e) : val - e;
                const hiV = val + e;
                errLowPx = horizontalBar ? mapX(toPlotVal(loV, yScale)) : mapY(toPlotVal(loV, yScale));
                errHighPx = horizontalBar ? mapX(toPlotVal(hiV, yScale)) : mapY(toPlotVal(hiV, yScale));
              } else if (s.ci && s.ci[ci]) {
                const [lo, hi] = s.ci[ci];
                errLowPx = horizontalBar ? mapX(toPlotVal(lo, yScale)) : mapY(toPlotVal(lo, yScale));
                errHighPx = horizontalBar ? mapX(toPlotVal(hi, yScale)) : mapY(toPlotVal(hi, yScale));
              }

              const showValText = grow > 0.72 && (nCat * nSer <= 12 || s.highlight || focused);
              const valStr = formatChartValue(val, valueDecimals, v.unit);

              if (horizontalBar) {
                const bandH = px.h / Math.max(1, nCat);
                const innerH = bandH * 0.74;
                const barH = Math.min(54, innerH / Math.max(1, nSer) - 6);
                const groupH = barH * nSer + Math.max(0, nSer - 1) * 6;
                const barY = px.y + bandH * (ci + 0.5) - groupH / 2 + si * (barH + 6);
                const targetW = Math.abs(tipPx - zeroPx) * grow;
                const x0 = tipPx >= zeroPx ? zeroPx : zeroPx - targetW;
                const animatedTip = tipPx >= zeroPx ? zeroPx + targetW : zeroPx - targetW;
                const midY = barY + barH / 2;

                return (
                  <g key={`bar-${si}-${ci}`} opacity={op}>
                    <rect
                      x={x0}
                      y={barY}
                      width={Math.max(2, targetW)}
                      height={barH}
                      rx={4}
                      fill={fillCol}
                      stroke={C.ink}
                      strokeWidth={s.highlight || focused ? 3.5 : 2.5}
                    />
                    {errLowPx !== null && errHighPx !== null && grow > 0.85 && (
                      <g>
                        <line x1={errLowPx} y1={midY} x2={errHighPx} y2={midY} stroke={C.ink} strokeWidth={2.5} />
                        <line x1={errLowPx} y1={midY - 6} x2={errLowPx} y2={midY + 6} stroke={C.ink} strokeWidth={2.5} />
                        <line x1={errHighPx} y1={midY - 6} x2={errHighPx} y2={midY + 6} stroke={C.ink} strokeWidth={2.5} />
                      </g>
                    )}
                    {showValText && (
                      <text
                        x={(errHighPx !== null ? Math.max(animatedTip, errHighPx) : animatedTip) + 10}
                        y={midY + 6}
                        textAnchor="start"
                        fontFamily={MONO}
                        fontWeight={800}
                        fontSize={18}
                        fill={C.ink}
                        stroke={C.panel}
                        strokeWidth={5}
                        paintOrder="stroke"
                      >
                        {valStr}
                      </text>
                    )}
                  </g>
                );
              }

              // Vertical grouped bar
              const bandW = px.w / Math.max(1, nCat);
              const innerW = bandW * 0.72;
              const gap = nSer > 1 ? 8 : 0;
              const barW = Math.min(82, (innerW - gap * Math.max(0, nSer - 1)) / Math.max(1, nSer));
              const groupW = barW * nSer + gap * Math.max(0, nSer - 1);
              const barX = px.x + bandW * (ci + 0.5) - groupW / 2 + si * (barW + gap);
              const targetH = Math.abs(zeroPx - tipPx) * grow;
              const isPos = valPlot >= zeroPlot;
              const barY = isPos ? zeroPx - targetH : zeroPx;
              const animatedTipY = isPos ? zeroPx - targetH : zeroPx + targetH;
              const midX = barX + barW / 2;

              return (
                <g key={`bar-${si}-${ci}`} opacity={op}>
                  <rect
                    x={barX}
                    y={barY}
                    width={barW}
                    height={Math.max(2, targetH)}
                    rx={4}
                    fill={fillCol}
                    stroke={C.ink}
                    strokeWidth={s.highlight || focused ? 3.5 : 2.5}
                  />
                  {errLowPx !== null && errHighPx !== null && grow > 0.85 && (
                    <g>
                      <line x1={midX} y1={errLowPx} x2={midX} y2={errHighPx} stroke={C.ink} strokeWidth={2.5} />
                      <line x1={midX - 7} y1={errLowPx} x2={midX + 7} y2={errLowPx} stroke={C.ink} strokeWidth={2.5} />
                      <line x1={midX - 7} y1={errHighPx} x2={midX + 7} y2={errHighPx} stroke={C.ink} strokeWidth={2.5} />
                    </g>
                  )}
                  {showValText && (
                    <text
                      x={midX}
                      y={isPos ? (errHighPx !== null ? Math.min(animatedTipY, errHighPx) : animatedTipY) - 10 : (errLowPx !== null ? Math.max(animatedTipY, errLowPx) : animatedTipY) + 22}
                      textAnchor="middle"
                      fontFamily={MONO}
                      fontWeight={800}
                      fontSize={18}
                      fill={C.ink}
                      stroke={C.panel}
                      strokeWidth={5}
                      paintOrder="stroke"
                    >
                      {valStr}
                    </text>
                  )}
                </g>
              );
            });
          })}
        </g>
      </g>
    );
  };

  const renderLineChart = () => {
    const series = v.series ?? [];
    const xTicks = scaleTicks(xDomain[0], xDomain[1], xScale, 6);
    const yTicks = scaleTicks(yDomain[0], yDomain[1], yScale, 5);

    return (
      <g>
        {renderGridAndFrame(xTicks, yTicks, true, true)}
        <g clipPath={`url(#${clipId})`}>
          {renderBaseline()}
          {series.map((s, si) => {
            const pts = s.points ?? [];
            if (pts.length < 2) return null;
            const st = at(si, series.length, lead, audioFrames, reveal);
            const prog = stageProgress(frame, st, 22);
            if (prog <= 0.001) return null;

            const tone = toneOf(s.tone, si, s.highlight);
            const col = strokeForTone(tone, C);
            const fl = focusLook(s.id);
            const alpha = fl.opacity;
            const focused = fl.lift > 0.5;

            const screenPts = pts.map(([wx, wy]) => [mapX(toPlotVal(wx, xScale)), mapY(toPlotVal(wy, yScale))] as const);
            const d = screenPts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
            const evolved = evolvePath(prog, d);

            let bandD: string | null = null;
            let bandRevealX = px.x + px.w;
            if (s.band && s.band.length === pts.length) {
              const upper = pts.map(([wx], idx) => [mapX(toPlotVal(wx, xScale)), mapY(toPlotVal(s.band![idx][1], yScale))] as const);
              const lower = pts.map(([wx], idx) => [mapX(toPlotVal(wx, xScale)), mapY(toPlotVal(s.band![idx][0], yScale))] as const).reverse();
              bandD = `${upper.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} ${lower.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} Z`;
              const x0 = screenPts[0][0];
              const x1 = screenPts[screenPts.length - 1][0];
              bandRevealX = x0 + (x1 - x0) * prog;
            }

            const bandClipId = `${clipId}-band-${si}`;
            const endPt = screenPts[screenPts.length - 1];

            return (
              <g key={`line-${si}`} opacity={alpha}>
                {bandD && (
                  <>
                    <clipPath id={bandClipId}>
                      <rect x={px.x} y={px.y} width={Math.max(0, bandRevealX - px.x)} height={px.h} />
                    </clipPath>
                    <path d={bandD} fill={fillForTone(tone, C)} fillOpacity={0.2} clipPath={`url(#${bandClipId})`} />
                  </>
                )}
                {s.highlight && (
                  <path
                    d={d}
                    fill="none"
                    stroke={C.panel}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={evolved.strokeDasharray}
                    strokeDashoffset={evolved.strokeDashoffset}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={col}
                  strokeWidth={s.highlight || focused ? 4.5 : 3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? '12 8' : evolved.strokeDasharray}
                  strokeDashoffset={s.dashed ? 0 : evolved.strokeDashoffset}
                  opacity={s.dashed ? prog : 1}
                />
                {prog > 0.9 && (
                  <circle cx={endPt[0]} cy={endPt[1]} r={s.highlight || focused ? 7 : 5.5} fill={col} stroke={C.panel} strokeWidth={2.5} />
                )}
              </g>
            );
          })}
        </g>
      </g>
    );
  };

  const renderScatterChart = () => {
    const rawPts = v.points ?? [];
    const xTicks = scaleTicks(xDomain[0], xDomain[1], xScale, 6);
    const yTicks = scaleTicks(yDomain[0], yDomain[1], yScale, 5);
    const showFrontier = v.showFrontier !== false;
    const betterX = v.betterX ?? 'min';
    const betterY = v.betterY ?? 'max';
    const frontierIndices = computeParetoFrontier(rawPts, betterX, betterY);
    const frontierSet = new Set(frontierIndices);

    const projected: ScatterProjectedPt[] = rawPts.map((p, idx) => ({
      idx,
      id: p.id,
      label: p.label,
      cx: mapX(toPlotVal(p.x, xScale)),
      cy: mapY(toPlotVal(p.y, yScale)),
      r: (p.size ?? 1) * 10,
      x: p.x,
      y: p.y,
      highlight: Boolean(p.highlight),
      onFrontier: frontierSet.has(idx),
    }));

    const labelBoxes = layoutScatterLabels(projected, px);
    const frontierPts = frontierIndices.map((idx) => projected[idx]);
    const frontierD = frontierPts.length >= 2
      ? frontierPts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.cx.toFixed(1)},${pt.cy.toFixed(1)}`).join(' ')
      : '';
    const lastReveal = at(Math.max(0, projected.length - 1), projected.length, lead, audioFrames, reveal);
    const frontierProg = stageProgress(frame, lastReveal, 20);

    // Corner badge pointing toward optimal corner
    const cornerLeft = betterX === 'min';
    const cornerTop = betterY === 'max';
    const badgeX = cornerLeft ? px.x + 18 : px.x + px.w - 196;
    const badgeY = cornerTop ? px.y + 18 : px.y + px.h - 52;

    return (
      <g>
        {renderGridAndFrame(xTicks, yTicks, true, true)}
        <g clipPath={`url(#${clipId})`}>
          {renderBaseline()}
          {/* Optimal corner cue */}
          {showFrontier && (
            <g transform={`translate(${badgeX}, ${badgeY})`}>
              <rect x={0} y={0} width={178} height={32} rx={4} fill={mixHex(C.primary, C.panel, 0.72)} stroke={C.ink} strokeWidth={2} />
              <text x={89} y={22} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={15} fill={C.ink}>
                Pareto Frontier
              </text>
            </g>
          )}
          {/* Pareto frontier polyline */}
          {showFrontier && frontierD && frontierProg > 0.01 && (
            <path
              d={frontierD}
              fill="none"
              stroke={strokeForTone('secondary', C)}
              strokeWidth={3.5}
              strokeDasharray="10 7"
              opacity={frontierProg}
            />
          )}
          {/* Points + smart labels */}
          {projected.map((pt, i) => {
            const st = at(i, projected.length, lead, audioFrames, reveal);
            const pop = spring({frame: Math.max(0, frame - st), fps, config: {damping: 14, stiffness: 160}});
            const fl = focusLook(pt.id);
            const focused = fl.lift > 0.5;
            const alpha = fl.opacity * interpolate(frame, [st - 2, st + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            if (alpha <= 0.01) return null;

            const rawPt = rawPts[i];
            const tone = toneOf(rawPt.tone, i, pt.highlight || pt.onFrontier);
            const fillCol = boxFill(tone, C, pt.highlight || pt.onFrontier);
            const box = labelBoxes[i];
            const r = Math.max(2, pt.r * Math.min(1.12, pop));

            return (
              <g key={`pt-${i}`} opacity={alpha}>
                {(pt.highlight || focused) && (
                  <circle cx={pt.cx} cy={pt.cy} r={r + 7} fill="none" stroke={C.primary} strokeWidth={3.5} />
                )}
                <circle cx={pt.cx} cy={pt.cy} r={r} fill={fillCol} stroke={C.ink} strokeWidth={2.5} />
                {pop > 0.55 && (
                  <g>
                    <rect
                      x={box.bx}
                      y={box.by}
                      width={box.bw}
                      height={box.bh}
                      rx={4}
                      fill={mixHex(C.panel, C.bg, 0.25)}
                      fillOpacity={0.9}
                      stroke={pt.highlight || focused ? C.ink : mixHex(C.muted, C.panel, 0.35)}
                      strokeWidth={pt.highlight || focused ? 2 : 1}
                    />
                    <text x={box.tx} y={box.ty} textAnchor={box.anchor} fontFamily={FONT} fontWeight={800} fontSize={17} fill={C.ink}>
                      {pt.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </g>
    );
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Heading text={v.heading} />
      <div style={{position: 'relative', width: boxW, height: boxH, direction: 'ltr'}}>
        {hasLegend && (
          <div style={{position: 'absolute', left: px.x, top: 4}}>
            <PlotLegend items={legendItems} />
          </div>
        )}
        <svg width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`} style={{display: 'block'}}>
          {v.kind === 'bar' ? renderBarChart() : v.kind === 'line' ? renderLineChart() : renderScatterChart()}
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
