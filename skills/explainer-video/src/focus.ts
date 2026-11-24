// `focus`: bring parts of a diagram forward as the narration talks about them. explainer.py turns each focus phrase into
// a time (focusSec); here that becomes, per frame, how dimmed or lifted each part is and where the camera points.
import {interpolate, Easing, useCurrentFrame} from 'remotion';
import constants from './constants.json';

export type FocusEvent = {t: number; on: string[]};
type State = Set<string> | null;

/** Frames a focus change takes. */
const FOCUS_FRAMES = 12;
/** Opacity of a part that is not in focus. */
const DIM = 0.22;

/** The focus before and after the latest change, and how far that change has progressed (0..1). */
export type FocusNow = {prev: State; cur: State; p: number};

export const useFocus = (events: FocusEvent[] | undefined, lead: number): FocusNow => {
  const frame = useCurrentFrame();
  let k = -1;
  const evs = (events ?? []).map((e) => ({f: lead + Math.round(e.t * constants.fps), on: e.on.length ? new Set(e.on.map((s) => s.replace(/\s+/g, ''))) : null}));
  evs.forEach((e, i) => {
    if (frame >= e.f) k = i;
  });
  if (k < 0) return {prev: null, cur: null, p: 1};
  const p = interpolate(frame, [evs[k].f, evs[k].f + FOCUS_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return {prev: k > 0 ? evs[k - 1].on : null, cur: evs[k].on, p};
};

/** Whether a part with this id is in focus. */
export const partIn = (id: string) => (s: Set<string>) => s.has(id);
/** Whether a link is in focus: named as "from->to", or both of its ends are (a self-link: its one end). */
export const linkIn = (from: string, to: string) => (s: Set<string>) => s.has(`${from}->${to}`) || (s.has(from) && s.has(to));

/** How a part looks now: `opacity` multiplier and `lift` (0..1, 1 = brought forward). */
export const look = (f: FocusNow, inFocus: (s: Set<string>) => boolean) => {
  const at = (s: State) => (s === null ? {dim: 0, lift: 0} : inFocus(s) ? {dim: 0, lift: 1} : {dim: 1, lift: 0});
  const a = at(f.prev), b = at(f.cur);
  const dim = a.dim + (b.dim - a.dim) * f.p;
  return {opacity: 1 - (1 - DIM) * dim, lift: a.lift + (b.lift - a.lift) * f.p};
};

// ---- camera: zoom towards the focused parts, only when the diagram is drawn small ----
export type Rect = {x: number; y: number; w: number; h: number};
type Cam = {s: number; cx: number; cy: number};

/** Largest on-screen scale of the diagram once zoomed (relative to its natural size). */
const MAX_ABS_ZOOM = 1.2;
/** Zoom only when it would enlarge the focused part by at least this factor; otherwise dimming alone is enough. */
const MIN_GAIN = 1.25;
const PAD = 70;

const camFor = (state: State, rectOf: (s: Set<string>) => Rect[], width: number, height: number, baseZoom: number): Cam => {
  const none = {s: 1, cx: width / 2, cy: height / 2};
  if (!state) return none;
  const rs = rectOf(state);
  if (!rs.length) return none;
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  const s = Math.min(width / (x1 - x0 + 2 * PAD), height / (y1 - y0 + 2 * PAD), MAX_ABS_ZOOM / baseZoom);
  if (s < MIN_GAIN) return none;
  // keep the zoomed view inside the drawing: the centre may not come closer to an edge than half the visible size
  const clampC = (c: number, size: number) => Math.min(Math.max(c, size / (2 * s)), size - size / (2 * s));
  return {s, cx: clampC((x0 + x1) / 2, width), cy: clampC((y0 + y1) / 2, height)};
};

/**
 * CSS transform (origin 0 0) for the diagram box: zooms towards the focused parts. `rectOf` gives the on-screen boxes
 * (in the unzoomed diagram) of the parts in a focus set; `baseZoom` is how much the layout was already scaled to fit.
 */
export const camera = (f: FocusNow, rectOf: (s: Set<string>) => Rect[], width: number, height: number, baseZoom: number) => {
  const a = camFor(f.prev, rectOf, width, height, baseZoom), b = camFor(f.cur, rectOf, width, height, baseZoom);
  const mix = (x: number, y: number) => x + (y - x) * f.p;
  const s = mix(a.s, b.s), cx = mix(a.cx, b.cx), cy = mix(a.cy, b.cy);
  return {s, x: width / 2 - s * cx, y: height / 2 - s * cy};
};
