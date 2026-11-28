// 2D (slides layout) view of the `stance` visual: the question on top and one column per speaker (avatar and name), each entry a card
// in its speaker's column, in the order spoken. A "resolve" entry draws a check mark over the "disagree" card it settles.
// Rows are fixed slots (four per column), so a card never moves when later entries appear. See layout.ts.
import React from 'react';
import {useTheme} from '../../theme';
import {useRtl} from '../../rtl';
import {at, inStyle, prog} from '../../kit2d';
import {Avatar} from '../../sdk/avatar';
import {distinctIds, speakerById, speakerPair, useSpeakers} from '../../speakers';
import {KIND_LABEL, columnIds, placeEntries} from './layout';
import type {View2DProps} from '../props';

const COL_W = 800, GAP = 100, ROW = 104, HEAD = 96, TOP = 0;

export const View2D: React.FC<View2DProps<'stance'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const rtl = useRtl();
  const th = useTheme();
  const {C, FONT, MONO, BORDER, accents, onAccent, shadow} = th;
  const sp = useSpeakers();
  const named = v.entries.map((e) => e.by);
  const ids = columnIds(sp?.list, named);
  const cols = (sp?.list.length ? speakerPair(sp.list, []) : ids.map((id) => speakerById(undefined, id, ids))).slice(0, 2);
  const order = distinctIds(named);
  const placed = placeEntries(v.entries, ids);
  const n = v.entries.length + 1;                          // slots: the question, then the entries
  const t = (slot: number) => at(slot, n, lead, audioFrames, reveal);
  const kindColor = (k: string) => (k === 'disagree' ? C.danger : k === 'claim' ? C.primary : C.accent);
  return (
    <div style={{position: 'relative', width: COL_W * 2 + GAP, ...(rtl ? {direction: 'rtl'} : {})}}>
      <div style={{display: 'inline-block', fontSize: 54, fontWeight: 800, lineHeight: 1.1, borderBottom: `10px solid ${C.primary}`, paddingBottom: 4, marginBottom: 24, maxWidth: '100%', ...inStyle(prog(frame, t(0)))}}>{v.question}</div>
      <div style={{position: 'relative', height: HEAD + ROW * 4, marginTop: TOP}}>
        {cols.map((s, ci) => (
          <div key={s.id} style={{position: 'absolute', top: 0, [ci === 0 ? 'left' : 'right']: 0, width: COL_W, display: 'flex', alignItems: 'center', gap: 16, height: HEAD - 8}}>
            <Avatar index={s.index} name={s.name} size="md" />
            <div style={{fontFamily: FONT, fontSize: 36, fontWeight: 800}}>{s.name}</div>
            {s.role && <div style={{fontFamily: MONO, fontSize: 18, color: C.dim}}>{s.role}</div>}
          </div>
        ))}
        {v.entries.map((e, i) => {
          const pl = placed[i], who = speakerById(sp?.list, e.by, order);
          const p = prog(frame, t(i + 1));
          const col = kindColor(e.kind);
          // the check over the card a later "resolve" entry settles
          const settledBy = v.entries.findIndex((x, k) => k > i && x.kind === 'resolve' && x.ref === i);
          const pc = settledBy >= 0 ? prog(frame, t(settledBy + 1) + 6, 10) : 0;
          return (
            <div key={i} style={{position: 'absolute', top: HEAD + pl.row * ROW, [pl.col === 0 ? 'left' : 'right']: 0, width: COL_W, height: ROW - 10, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 16,
              padding: '8px 18px', background: C.panel, border: `${BORDER}px solid ${C.ink}`, boxShadow: `inset ${rtl ? -14 : 14}px 0 0 ${col}, ${shadow(5, rtl)}`, paddingInlineStart: 34, ...inStyle(p)}}>
              <div style={{flex: 'none', width: 40, height: 40, borderRadius: 999, background: accents[who.index % 2], border: `3px solid ${C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 20, color: onAccent(accents[who.index % 2])}}>{i + 1}</div>
              <div style={{minWidth: 0}}>
                <div style={{fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: rtl ? 0 : 1, color: C.dim}}>
                  <span style={{background: col, color: onAccent(col), padding: '1px 8px', marginInlineEnd: 8}}>{KIND_LABEL[e.kind]}</span>
                  {e.ref !== undefined && <span>{`re #${e.ref + 1}`}</span>}
                </div>
                <div style={{fontFamily: FONT, fontSize: 30, fontWeight: 600, lineHeight: 1.15, marginTop: 4}}>{e.text}</div>
              </div>
              {pc > 0 && (
                <svg width={92} height={92} viewBox="0 0 92 92" style={{position: 'absolute', top: -30, right: 6, opacity: pc, transform: `scale(${0.7 + 0.3 * pc})`, overflow: 'visible'}} aria-hidden>
                  <path d="M12 50 L36 74 L80 14" fill="none" stroke={C.ink} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 50 L36 74 L80 14" fill="none" stroke={C.accent} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
