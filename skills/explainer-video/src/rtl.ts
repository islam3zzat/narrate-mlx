// Right-to-left layout for Arabic scripts (`language: "ar"`). explainer.py writes `dir: "rtl"` into the video data;
// Explainer.tsx puts it in this context and every visual reads it with useRtl(). An English script never sets it,
// and every style below only differs when it is on, so English renders exactly as before.
import React from 'react';

export const RtlContext = React.createContext(false);
export const useRtl = () => React.useContext(RtlContext);

/** Arabic marks (tashkeel, tatweel): the narration is vowelled for the voice, but on-screen captions read better without. */
export const stripTashkeel = (s: string) => s.replace(/[ً-ٰٟ]/g, '');

/** Extra style for text that must be laid out right to left (React Flow forces `direction: ltr` on its canvas). */
export const rtlText = (rtl: boolean): React.CSSProperties => (rtl ? {direction: 'rtl'} : {});

export const hasArabic = (s: string) => /[\u0621-\u064A\u066E-\u06D3]/.test(s);
