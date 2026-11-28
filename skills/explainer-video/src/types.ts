import type {ScriptVisual} from './schema';
import type {ThemeName} from './themes';

// Visual as Remotion receives it: strictly matches ScriptVisual. Runtime-rendered mermaid artifacts (SVG path and
// optional layered layout) live on Scene.mermaidRendered so Scene.visual always conforms to VisualSchema.
export type MermaidRendered = {svg?: string; layout?: unknown};
export type Visual = ScriptVisual;

export type Scene = {
  id: string; narration: string; visual: Visual; mermaidRendered?: MermaidRendered; figureAsset?: string; figureAspect?: number; audio: string;
  durationSec: number; frames: number; leadFrames: number;
  /** From forced alignment (absent if alignment failed: the renderer then spreads reveals evenly). */
  words?: {w: string; start: number; end: number}[];
  sentences?: {text: string; start: number}[];
  revealSec?: number[];
  /** Script fields that reach the renderer as written. */
  continues?: true;
  chapter?: string;
  /** Dialogue videos (podcast style): the id of who speaks this scene, a key of VideoData.speakers. */
  speaker?: string;
  /** Focus changes, with `at` resolved to seconds from the start of the narration audio (explainer.py). */
  focusSec?: {t: number; on: string[]}[];
};
export type VideoData = {
  id: string; title: string; fps: number; totalFrames: number; scenes: Scene[];
  /** The script's language and its text direction (explainer.py writes both; older data files have neither: left to right). */
  language?: 'en' | 'ar'; dir?: 'ltr' | 'rtl';
  /** Missing in older data files: 2d. */
  mode?: '2d' | '3d';
  /** Visual theme (absent = cel-sky). */
  theme?: ThemeName;
  /** The script's `layout` as written: 'whiteboard', 'slides', or absent = automatic (src/whiteboard/eligible.ts resolveLayout). */
  layout?: 'whiteboard' | 'slides';
  /** Two-voice dialogue (podcast style), in script order: id to display name and role. Absent for every other video; the voices stay audio-side. */
  speakers?: Record<string, {name: string; role: string}>;
};
