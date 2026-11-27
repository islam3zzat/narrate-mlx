import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {PLOT_TONES} from '../plot-kit';

export const FIGURE_LIMITS = {
  heading: 60,
  caption: 160,
  src: 240,
  alt: 120,
  label: 36,
  note: 100,
  maxRegions: 6,
  minZoom: 1,
  maxZoom: 3.5,
  minAspect: 0.35,
  maxAspect: 3.5,
} as const;

const ALLOWED_EXT_RE = /\.(png|jpe?g|svg)$/i;

export const FigureRegion = z.strictObject({
  id: ID.optional().describe('Optional id so `focus` can spotlight this region directly'),
  label: text('Region / callout label matched in narration (36 display cells max)').max(FIGURE_LIMITS.label),
  x: z.number().min(0).max(1).describe('Normalized left edge [0..1]'),
  y: z.number().min(0).max(1).describe('Normalized top edge [0..1]'),
  w: z.number().min(0.02).max(1).describe('Normalized width [0.02..1]'),
  h: z.number().min(0.02).max(1).describe('Normalized height [0.02..1]'),
  zoom: z.number().min(FIGURE_LIMITS.minZoom).max(FIGURE_LIMITS.maxZoom).optional()
    .describe('Optional zoom factor when spotlighting this region (1..3.5)'),
  tone: z.enum(PLOT_TONES).optional().describe('Highlight bounding box colour token from theme'),
  note: text('Optional short plain-English annotation shown while spotlighted').optional(),
});

export const FigureVisual = z.strictObject({
  type: z.literal('figure'),
  heading: text('Scene heading').max(FIGURE_LIMITS.heading),
  src: z.string().trim().min(1).max(FIGURE_LIMITS.src)
    .describe('Relative POSIX path inside <workdir> to a PNG, JPG/JPEG, or SVG file'),
  alt: text('Short figure description (also fallback reveal slot when no regions are listed)').max(FIGURE_LIMITS.alt),
  aspect: z.number().min(FIGURE_LIMITS.minAspect).max(FIGURE_LIMITS.maxAspect).optional()
    .describe('Expected image width/height aspect ratio (default 16/9)'),
  regions: z.array(FigureRegion).min(1).max(FIGURE_LIMITS.maxRegions).optional()
    .describe('Optional narration-timed callout bounding boxes (1..6) with zoom & dim-outside spotlight'),
  caption: text('Optional bottom takeaway note').max(FIGURE_LIMITS.caption).optional(),
}).superRefine((v, ctx) => {
  const addErr = (path: (string | number)[], message: string) =>
    ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

  const checkTxt = (path: (string | number)[], name: string, s: string | undefined, max: number) => {
    if (s === undefined) return;
    if (displayCells(s) > max) addErr(path, `${name} must be <= ${max} display cells`);
    for (const msg of textCharIssues(name, s)) addErr(path, msg);
  };

  checkTxt(['heading'], 'heading', v.heading, FIGURE_LIMITS.heading);
  checkTxt(['caption'], 'caption', v.caption, FIGURE_LIMITS.caption);
  checkTxt(['alt'], 'alt', v.alt, FIGURE_LIMITS.alt);

  const s = v.src;
  if (/[\x00-\x1f\x7f]/.test(s)) addErr(['src'], 'src must not contain control characters');
  if (s.startsWith('/') || s.startsWith('~') || s.includes('\\') || s.includes('://')) {
    addErr(['src'], 'src must be a relative POSIX path inside the workdir (no leading "/", "~", "\\", or URL scheme)');
  }
  const segs = s.split('/');
  if (segs.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    addErr(['src'], 'src must not contain empty, ".", or ".." path traversal segments');
  }
  if (!ALLOWED_EXT_RE.test(s)) {
    addErr(['src'], 'src must point to a .png, .jpg, .jpeg, or .svg file');
  }

  const seen = new Set<string>();
  v.regions?.forEach((r, i) => {
    if (r.id) {
      if (seen.has(r.id)) addErr(['regions', i, 'id'], `duplicate region id "${r.id}"`);
      seen.add(r.id);
    }
    checkTxt(['regions', i, 'label'], `regions[${i}].label`, r.label, FIGURE_LIMITS.label);
    checkTxt(['regions', i, 'note'], `regions[${i}].note`, r.note, FIGURE_LIMITS.note);
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)) {
      addErr(['regions', i], 'region coordinates must be finite');
    }
    if (r.x + r.w > 1.001) addErr(['regions', i, 'w'], `x + w (${(r.x + r.w).toFixed(3)}) must be <= 1`);
    if (r.y + r.h > 1.001) addErr(['regions', i, 'h'], `y + h (${(r.y + r.h).toFixed(3)}) must be <= 1`);
  });
});

export type FigureVisualT = z.infer<typeof FigureVisual>;
export type FigureRegionT = z.infer<typeof FigureRegion>;

export {FigureVisual as schema};
