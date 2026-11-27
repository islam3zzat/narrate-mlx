// Interactive Storybook-like Remotion Studio scene wrapper for browsing any visual type without audio or a workdir.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import constants from './constants.json';
import {ChromeBackdrop, SceneChrome} from './SceneChrome';
import {RtlContext} from './rtl';
import {ThemeContext, getTheme, useFontGate, useTheme, type ThemeName} from './theme';
import type {MermaidRendered, Visual} from './types';
import {CAPABILITIES, THREE_D_TYPES} from './visuals/capabilities';
import type {CatalogFocusCue} from './visuals/catalog-types';
import {REGISTRY, describe as describeVisual, type VisualType} from './visuals/registry';

export type CatalogSceneProps = {
  type: VisualType;
  variantLabel: string;
  theme: ThemeName;
  mode: '2d' | '3d';
  dir: 'ltr' | 'rtl';
  visual: Visual;
  narration: string;
  focus?: readonly CatalogFocusCue[];
  mermaidRendered?: MermaidRendered;
  figureAsset?: string;
  figureAspect?: number;
  prev?: Visual;
};

const CatalogInner: React.FC<CatalogSceneProps> = ({
  type,
  variantLabel,
  mode,
  visual,
  narration,
  focus,
  mermaidRendered,
  figureAsset,
  figureAspect,
  prev,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const {C, FONT, MONO, BORDER, shadow} = useTheme();

  const leadFrames = Math.round(constants.leadSec * constants.fps);
  const tailFrames = Math.round(constants.tailSec * constants.fps);
  const audioFrames = Math.max(30, durationInFrames - leadFrames - tailFrames);
  const audioSec = audioFrames / constants.fps;

  // Validate live edited props cleanly against the visual's Zod 4 schema.
  const parsed = REGISTRY[type].schema.safeParse(visual);
  const supportedModes = CAPABILITIES[type].modes as readonly string[];
  const effectiveMode: '2d' | '3d' = supportedModes.includes(mode) ? mode : (supportedModes[0] as '2d' | '3d');
  const validVisual = parsed.success ? (parsed.data as Visual) : null;
  const is3d = Boolean(validVisual && (effectiveMode === '3d' || (THREE_D_TYPES as readonly string[]).includes(validVisual.type)));

  const desc = React.useMemo(
    () => (validVisual ? describeVisual(validVisual, prev, mermaidRendered) : {slots: [], carried: []}),
    [validVisual, prev, mermaidRendered],
  );
  const nSlots = desc.slots.length;
  const revealSec = React.useMemo(
    () =>
      desc.slots.map((_, i) =>
        desc.carried[i] ? 0 : Number(((0.08 + (0.72 * i) / Math.max(1, nSlots)) * audioSec).toFixed(3)),
      ),
    [desc, nSlots, audioSec],
  );
  const focusSec = React.useMemo(
    () => (focus ?? []).map((f) => ({t: Number((f.atFrac * audioSec).toFixed(3)), on: f.on})),
    [focus, audioSec],
  );

  if (!parsed.success || !validVisual) {
    return (
      <AbsoluteFill style={{background: C.bg, padding: 80, justifyContent: 'center', fontFamily: FONT, color: C.ink}}>
        <div style={{background: C.panel, border: `${BORDER}px solid ${C.danger}`, padding: 36, borderRadius: 8, boxShadow: shadow(6)}}>
          <div style={{fontFamily: MONO, fontWeight: 900, fontSize: 28, color: C.danger, marginBottom: 16}}>
            Invalid {type} props
          </div>
          <pre style={{fontFamily: MONO, fontSize: 18, whiteSpace: 'pre-wrap', margin: 0}}>
            {parsed.success ? '' : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}
          </pre>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <SceneChrome
      scene={{
        visual: validVisual,
        narration,
        frames: durationInFrames,
        leadFrames,
        revealSec,
        focusSec,
        mermaidRendered,
        figureAsset,
        figureAspect,
        sentences: [{text: narration, start: 0.08}],
      }}
      title={`Visual Catalog · ${type}`}
      counterLabel={`${variantLabel} · ${effectiveMode.toUpperCase()}`}
      prev={prev}
      mode3d={is3d}
      frame={frame}
      audioFrames={audioFrames}
    />
  );
};

export const CatalogScene: React.FC<CatalogSceneProps> = (props) => {
  const rtl = props.dir === 'rtl';
  const theme = getTheme(props.theme);
  // Mount the scene tree only once fonts settle: React Flow measures node handles on mount (useFontGate).
  const fontsReady = useFontGate(rtl, 'catalog-fonts');
  if (!fontsReady) return <AbsoluteFill style={{background: theme.C.bg}} />;

  return (
    <ThemeContext.Provider value={theme}>
      <RtlContext.Provider value={rtl}>
        <ChromeBackdrop>
          <CatalogInner {...props} />
        </ChromeBackdrop>
      </RtlContext.Provider>
    </ThemeContext.Provider>
  );
};
