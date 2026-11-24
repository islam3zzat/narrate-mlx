// 2D view of the `timeline` visual: a horizontal rail for up to 5 events, a vertical one for more. Each event pops in when
// its label is spoken; `focus` (event ids) dims the others. Pure function of the frame; mirrored by `direction: rtl`.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl, stripTashkeel} from '../../rtl';
import {Heading, at, prog} from '../../kit2d';
import {useFocus, look, partIn} from '../../focus';
import type {View2DProps} from '../props';
import {TIMELINE_LIMITS} from './schema';

type Ev = View2DProps<'timeline'>['visual']['events'][number];

// Text tags: status and marker are always words, never colour alone. Arabic has its own words (no vowel marks on screen).
const STATUS: Record<'en' | 'ar', Record<NonNullable<Ev['status']>, string>> = {
  en: {confirmed: 'confirmed', reported: 'reported', unknown: 'unknown'},
  ar: {confirmed: 'مؤكد', reported: 'مبلغ عنه', unknown: 'غير معروف'},
};
const MARKER: Record<'en' | 'ar', Record<Exclude<NonNullable<Ev['marker']>, 'none'>, string>> = {
  en: {detected: 'detected', mitigated: 'mitigated', resolved: 'resolved', impact: 'impact'},
  ar: {detected: 'تم الاكتشاف', mitigated: 'تم التخفيف', resolved: 'تم الحل', impact: 'الأثر'},
};
const Tag: React.FC<{text: string; fill?: string; dashed?: boolean; size: number; rtl: boolean}> = ({text, fill, dashed, size, rtl}) => {
  const {C, MONO, onAccent, isAnime} = useTheme();
  const bg = fill ?? C.panel;
  return (
    <span style={{display: 'inline-block', fontFamily: MONO, fontWeight: 700, fontSize: size, lineHeight: 1.2, padding: '2px 10px', whiteSpace: 'nowrap',
      textTransform: rtl ? 'none' : 'uppercase', letterSpacing: rtl ? 0 : 1, background: bg, color: onAccent(bg), border: `3px ${dashed ? 'dashed' : 'solid'} ${C.ink}`, ...(isAnime ? {borderRadius: 6} : {})}}>{text}</span>
  );
};

const Tags: React.FC<{e: Ev; size: number; rtl: boolean}> = ({e, size, rtl}) => {
  const {C} = useTheme();
  const MARKER_FILL = {detected: C.primary, mitigated: C.secondary, resolved: C.accent, impact: C.danger} as const;
  const l = rtl ? 'ar' : 'en';
  const marker = e.marker && e.marker !== 'none' ? e.marker : null;
  if (!marker && !e.status) return null;
  return (
    <span style={{display: 'inline-flex', gap: 10, flexWrap: 'wrap'}}>
      {marker && <Tag text={MARKER[l][marker]} fill={MARKER_FILL[marker]} size={size} rtl={rtl} />}
      {e.status && <Tag text={STATUS[l][e.status]} fill={e.status === 'confirmed' ? C.accent : e.status === 'unknown' ? C.muted : C.panel} dashed={e.status !== 'confirmed'} size={size} rtl={rtl} />}
    </span>
  );
};

const NodeMark: React.FC<{e: Ev; size: number}> = ({e, size}) => {
  const {C, BORDER} = useTheme();
  const MARKER_FILL = {detected: C.primary, mitigated: C.secondary, resolved: C.accent, impact: C.danger} as const;
  return (
    <div style={{width: size, height: size, flex: 'none', boxSizing: 'border-box', border: `${BORDER}px solid ${C.ink}`, background: e.marker && e.marker !== 'none' ? MARKER_FILL[e.marker] : C.panel, borderRadius: e.marker && e.marker !== 'none' ? size : 0}} />
  );
};

const txt = (s: string, rtl: boolean) => (rtl ? stripTashkeel(s) : s);
/** `at` is shown as written; its own left-to-right run keeps "14:02 UTC" intact inside an Arabic line. */
const whenStyle = (rtl: boolean): React.CSSProperties => (rtl ? {direction: 'ltr', unicodeBidi: 'isolate'} : {});

export const View2D: React.FC<View2DProps<'timeline'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const rtl = useRtl();
  const {C, MONO, BORDER, shadow, isAnime} = useTheme();
  const f = useFocus(focus, lead);
  const n = v.events.length;
  const horizontal = n <= TIMELINE_LIMITS.rail;
  const avail = v.caption ? 520 : 570;
  const state = (e: Ev, i: number) => {
    const p = prog(frame, at(i, n, lead, audioFrames, reveal));
    // an event without an id is never named by focus: it is dimmed whenever a focus is active
    const l = look(f, (s) => (e.id ? partIn(e.id)(s) : false));
    return {p, opacity: p * l.opacity, lift: l.lift};
  };
  const pop = (s: ReturnType<typeof state>): React.CSSProperties => ({opacity: s.opacity, transform: `translateY(${(1 - s.p) * 22}px) scale(${1 + 0.03 * s.lift})`});

  const body = horizontal ? (() => {
    const labelPx = n <= 3 ? 42 : n === 4 ? 36 : 32, detailPx = n <= 3 ? 28 : 25, whenPx = n <= 3 ? 34 : 30;
    return (
      <div style={{position: 'relative', display: 'flex', gap: 24}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: whenPx * 1.3 + 14 + 16 - BORDER / 2, height: BORDER, background: C.ink}} />
        {v.events.map((e, i) => {
          const s = state(e, i);
          return (
            <div key={i} style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', ...pop(s)}}>
              <div style={{fontFamily: MONO, fontWeight: 700, fontSize: whenPx, lineHeight: 1.3, marginBottom: 14, ...whenStyle(rtl)}}>{e.at}</div>
              <div style={{display: 'flex', marginBottom: 22}}><NodeMark e={e} size={32} /></div>
              <div style={{flex: 1, background: C.panel, border: `${BORDER}px solid ${C.ink}`, ...(isAnime ? {borderRadius: 10} : {}), boxShadow: shadow(8, rtl), padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden'}}>
                <div style={{fontSize: labelPx, fontWeight: 700, lineHeight: rtl ? 1.4 : 1.15, overflowWrap: 'anywhere'}}>{txt(e.label, rtl)}</div>
                <Tags e={e} size={20} rtl={rtl} />
                {e.detail && <div style={{fontSize: detailPx, color: C.dim, lineHeight: rtl ? 1.5 : 1.3, overflowWrap: 'anywhere'}}>{txt(e.detail, rtl)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  })() : (() => {
    const rowH = Math.floor(avail / n);
    const labelPx = n <= 7 ? 32 : n === 8 ? 29 : 26, detailPx = n <= 7 ? 24 : n === 8 ? 22 : 20, whenW = 270;
    const nodePx = n <= 8 ? 28 : 24;
    return (
      <div style={{position: 'relative', height: avail}}>
        <div style={{position: 'absolute', insetInlineStart: whenW + 28 - BORDER / 2, top: rowH / 2, bottom: rowH / 2, width: BORDER, background: C.ink}} />
        {v.events.map((e, i) => {
          const s = state(e, i);
          return (
            <div key={i} style={{height: rowH, display: 'flex', alignItems: 'center', gap: 0, ...pop(s)}}>
              <div style={{width: whenW, flex: 'none', paddingInlineEnd: 16, textAlign: 'end', fontFamily: MONO, fontWeight: 700, fontSize: labelPx - 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...whenStyle(rtl)}}>{e.at}</div>
              <div style={{width: 56, flex: 'none', display: 'flex', justifyContent: 'center'}}><NodeMark e={e} size={nodePx} /></div>
              <div style={{flex: 1, minWidth: 0, paddingInlineStart: 16}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                  <div style={{minWidth: 0, fontSize: labelPx, fontWeight: 700, lineHeight: rtl ? 1.4 : 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{txt(e.label, rtl)}</div>
                  <div style={{flex: 'none'}}><Tags e={e} size={n <= 8 ? 20 : 18} rtl={rtl} /></div>
                </div>
                {e.detail && <div style={{fontSize: detailPx, color: C.dim, lineHeight: rtl ? 1.4 : 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{txt(e.detail, rtl)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  })();

  return (
    <div>
      <Heading text={v.heading} />
      {body}
      {v.caption && <div style={{fontSize: 32, color: C.dim, textAlign: 'center', marginTop: horizontal ? 36 : 16, opacity: prog(frame, 2, 10)}}>{txt(v.caption, rtl)}</div>}
    </div>
  );
};
