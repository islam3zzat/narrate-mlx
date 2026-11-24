// 2D view of the `code` visual: a dark code panel with a line-number gutter and a spotlight (a band over the lines, the
// rest dimmed) that glides from one highlight to the next as the narration names them. Long excerpts scroll inside a
// window that follows the spotlight. Pure function of the frame; the code itself is always left to right.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl, stripTashkeel} from '../../rtl';
import {Heading, at, prog} from '../../kit2d';
import type {View2DProps} from '../props';
import {tokenize, codeColorsFor} from './highlight';
import {parseLines, displayCells} from './schema';
import {spotlight, type Stop} from './spotlight';

const PAD = 12;
// Layout budget of the 1700 x 730 scene body (see Explainer.tsx padding): the heading is 68 px with a 44 px gap and 14 px of rule,
// the caption 32 px under a 16 px gap. Text widths are estimated per display cell (a deliberately generous 40 px for the heading,
// 18 px for the caption) so a wrapped heading or caption is allowed for and the panel never reaches the subtitle pill.
const BODY_W = 1700, BODY_H = 730, SLACK = 30, GAP = 24, TAG_CELL = 17, TAG_MIN = 120, TAG_MAX = 560;
const HEAD_CELL = 40, HEAD_LINE = 72, HEAD_EXTRA = 58, CAP_CELL = 18, CAP_LINE = 38, CAP_EXTRA = 16;

export const View2D: React.FC<View2DProps<'code'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const {name: themeName, C, MONO, BORDER, shadow, isAnime} = useTheme();
  const codeBg = codeColorsFor(C).bg;
  const tokens = React.useMemo(() => tokenize(v.code, v.language, undefined, themeName), [v.code, v.language, themeName]);
  const n = tokens.length;
  // the tag column has one width for the whole scene (the widest label, capped), so the heading wraps the same way at every frame
  const tagW = Math.max(TAG_MIN, Math.min(TAG_MAX, Math.max(...v.highlights.map((h) => displayCells(h.label) * TAG_CELL + 40))));
  const headLines = Math.max(1, Math.ceil((displayCells(v.heading) * HEAD_CELL) / (BODY_W - GAP - tagW)));
  const capLines = v.caption ? Math.max(1, Math.ceil((displayCells(v.caption) * CAP_CELL) / BODY_W)) : 0;
  const avail = BODY_H - SLACK - (headLines * HEAD_LINE + HEAD_EXTRA) - (capLines ? capLines * CAP_LINE + CAP_EXTRA : 0);
  const big = n <= 12;
  const fontPx = big ? 30 : 26, lh = big ? 40 : 30;
  const windowLines = Math.min(n, Math.floor((avail - 2 * PAD) / lh));
  const maxScroll = n - windowLines;

  // highlights in the order they are spoken (the script order when times tie), each with the scroll that centres it
  const stops: Stop[] = v.highlights
    .map((h, i) => {
      const r = parseLines(h.lines) ?? {from: 1, to: 1};
      const len = r.to - r.from + 1;
      const centred = r.from - 1 + len / 2 - windowLines / 2; // 0-based top line that centres the range
      const scroll = Math.max(0, Math.min(maxScroll, Math.round(len > windowLines ? r.from - 1 : centred))); // whole lines, so no row is cut
      return {at: at(i, v.highlights.length, lead, audioFrames, reveal), from: r.from, to: r.to, scroll, label: h.label, i};
    })
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const s = spotlight(stops, frame);
  const gutterW = String(n).length * fontPx * 0.6 + 36;
  const label = (t: string) => (rtl ? stripTashkeel(t) : t);
  const cur = s.k >= 0 ? stops[s.k] : null, prevStop = s.k > 0 ? stops[s.k - 1] : null;

  const tag = (text: string, opacity: number, absolute: boolean) => (
    <span style={{display: absolute ? 'block' : 'inline-block', position: absolute ? 'absolute' : 'static', insetInlineEnd: 0, top: 0, opacity, fontFamily: MONO, fontWeight: 700, fontSize: 26, lineHeight: 1.2, padding: '4px 14px', whiteSpace: 'nowrap',
      maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: rtl ? 'none' : 'uppercase', letterSpacing: rtl ? 0 : 1, background: C.primary, color: C.ink, border: `3px solid ${C.ink}`}}>{label(text)}</span>
  );

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24}}>
        <Heading text={v.heading} />
        <div style={{position: 'relative', flex: 'none', width: tagW, minWidth: 0, marginBottom: 44, display: 'flex', justifyContent: 'flex-end'}}>
          {cur && (<div style={{position: 'relative', minWidth: 0, maxWidth: '100%'}}>
            {tag(cur.label, s.p, false)}
            {prevStop && s.p < 1 && tag(prevStop.label, 1 - s.p, true)}
          </div>)}
        </div>
      </div>
      <div style={{position: 'relative', boxSizing: 'border-box', width: '100%', height: windowLines * lh + 2 * PAD, overflow: 'hidden', background: codeBg, border: `${BORDER}px solid ${C.ink}`, ...(isAnime ? {borderRadius: 10} : {}), boxShadow: shadow(10, rtl), direction: 'ltr', unicodeBidi: 'isolate', fontFamily: MONO, fontSize: fontPx}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: PAD, height: windowLines * lh, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: -s.scroll * lh}}>
          {s.band > 0 && (
            <div style={{position: 'absolute', left: 0, right: 0, top: (s.from - 1) * lh, height: (s.to - s.from + 1) * lh, opacity: s.band}}>
              <div style={{position: 'absolute', inset: 0, background: C.primary + '40'}} />
              <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: C.primary}} />
            </div>
          )}
          {tokens.map((line, i) => (
            <div key={i} style={{display: 'flex', height: lh, overflow: 'hidden', lineHeight: `${lh}px`, whiteSpace: 'pre'}}>
              <div style={{width: gutterW, flex: 'none', boxSizing: 'border-box', paddingRight: 18, textAlign: 'right', color: C.dim, opacity: s.line(i + 1)}}>{i + 1}</div>
              <div style={{opacity: s.line(i + 1)}}>
                {line.map((t, j) => <span key={j} style={{color: t.color}}>{t.content}</span>)}
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: 16, opacity: prog(frame, 2, 10)}}>{rtl ? stripTashkeel(v.caption) : v.caption}</div>}
    </div>
  );
};
