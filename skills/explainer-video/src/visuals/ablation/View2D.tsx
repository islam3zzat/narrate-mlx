// 2D animated ablation waterfall view: steps cleanly from baseline through +/- component contributions.
// Uses useTheme() tokens + mixHex exclusively; RTL-safe LTR progression with deterministic formatting.
import React, {useId} from 'react';
import {interpolate, spring, useVideoConfig} from 'remotion';
import type {View2DProps} from '../props';
import {Heading, at} from '../../kit2d';
import {look, partIn, useFocus} from '../../focus';
import {mixHex, useTheme, type Palette} from '../../theme';
import {niceTicks} from '../plot-kit';
import {PlotAxes} from '../../plot-svg';
import {computeWaterfall, resolveStepTone, type ResolvedTone} from './compute';

const fillFor = (tone: ResolvedTone, C: Palette, kind: 'base' | 'delta' | 'total'): string => {
  if (kind === 'base') return mixHex(C.muted, C.panel, 0.42);
  if (kind === 'total') return C.primary;
  switch (tone) {
    case 'accent': return mixHex(C.accent, C.panel, 0.14);
    case 'danger': return mixHex(C.danger, C.panel, 0.18);
    case 'primary': return mixHex(C.primary, C.panel, 0.1);
    case 'neutral': return mixHex(C.secondary, C.panel, 0.25);
  }
};

const tagColor = (tone: ResolvedTone, C: Palette): string => {
  switch (tone) {
    case 'accent': return mixHex(C.accent, C.ink, 0.45);
    case 'danger': return C.danger;
    case 'primary': return C.ink;
    case 'neutral': return C.secondary;
  }
};

export const View2D: React.FC<View2DProps<'ablation'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, FONT, MONO} = useTheme();
  const {fps} = useVideoConfig();
  const rawId = useId();
  const clipId = `ablation-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const focusNow = useFocus(focus, lead);

  const boxW = 1700;
  const boxH = v.caption ? 542 : 590;
  const wf = React.useMemo(() => computeWaterfall(v), [v]);
  const px = {x: 118, y: 44, w: 1512, h: boxH - 114};
  const nBars = wf.bars.length;
  const stepW = px.w / Math.max(1, nBars);
  const barW = Math.min(136, stepW * 0.6);

  const mapY = (val: number) =>
    px.y + px.h - ((val - wf.yDomain[0]) / Math.max(1e-12, wf.yDomain[1] - wf.yDomain[0])) * px.h;

  const yTicks = niceTicks(wf.yDomain[0], wf.yDomain[1], 5);

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Heading text={v.heading} />
      <div style={{position: 'relative', width: boxW, height: boxH, direction: 'ltr'}}>
        <svg width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`} style={{display: 'block'}}>
          {/* Top net contribution badge */}
          <g transform={`translate(${px.x + px.w - 196}, 6)`}>
            <rect
              x={0}
              y={0}
              width={196}
              height={32}
              rx={5}
              fill={mixHex(
                resolveStepTone(wf.netDelta, 'auto', v.higherIsBetter !== false) === 'danger' ? C.danger : C.accent,
                C.panel,
                0.72,
              )}
              stroke={C.ink}
              strokeWidth={2}
            />
            <text x={98} y={22} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={17} fill={C.ink}>
              {wf.netText}
            </text>
          </g>

          {/* Chart frame, grid & Y ticks */}
          <PlotAxes
            vp={{x: [0, 1], y: wf.yDomain, px}}
            clipId={clipId}
            yLabel={v.metric}
            yTicks={yTicks}
            showXGrid={false}
            showXTicks={false}
            showXOrigin={false}
            shadowOffset={6}
            gridMix={0.32}
            originMix={0.4}
            mapY={mapY}
            fontSize={19}
            yTickOffset={7}
            labelWeight={800}
            labelSize={21}
            yLabelX={30}
          />

          {/* Category labels along X */}
          {wf.bars.map((b, i) => {
            const cx = px.x + stepW * (i + 0.5);
            const fl = b.id ? look(focusNow, partIn(b.id)) : {opacity: focusNow.cur ? 0.28 : 1, lift: 0};
            return (
              <text
                key={`lbl-${i}`}
                x={cx}
                y={px.y + px.h + 30}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={b.kind === 'total' || fl.lift > 0.5 ? 900 : 700}
                fontSize={nBars > 7 ? 17 : 19}
                fill={C.ink}
                opacity={Math.max(0.45, fl.opacity)}
              >
                {b.label}
              </text>
            );
          })}

          {/* Clipped waterfall bars & dashed cumulative connectors */}
          <g clipPath={`url(#${clipId})`}>
            {wf.bars.map((b, i) => {
              const st = at(i, nBars, lead, audioFrames, reveal);
              const grow = spring({frame: Math.max(0, frame - st), fps, config: {damping: 16, stiffness: 135}});
              const op = interpolate(frame, [st - 2, st + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              if (op <= 0.01) return null;

              const fl = b.id ? look(focusNow, partIn(b.id)) : {opacity: focusNow.cur ? 0.24 : 1, lift: 0};
              const finalOp = op * fl.opacity;

              const cx = px.x + stepW * (i + 0.5);
              const bx = cx - barW / 2;
              const yFrom = mapY(b.from);
              const yToTarget = mapY(b.to);
              const yToCur = yFrom + (yToTarget - yFrom) * grow;
              const topY = Math.min(yFrom, yToCur);
              const barH = Math.max(3, Math.abs(yToCur - yFrom));

              const isEndpoint = b.kind !== 'delta';
              const prevCx = i > 0 ? px.x + stepW * (i - 0.5) + barW / 2 : bx;

              return (
                <g key={`wf-bar-${i}`} opacity={finalOp}>
                  {i > 0 && (
                    <line
                      x1={prevCx}
                      y1={yFrom}
                      x2={bx}
                      y2={yFrom}
                      stroke={mixHex(C.ink, C.panel, 0.45)}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                    />
                  )}
                  <rect
                    x={bx}
                    y={topY}
                    width={barW}
                    height={barH}
                    rx={5}
                    fill={fillFor(b.tone, C, b.kind)}
                    stroke={C.ink}
                    strokeWidth={isEndpoint || fl.lift > 0.5 ? 3.5 : 2.5}
                  />
                </g>
              );
            })}
          </g>

          {/* Unclipped value tags & notes so bar-top labels stay readable near bounds */}
          <g>
            {wf.bars.map((b, i) => {
              const st = at(i, nBars, lead, audioFrames, reveal);
              const grow = spring({frame: Math.max(0, frame - st), fps, config: {damping: 16, stiffness: 135}});
              const op = interpolate(frame, [st - 2, st + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              if (op <= 0.01 || grow <= 0.7) return null;

              const fl = b.id ? look(focusNow, partIn(b.id)) : {opacity: focusNow.cur ? 0.24 : 1, lift: 0};
              const finalOp = op * fl.opacity;

              const cx = px.x + stepW * (i + 0.5);
              const yFrom = mapY(b.from);
              const yToCur = yFrom + (mapY(b.to) - yFrom) * grow;
              const goingUp = b.to >= b.from;
              const tagY = goingUp ? Math.min(yToCur, yFrom) - 12 : Math.min(px.y + px.h - 10, Math.max(yToCur, yFrom) + 24);

              return (
                <g key={`wf-lbl-${i}`} opacity={finalOp}>
                  <text
                    x={cx}
                    y={tagY}
                    textAnchor="middle"
                    fontFamily={MONO}
                    fontWeight={900}
                    fontSize={20}
                    fill={b.kind === 'delta' ? tagColor(b.tone, C) : C.ink}
                    stroke={C.panel}
                    strokeWidth={5}
                    paintOrder="stroke"
                  >
                    {b.tagText}
                  </text>
                  {b.note && grow > 0.85 && (
                    <text
                      x={cx}
                      y={goingUp ? tagY - 24 : tagY + 22}
                      textAnchor="middle"
                      fontFamily={FONT}
                      fontWeight={700}
                      fontSize={15}
                      fill={C.dim}
                      stroke={C.panel}
                      strokeWidth={4}
                      paintOrder="stroke"
                    >
                      {b.note}
                    </text>
                  )}
                </g>
              );
            })}
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
