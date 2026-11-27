// Theme-aware 2D animated algorithm building blocks (cel-sky and paper, zero raw color literals).
import React from 'react';
import {mixHex, useBox, useTheme, type ThemeDef} from './view2d';
import type {AlgoStateTone} from './algo-math';

export type AlgoTonePalette = {bg: string; border: string; fg: string; opacity: number};

/** Resolve background, border, text color, and opacity for a semantic algorithm state tone. */
export const algoToneColors = (tone: AlgoStateTone, th: ThemeDef): AlgoTonePalette => {
  const {C, onAccent} = th;
  switch (tone) {
    case 'active':
      return {bg: C.primary, border: C.ink, fg: onAccent(C.primary), opacity: 1};
    case 'compare':
      return {bg: mixHex(C.primary, C.panel, 0.35), border: C.ink, fg: C.ink, opacity: 1};
    case 'swap':
      return {bg: C.secondary, border: C.ink, fg: onAccent(C.secondary), opacity: 1};
    case 'pivot':
      return {bg: C.danger, border: C.ink, fg: onAccent(C.danger), opacity: 1};
    case 'sorted':
      return {bg: C.accent, border: C.ink, fg: onAccent(C.accent), opacity: 1};
    case 'visited':
      return {bg: mixHex(C.accent, C.panel, 0.45), border: C.ink, fg: C.ink, opacity: 1};
    case 'frontier':
      return {bg: mixHex(C.secondary, C.panel, 0.45), border: C.ink, fg: C.ink, opacity: 1};
    case 'dim':
      return {bg: mixHex(C.muted, C.panel, 0.55), border: C.dim, fg: C.dim, opacity: 0.52};
    case 'default':
    default:
      return {bg: C.panel, border: C.ink, fg: C.ink, opacity: 1};
  }
};

const fitTextSize = (text: string, width: number, baseSize: number): number => {
  const len = Math.max(1, text.length);
  const maxByWidth = (width * 0.78) / (len * 0.62);
  return Math.max(13, Math.min(baseSize, Math.floor(maxByWidth)));
};

export type AlgoCellProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  index?: number;
  tone?: AlgoStateTone;
  subLabel?: string;
  opacity?: number;
};

/** SVG array cell with theme shadow, semantic tone fill, auto-fitted label, and optional index tag. */
export const AlgoCell: React.FC<AlgoCellProps> = ({
  x,
  y,
  width,
  height,
  value,
  index,
  tone = 'default',
  subLabel,
  opacity = 1,
}) => {
  const th = useTheme();
  const {C, FONT, MONO, BORDER, isAnime, cel} = th;
  const pal = algoToneColors(tone, th);
  const rx = isAnime ? 10 : 4;
  const sh = isAnime ? 5 : 6;
  const shColor = isAnime ? cel.shadowTint : C.ink;
  const fontSize = fitTextSize(value, width, Math.min(34, Math.round(height * 0.36)));

  return (
    <g opacity={opacity * pal.opacity}>
      <rect x={x + sh} y={y + sh} width={width} height={height} rx={rx} fill={shColor} />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        fill={pal.bg}
        stroke={pal.border}
        strokeWidth={BORDER}
      />
      {isAnime && (
        <line
          x1={x + 8}
          y1={y + 4}
          x2={x + width - 8}
          y2={y + 4}
          stroke={cel.rimLight}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}
      <text
        x={x + width / 2}
        y={y + height / 2 + fontSize * 0.34}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={fontSize}
        fill={pal.fg}
      >
        {value}
      </text>
      {subLabel && (
        <text
          x={x + width / 2}
          y={y + height - 10}
          textAnchor="middle"
          fontFamily={MONO}
          fontWeight={700}
          fontSize={13}
          fill={pal.fg}
          opacity={0.85}
        >
          {subLabel}
        </text>
      )}
      {index !== undefined && (
        <text
          x={x + width / 2}
          y={y + height + 24}
          textAnchor="middle"
          fontFamily={MONO}
          fontWeight={700}
          fontSize={16}
          fill={C.dim}
        >
          {index}
        </text>
      )}
    </g>
  );
};

export type AlgoBarProps = {
  x: number;
  yBase: number;
  width: number;
  height: number;
  value: string;
  index?: number;
  tone?: AlgoStateTone;
  opacity?: number;
};

/** SVG sorting/magnitude bar rising from `yBase` with value label above and optional index below. */
export const AlgoBar: React.FC<AlgoBarProps> = ({
  x,
  yBase,
  width,
  height,
  value,
  index,
  tone = 'default',
  opacity = 1,
}) => {
  const th = useTheme();
  const {C, MONO, BORDER, isAnime, cel} = th;
  const pal = algoToneColors(tone, th);
  const h = Math.max(12, height);
  const topY = yBase - h;
  const rx = isAnime ? 8 : 3;
  const sh = isAnime ? 5 : 6;
  const shColor = isAnime ? cel.shadowTint : C.ink;
  const valSize = fitTextSize(value, width + 10, 20);

  return (
    <g opacity={opacity * pal.opacity}>
      <rect x={x + sh} y={topY + sh} width={width} height={h} rx={rx} fill={shColor} />
      <rect
        x={x}
        y={topY}
        width={width}
        height={h}
        rx={rx}
        fill={pal.bg}
        stroke={pal.border}
        strokeWidth={BORDER}
      />
      <text
        x={x + width / 2}
        y={topY - 10}
        textAnchor="middle"
        fontFamily={MONO}
        fontWeight={800}
        fontSize={valSize}
        fill={C.ink}
      >
        {value}
      </text>
      {index !== undefined && (
        <text
          x={x + width / 2}
          y={yBase + 24}
          textAnchor="middle"
          fontFamily={MONO}
          fontWeight={700}
          fontSize={16}
          fill={C.dim}
        >
          {index}
        </text>
      )}
    </g>
  );
};

export type PointerBadgeProps = {
  x: number;
  y: number;
  name: string;
  tone?: AlgoStateTone;
  stackRow?: number;
  direction?: 'up' | 'down';
  opacity?: number;
};

/** SVG pointer pill badge (`L`, `R`, `i`, `j`, `pivot`) with automatic vertical stacking on collisions. */
export const PointerBadge: React.FC<PointerBadgeProps> = ({
  x,
  y,
  name,
  tone = 'active',
  stackRow = 0,
  direction = 'up',
  opacity = 1,
}) => {
  const th = useTheme();
  const {C, MONO, isAnime, cel} = th;
  const pal = algoToneColors(tone, th);
  const pillH = 28;
  const pillW = Math.max(40, Math.min(130, name.length * 12 + 22));
  const stepY = stackRow * 36;
  const dir = direction === 'up' ? 1 : -1;
  const boxY = direction === 'up' ? y + 14 + stepY : y - 14 - pillH - stepY;
  const tipY = direction === 'up' ? y + 3 : y - 3;
  const stemStartY = direction === 'up' ? boxY : boxY + pillH;

  return (
    <g opacity={opacity}>
      {stackRow === 0 && (
        <>
          <line x1={x} y1={stemStartY} x2={x} y2={tipY} stroke={C.ink} strokeWidth={2.5} />
          <polygon
            points={`${x},${tipY} ${x - 6},${tipY + 8 * dir} ${x + 6},${tipY + 8 * dir}`}
            fill={C.ink}
          />
        </>
      )}
      <rect
        x={x - pillW / 2 + 3}
        y={boxY + 3}
        width={pillW}
        height={pillH}
        rx={6}
        fill={isAnime ? cel.shadowTint : C.ink}
      />
      <rect
        x={x - pillW / 2}
        y={boxY}
        width={pillW}
        height={pillH}
        rx={6}
        fill={pal.bg}
        stroke={C.ink}
        strokeWidth={2.5}
      />
      <text
        x={x}
        y={boxY + 19}
        textAnchor="middle"
        fontFamily={MONO}
        fontWeight={800}
        fontSize={16}
        fill={pal.fg}
      >
        {name}
      </text>
    </g>
  );
};

export type WindowBracketProps = {
  leftX: number;
  rightX: number;
  topY: number;
  bottomY: number;
  label?: string;
  tone?: AlgoStateTone;
  opacity?: number;
};

/** SVG sliding-window / subarray range bracket spanning `[leftX..rightX]` with optional badge label. */
export const WindowBracket: React.FC<WindowBracketProps> = ({
  leftX,
  rightX,
  topY,
  bottomY,
  label,
  tone = 'active',
  opacity = 1,
}) => {
  const th = useTheme();
  const {C, MONO, isAnime} = th;
  const pal = algoToneColors(tone, th);
  const pad = 10;
  const x = Math.min(leftX, rightX) - pad;
  const w = Math.max(24, Math.abs(rightX - leftX) + pad * 2);
  const h = Math.max(24, bottomY - topY);
  const badgeW = label ? Math.max(84, Math.min(260, label.length * 11 + 26)) : 0;

  return (
    <g opacity={opacity}>
      <rect
        x={x}
        y={topY}
        width={w}
        height={h}
        rx={isAnime ? 12 : 6}
        fill={pal.bg}
        fillOpacity={0.14}
        stroke={pal.border}
        strokeWidth={3}
        strokeDasharray="10 6"
      />
      {label && (
        <g transform={`translate(${x + w / 2 - badgeW / 2}, ${topY - 16})`}>
          <rect width={badgeW} height={28} rx={6} fill={pal.bg} stroke={C.ink} strokeWidth={2.5} />
          <text
            x={badgeW / 2}
            y={19}
            textAnchor="middle"
            fontFamily={MONO}
            fontWeight={800}
            fontSize={15}
            fill={pal.fg}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

export type AuxStripItem = {text: string; tone?: AlgoStateTone};

export type AuxStripProps = {
  label: string;
  items: readonly AuxStripItem[];
  note?: string;
};

/** Compact themed tray displaying auxiliary algorithm state (stack, queue, invariant, running metric). */
export const AuxStrip: React.FC<AuxStripProps> = ({label, items, note}) => {
  const th = useTheme();
  const makeBox = useBox();
  const {C, FONT, MONO, BORDER} = th;

  return (
    <div
      style={makeBox({
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 18px',
        minHeight: 54,
      })}
    >
      <span style={{fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.dim, textTransform: 'uppercase'}}>
        {label}
      </span>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1}}>
        {items.map((it, i) => {
          const pal = algoToneColors(it.tone ?? 'default', th);
          return (
            <span
              key={i}
              style={{
                fontFamily: MONO,
                fontSize: 19,
                fontWeight: 800,
                color: pal.fg,
                background: pal.bg,
                border: `${Math.max(2, BORDER - 1)}px solid ${pal.border}`,
                borderRadius: 6,
                padding: '3px 12px',
              }}
            >
              {it.text}
            </span>
          );
        })}
      </div>
      {note && (
        <span style={{fontFamily: FONT, fontSize: 20, fontWeight: 700, color: C.ink}}>
          {note}
        </span>
      )}
    </div>
  );
};

export type StepIndicatorProps = {
  step: number;
  total: number;
  label: string;
  note?: string;
};

/** Compact step header pill synced with `stepTimeline`. */
export const StepIndicator: React.FC<StepIndicatorProps> = ({step, total, label, note}) => {
  const th = useTheme();
  const {C, FONT, MONO, BORDER, isAnime, shadow} = th;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        background: C.panel,
        border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
        borderRadius: isAnime ? 8 : 4,
        boxShadow: shadow(4),
        padding: '6px 16px',
        alignSelf: 'flex-start',
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 17,
          fontWeight: 800,
          background: C.primary,
          color: th.onAccent(C.primary),
          border: `2px solid ${C.ink}`,
          borderRadius: 4,
          padding: '2px 10px',
        }}
      >
        Step {step + 1} / {Math.max(1, total)}
      </span>
      <span style={{fontFamily: FONT, fontSize: 21, fontWeight: 800, color: C.ink}}>
        {label}
      </span>
      {note && (
        <span style={{fontFamily: FONT, fontSize: 19, fontWeight: 600, color: C.dim}}>
          — {note}
        </span>
      )}
    </div>
  );
};
