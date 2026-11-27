// Canonical pure Visual SDK (Node-safe: zero React, Remotion, or Three imports).
// Visual schema, semantics, meta, catalog, and math helpers import from here.
export {z} from 'zod';
export {text, ID, GRAPH_TONES} from '../visuals/common';
export {cellWidth, displayCells, hex, forbiddenChar, bidiIn, bidiReorderIn, textCharIssues} from '../visuals/chars';
export {none, fresh, type Described, type Semantics} from '../semantics/types';
export {keywords, lintOrderedSlots, lintRtlAndBidi} from '../visuals/meta-lint';
export {
  NO_LINT,
  type Capabilities,
  type Docs,
  type FocusTargets,
  type LintCtx,
  type LintResult,
  type Meta,
} from '../visuals/meta-types';
export {type CatalogEntry, type CatalogVariant} from '../visuals/catalog-types';
export {niceTicks, type Domain, type Viewport} from '../visuals/plot-kit';
export {formatNumber, formatStat, inferDecimals, NO_SPACE_UNITS} from '../visuals/stat/format';

/** Safe-area canvas dimensions inside SceneChrome (1920x1080 minus chrome padding and heading/caption). */
export const SCENE_CANVAS_W = 1700;
export const SCENE_CANVAS_H = 590;
export const SCENE_CANVAS_H_CAPTION = 542;

/** Compute the usable 2D drawing box size for a scene canvas given whether a caption is present. */
export const sceneCanvasSize = (hasCaption: boolean): {width: number; height: number} => ({
  width: SCENE_CANVAS_W,
  height: hasCaption ? SCENE_CANVAS_H_CAPTION : SCENE_CANVAS_H,
});

/** Sanitize a React useId() string into a safe SVG/DOM id attribute with prefix. */
export const sanitizeStableId = (prefix: string, rawId: string): string =>
  `${prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'id'}-${rawId.replace(/[^a-zA-Z0-9_-]/g, '') || '0'}`;
