// Pure catalog fixture types for Remotion Studio visual previews and coverage tests.
// Pure TS leaf (no React, Remotion, or Three imports).
import type {ScriptVisual} from '../schema';
import type {ThemeName} from '../themes';
import type {VisualType} from './registry';

export type CatalogFocusCue = {
  /** Normalized progress [0..1] across synthesized audio duration where this focus change fires. */
  atFrac: number;
  on: string[];
};

export type CatalogVariant<T extends VisualType> = {
  id: string;
  label: string;
  visual: Extract<ScriptVisual, {type: T}>;
  narration: string;
  mode?: '2d' | '3d';
  theme?: ThemeName;
  dir?: 'ltr' | 'rtl';
  focus?: CatalogFocusCue[];
  durationSec?: number;
  prev?: ScriptVisual;
  /** Dialogue visuals: the two speakers of the fixture (id -> name and role, in script order) and the id of whoever speaks the scene. */
  speakers?: Record<string, {name: string; role: string}>;
  speaker?: string;
  mermaidRendered?: {svg?: string; layout?: unknown};
  figureAsset?: string;
};

export type CatalogEntry<T extends VisualType> = {
  type: T;
  title: string;
  default: CatalogVariant<T>;
  variants?: readonly CatalogVariant<T>[];
};
