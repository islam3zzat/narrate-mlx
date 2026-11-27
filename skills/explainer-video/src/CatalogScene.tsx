// Interactive Storybook-like Remotion Studio scene wrapper for browsing any visual type without audio or a workdir.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import constants from './constants.json';
import {ChromeBackdrop, SceneChrome} from './SceneChrome';
import {RtlContext} from './rtl';
import {ThemeContext, getTheme, useFontGate, useTheme, type ThemeName} from './theme';
import {BoardScene, PaperOverlay, boardTheme} from './whiteboard/Whiteboard';
import {whiteboardBlockers} from './whiteboard/eligible';
import {HAND, INK, PAPER} from './sdk/annotate';
import type {Scene} from './types';
import type {MermaidRendered, Visual} from './types';
import {CAPABILITIES, THREE_D_TYPES} from './visuals/capabilities';
import type {CatalogFocusCue} from './visuals/catalog-types';
import {REGISTRY, describe as describeVisual, type VisualType} from './visuals/registry';

export type CatalogSceneProps = {
  type: VisualType;
  variantLabel: string;
  /** Absent = automatic: the whiteboard layout when this variant can use it, like a script without `layout`. A set theme other than paper keeps the slide layout (it is the theme being shown). */
  theme?: ThemeName;
  /** Studio-editable: 'slides' shows the slide layout, 'whiteboard' forces the board. */
  layout?: 'whiteboard' | 'slides';
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

const CatalogInner: React.FC<CatalogSceneProps & {board: boolean}> = ({
  board,
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

  if (board) {
    const leadFrames0 = leadFrames;
    const scene: Scene = {
      id: type, narration, visual: validVisual, audio: '', durationSec: audioSec, frames: durationInFrames, leadFrames: leadFrames0,
      revealSec, focusSec, mermaidRendered, figureAsset, figureAspect, sentences: [{text: narration, start: 0.08}],
    };
    return (
      <AbsoluteFill style={{background: PAPER, fontFamily: HAND, color: INK}}>
        <BoardScene scene={scene} index={0} last audio={false} />
        <div style={{position: 'absolute', top: 28, right: 40, fontFamily: HAND, fontSize: 26, color: INK, opacity: 0.45}}>{`${type} · whiteboard`}</div>
        <PaperOverlay />
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

/** True when this variant is shown on the whiteboard: the same rule a script without `layout` gets (resolveLayout). */
export const catalogUsesBoard = (p: Pick<CatalogSceneProps, 'theme' | 'layout' | 'mode' | 'dir' | 'type' | 'visual' | 'narration'>): boolean => {
  if (p.layout === 'slides') return false;
  if (p.layout === 'whiteboard') return true;
  const modes = CAPABILITIES[p.type].modes as readonly string[];
  const mode = modes.includes(p.mode) ? p.mode : modes[0];
  // an explicit theme (cel-sky included) is what the variant is there to show
  if (p.theme !== undefined && p.theme !== 'paper') return false;
  return whiteboardBlockers({language: p.dir === 'rtl' ? 'ar' : 'en', mode, scenes: [{narration: p.narration, visual: p.visual}]}).length === 0;
};

export const CatalogScene: React.FC<CatalogSceneProps> = (props) => {
  const rtl = props.dir === 'rtl';
  const board = catalogUsesBoard(props);
  const theme = board ? boardTheme() : getTheme(props.theme);
  // Mount the scene tree only once fonts settle: React Flow measures node handles on mount (useFontGate).
  const fontsReady = useFontGate(rtl, 'catalog-fonts');
  if (!fontsReady) return <AbsoluteFill style={{background: theme.C.bg}} />;

  const inner = <CatalogInner {...props} board={board} />;
  return (
    <ThemeContext.Provider value={theme}>
      <RtlContext.Provider value={rtl}>
        {board ? inner : <ChromeBackdrop>{inner}</ChromeBackdrop>}
      </RtlContext.Provider>
    </ThemeContext.Provider>
  );
};
