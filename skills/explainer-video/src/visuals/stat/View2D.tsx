// 2D view of the `stat` visual: one to four tiles, each a big counter that counts up when its label is spoken; a stat with `from`
// also gets before/after bars and a change chip. Pure function of the frame (no state, no time hooks of its own); `focus` dims
// the other stats. English only: the root is forced left to right, so an Arabic script (which only warns) is not half-mirrored.
import React from 'react';
import {useTheme} from '../../theme';
import {Heading, at, prog} from '../../kit2d';
import {useFocus, look, partIn} from '../../focus';
import type {View2DProps} from '../props';
import {formatNumber, formatStat, inferDecimals, NO_SPACE_UNITS} from './format';
import {axisMax, barFraction, counterStart, counterValue, countFrames, delta, type StatT} from './count';

/** Sizes by stat count: number, label, bar height, bar text. */
const sizes = (n: number, bars: boolean) =>
  // numbers stay under 150 px: at 190 px the browser rasterised the glyphs with one-pixel differences between runs (not pixel-exact goldens)
  n === 1 ? {num: bars ? 128 : 144, label: 44, bar: 36, small: 28, chip: 30, pad: '30px 44px', gap: 18}
    : n === 2 ? {num: bars ? 116 : 140, label: 38, bar: 30, small: 24, chip: 26, pad: '26px 34px', gap: 16}
      : {num: n === 3 ? 92 : 76, label: n === 3 ? 30 : 27, bar: 24, small: n === 3 ? 21 : 19, chip: n === 3 ? 22 : 19, pad: '22px 24px', gap: 12};

const Arrow: React.FC<{dir: 'up' | 'down' | 'none'; size: number; color: string}> = ({dir, size, color}) => (
  <svg width={size} height={size} viewBox="0 0 10 10" style={{flex: 'none'}}>
    {dir === 'up' ? <polygon points="0,10 5,0 10,10" fill={color} /> : dir === 'down' ? <polygon points="0,0 10,0 5,10" fill={color} /> : <rect x="0" y="4" width="10" height="2" fill={color} />}
  </svg>
);

const Tag: React.FC<{text: string; fill: string; size: number}> = ({text, fill, size}) => {
  const {C, MONO, onAccent, isAnime} = useTheme();
  return (
    <span style={{display: 'inline-block', alignSelf: 'flex-start', fontFamily: MONO, fontWeight: 700, fontSize: size, lineHeight: 1.2, padding: '2px 10px', textTransform: 'uppercase', letterSpacing: 1, background: fill, color: onAccent(fill), border: `3px solid ${C.ink}`, ...(isAnime ? {borderRadius: 6} : {})}}>{text}</span>
  );
};

// `nameCh`: one name column width for both rows of a tile, so the two tracks start at the same x
const Bar: React.FC<{name: string; nameCh: number; text: string; width: number; frac: number; fill: string; zero: boolean; z: ReturnType<typeof sizes>}> = ({name, nameCh, text, width, frac, fill, zero, z}) => {
  const {C, MONO} = useTheme();
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
      <div style={{width: `${nameCh}ch`, flex: 'none', fontFamily: MONO, fontWeight: 700, fontSize: z.small, textTransform: 'uppercase', color: C.dim}}>{name}</div>
      <div style={{flex: 1, minWidth: 0, height: z.bar, background: C.muted, border: `3px solid ${C.ink}`, boxSizing: 'content-box'}}>
        <div style={{width: `${frac * 100}%`, minWidth: zero ? 0 : 6, height: '100%', background: fill}} />
      </div>
      <div style={{width: `${width}ch`, flex: 'none', fontFamily: MONO, fontWeight: 700, fontSize: z.small, textAlign: 'right', whiteSpace: 'nowrap'}}>{text}</div>
    </div>
  );
};

export const View2D: React.FC<View2DProps<'stat'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, FONT, MONO, BORDER, shadow, onAccent, isAnime} = useTheme();
  const TONE_FILL = {good: C.accent, bad: C.danger, neutral: C.primary} as const;
  const f = useFocus(focus, lead);
  const n = v.stats.length;
  const axes = axisMax(v.stats);
  const avail = v.caption ? 520 : 570;
  const anyBars = v.stats.some((s) => s.from !== undefined);

  const tile = (s: StatT, i: number) => {
    const z = sizes(n, anyBars);
    const d = s.decimals ?? inferDecimals(s.value, s.from);
    const start = at(i, n, lead, audioFrames, reveal);
    const len = countFrames(start, lead, audioFrames);
    const cur = counterValue(frame, start, len, counterStart(s), s.value);
    const p = prog(frame, start);
    // a stat without an id is never named by focus: it dims whenever a focus is active
    const l = look(f, (set) => (s.id ? partIn(s.id)(set) : false));
    const shown = formatNumber(cur, d);
    // the widest string the counter will show, hidden under the live one: the tile never reflows while counting
    const widest = [formatNumber(s.from ?? 0, d), formatNumber(s.value, d)].reduce((a, b) => (b.length > a.length ? b : a));
    const unitGap = s.unit && NO_SPACE_UNITS.has(s.unit) ? 2 : z.num * 0.12;
    const bars = s.from !== undefined;
    const dl = bars ? delta(s, d) : null;
    const fill = TONE_FILL[dl ? dl.tone : 'neutral'];
    const chipFill = dl ? (dl.tone === 'good' ? C.accent : dl.tone === 'bad' ? C.danger : C.panel) : C.panel;
    const chipP = prog(frame, start + len, 10);
    const axis = axes[i];
    // in a row of 3 or 4 the tiles are narrow: the bars say "was"/"now" and only the number (the unit is on the big counter)
    const narrow = n >= 3;
    const barText = (x: number) => (narrow ? formatNumber(x, d) : formatStat(x, d, s.unit));
    const textW = Math.max(...[s.from ?? 0, s.value].map((x) => barText(x).length)) + 1;
    return (
      <div key={i} style={{flex: 1, minWidth: 0, maxWidth: n === 1 ? 1100 : undefined, background: C.panel, border: `${BORDER}px solid ${C.ink}`, ...(isAnime ? {borderRadius: 10} : {}), boxShadow: shadow(8, false), padding: z.pad,
        display: 'flex', flexDirection: 'column', gap: z.gap, opacity: p * l.opacity, transform: p < 1 || l.lift > 0 ? `translateY(${(1 - p) * 22}px) scale(${1 + 0.03 * l.lift})` : undefined}}>
        <div style={{fontSize: z.label, fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{s.label}</div>
        <div style={{display: 'flex', alignItems: 'baseline'}}>
          <div style={{display: 'grid', fontFamily: FONT, fontWeight: 700, fontSize: z.num, lineHeight: 1.02, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'}}>
            <span style={{gridArea: '1 / 1', visibility: 'hidden'}}>{widest}</span>
            <span style={{gridArea: '1 / 1'}}>{shown}</span>
          </div>
          {s.unit && <span style={{marginLeft: unitGap, fontSize: z.num * 0.42, fontWeight: 700, color: C.dim, whiteSpace: 'nowrap'}}>{s.unit}</span>}
        </div>
        {!bars && s.tone && s.tone !== 'neutral' && <Tag text={s.tone === 'good' ? 'good' : 'bad'} fill={s.tone === 'good' ? C.accent : C.danger} size={z.small} />}
        {bars && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4}}>
            <Bar name={narrow ? 'was' : 'before'} nameCh={narrow ? 4 : 7} text={barText(s.from!)} width={textW} frac={barFraction(s.from!, axis)} fill={C.dim} zero={s.from === 0} z={z} />
            <Bar name={narrow ? 'now' : 'after'} nameCh={narrow ? 4 : 7} text={barText(cur)} width={textW} frac={barFraction(cur, axis)} fill={fill} zero={cur === 0} z={z} />
          </div>
        )}
        {dl && (
          <div style={{display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 10, padding: '4px 14px', background: chipFill, color: onAccent(chipFill), border: `3px solid ${C.ink}`,
            fontFamily: MONO, fontWeight: 700, fontSize: z.chip, whiteSpace: 'nowrap', opacity: chipP, transform: `translateY(${(1 - chipP) * 10}px)`}}>
            <Arrow dir={dl.dir} size={z.chip * 0.8} color={onAccent(chipFill)} />
            <span>{dl.text}</span>
            {dl.word && <span style={{textTransform: 'uppercase', letterSpacing: 1, fontSize: z.chip * 0.8}}>{dl.word}</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{direction: 'ltr'}}>
      <Heading text={v.heading} />
      <div style={{height: avail, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{display: 'flex', gap: n <= 2 ? 40 : 28, alignItems: 'stretch', width: '100%', justifyContent: 'center'}}>{v.stats.map(tile)}</div>
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, opacity: prog(frame, 2, 10)}}>{v.caption}</div>}
    </div>
  );
};
