// 2D offline KaTeX formula spotlight renderer (strictly trust: false, zero network calls, pure theme tokens).
import React, {useEffect, useLayoutEffect, useMemo, useRef} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {continueRender, delayRender, interpolate, spring, useVideoConfig} from 'remotion';
import type {View2DProps} from '../props';
import {Heading, at} from '../../kit2d';
import {useFocus} from '../../focus';
import {mixHex, useTheme, type Palette} from '../../theme';
import {buildStyledLatex, parseEquationTerms} from './parse';

type ToneKey = 'primary' | 'accent' | 'secondary' | 'danger';

const tonePalette = (tone: ToneKey | undefined, C: Palette): {border: string; bg: string} => {
  switch (tone) {
    case 'accent': return {border: C.ink, bg: mixHex(C.accent, C.panel, 0.72)};
    case 'secondary': return {border: C.ink, bg: mixHex(C.secondary, C.panel, 0.82)};
    case 'danger': return {border: C.ink, bg: mixHex(C.danger, C.panel, 0.80)};
    case 'primary':
    default: return {border: C.ink, bg: mixHex(C.primary, C.panel, 0.65)};
  }
};

type KatexBoxProps = {
  styledLatex: string;
  fontSize: number;
};

const KatexBox: React.FC<KatexBoxProps> = ({styledLatex, fontSize}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    katex.render(styledLatex, el, {
      displayMode: true,
      trust: false,
      maxExpand: 64,
      strict: 'warn',
      throwOnError: false,
    });
  }, [styledLatex]);

  return (
    <div
      ref={ref}
      style={{
        direction: 'ltr',
        fontSize,
        lineHeight: 1.35,
        textAlign: 'center',
      }}
    />
  );
};

export const View2D: React.FC<View2DProps<'equation'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C, FONT, MONO, BORDER, shadow} = useTheme();
  const {fps} = useVideoConfig();
  const focusNow = useFocus(focus, lead);

  // Ensure bundled KaTeX fonts are decoded (plus 2 rAF layout ticks) before Remotion snapshots any frame.
  const [fontsHandle] = React.useState(() => delayRender('Loading KaTeX fonts'));
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(fontsHandle);
    };
    Promise.race([
      document.fonts.ready.then(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
      new Promise<void>((r) => setTimeout(r, 4000)),
    ]).then(finish, finish);
    return finish;
  }, [fontsHandle]);

  const termStarts = useMemo(
    () => v.terms.map((_, i) => at(i, v.terms.length, lead, audioFrames, reveal)),
    [v.terms, lead, audioFrames, reveal],
  );

  // Active term spotlight: `focus` overrides slot reveal when active, otherwise sequential term reveal.
  let activeTermIdx = -1;
  for (let i = 0; i < termStarts.length; i++) {
    if (frame >= termStarts[i]) activeTermIdx = i;
  }

  const activeIds = new Set<string>();
  if (focusNow.cur && focusNow.cur.size > 0) {
    for (const t of v.terms) {
      if (focusNow.cur.has(t.id)) activeIds.add(t.id);
    }
  } else if (activeTermIdx >= 0) {
    activeIds.add(v.terms[activeTermIdx].id);
  }

  const hasSpotlight = activeIds.size > 0;
  const activeTerms = hasSpotlight
    ? v.terms.filter((t) => activeIds.has(t.id))
    : [];

  const termColors: Record<string, {border: string; bg: string}> = {};
  for (const t of v.terms) {
    termColors[t.id] = tonePalette(t.tone, C);
  }

  const parsedEquations = useMemo(
    () =>
      v.equations.map((eq) => ({
        label: eq.label,
        parsed: parseEquationTerms(eq.latex),
      })),
    [v.equations],
  );

  const styledEquations = parsedEquations.map((eq) => ({
    label: eq.label,
    tex: buildStyledLatex(eq.parsed.segments, activeIds, hasSpotlight, {
      ink: C.ink,
      dim: mixHex(C.dim, C.panel, 0.55),
      defaultBorder: C.ink,
      defaultBg: mixHex(C.primary, C.panel, 0.65),
      termColors,
    }),
  }));

  const boxH = v.caption ? 542 : 590;
  const multiEq = v.equations.length > 1;
  const mathFontSize = multiEq ? 32 : 46;

  // Gloss entrance pulse aligned to latest activated slot
  const latestStart = activeTermIdx >= 0 ? termStarts[activeTermIdx] : lead;
  const glossPop = spring({frame: Math.max(0, frame - latestStart), fps, config: {damping: 16, stiffness: 150}});
  const cardIn = interpolate(frame, [0, lead + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Heading text={v.heading} />
      <div
        style={{
          width: 1700,
          height: boxH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 14,
          opacity: cardIn,
        }}
      >
        {/* Formula Stage Panel */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: multiEq ? 14 : 12,
            background: C.panel,
            border: `${BORDER}px solid ${C.ink}`,
            boxShadow: shadow(6),
            padding: multiEq ? '14px 40px' : '24px 48px',
            borderRadius: 6,
            color: C.ink,
          }}
        >
          {styledEquations.map((eq, i) => (
            <div key={`eq-${i}`} style={{display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center'}}>
              {eq.label && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    fontFamily: MONO,
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: 0.4,
                    color: C.dim,
                    textTransform: 'uppercase',
                  }}
                >
                  {eq.label}
                </div>
              )}
              <KatexBox styledLatex={eq.tex} fontSize={mathFontSize} />
            </div>
          ))}
        </div>

        {/* Plain-English Gloss Strip beneath Formula */}
        <div
          style={{
            minHeight: 92,
            background: hasSpotlight
              ? mixHex(tonePalette(activeTerms[0]?.tone, C).bg, C.panel, 0.25)
              : mixHex(C.muted, C.panel, 0.5),
            border: `${BORDER}px solid ${C.ink}`,
            boxShadow: shadow(4),
            borderRadius: 6,
            padding: '14px 26px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            transform: `translateY(${(1 - Math.min(1, glossPop)) * 6}px)`,
          }}
        >
          {hasSpotlight ? (
            <>
              <div
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  borderRadius: 5,
                  background: C.ink,
                  color: C.panel,
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: 22,
                }}
              >
                {activeTerms.map((t) => t.label).join(' + ')}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 25,
                  lineHeight: 1.35,
                  color: C.ink,
                }}
              >
                {activeTerms.map((t) => t.gloss).join(' · ')}
              </div>
            </>
          ) : (
            <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 23, color: C.dim}}>
              Key terms ({v.terms.map((t) => t.label).join(' · ')}) highlight sequentially as explained.
            </div>
          )}
        </div>
      </div>
      {v.caption && (
        <div style={{fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.dim, textAlign: 'center', marginTop: 2}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
