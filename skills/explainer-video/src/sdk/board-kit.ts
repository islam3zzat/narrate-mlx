// Shared helpers of the per-type whiteboard drawings (src/visuals/<type>/board.ts): the content box, the narration-timed
// reveal frames, keyword matching against the spoken words, and the heading. Content area: x 110..1810, y 230..950
// (heading above, subtitle below). Pure functions of the scene and the narration timing; nothing here is specific to one script.
import constants from '../constants.json';
import {normWord} from '../words';
import {CARRIED} from '../semantics/carry';
import type {Scene, Visual} from '../types';
import {avatarGeom, speakerInitial} from './avatar-geom';
import {THEME_SPECS, mixHex} from '../themes';
import type {SpeakerEntry} from '../speakers';
import {boardHeadingMaxW} from '../speaker-tag-geom';
import {BLUE, Board, GREEN, INK, PAPER, RED, YELLOW, fitLines} from './annotate';

export type BoardCtx = Pick<Scene, 'narration' | 'leadFrames' | 'revealSec' | 'words' | 'sentences' | 'durationSec' | 'frames'> & {
  /** A `continues` scene of a type with capabilities.boardContinues: per reveal slot, true when it is carried from the previous scene (semantics.ts). Carried slots are drawn finished at frame 0. */
  carried?: boolean[];
  /** Per carried slot, the context of the scene that first drew it: what the narration of that scene picked out (a keyword underline) is part of the item and stays with it. */
  origin?: (BoardCtx | undefined)[];
  /** The heading is the previous scene's heading (a continued scene): drawn finished at frame 0 rather than written again. */
  carriedHead?: boolean;
  /** Every visual of the continued run this scene belongs to (itself included), same type: geometry that depends on how many slots or how much text there is is taken over all of them, so a carried slot never moves or resizes when a later scene adds more. Absent = this scene alone. */
  chain?: Visual[];
  /** Dialogue videos: both speakers in script order (absent when the video has no `speakers`). */
  speakers?: SpeakerEntry[];
  /** Dialogue videos: the id of whoever speaks this scene. */
  speaker?: string;
};
export const FPS = constants.fps;
export const COLORS = [BLUE, RED, GREEN];
export const LEFT = 110, RIGHT = 1810, WIDTH = RIGHT - LEFT, BOTTOM = 950;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Frame of the first spoken word at or after word index `from` that shares `key`'s first 5 letters (a cheap stem match); null if never spoken. */
export const wordHit = (c: BoardCtx, key: string, from = 0): {frame: number; i: number} | null => {
  const k = normWord(key).slice(0, 5);
  if (!k || !c.words) return null;
  for (let i = from; i < c.words.length; i++) {
    if (normWord(c.words[i].w).startsWith(k)) return {frame: c.leadFrames + Math.round(c.words[i].start * FPS), i};
  }
  return null;
};
export const secF = (c: BoardCtx, s: number) => c.leadFrames + Math.round(s * FPS);
/** The visuals the layout is computed over: the continued run (c.chain) or just `v`. */
export const layoutOf = <V extends Visual>(c: BoardCtx, v: V): V[] => (c.chain as V[] | undefined) ?? [v];
export const isCarried = (c: BoardCtx, i: number): boolean => c.carried?.[i] === true;
/** Frame at which slot `i` of `n` is drawn: CARRIED (finished from the start) for a carried slot, else its narration time. Without timing the fresh slots spread over the first 80% of the narration. */
export const revealF = (c: BoardCtx, i: number, n: number): number => {
  if (isCarried(c, i)) return CARRIED;
  if (c.revealSec?.[i] !== undefined) return secF(c, c.revealSec[i]);
  const k = c.carried ? c.carried.slice(0, i).filter((x) => !x).length : i;
  const m = c.carried ? n - c.carried.filter(Boolean).length : n;
  return c.leadFrames + Math.round((k / Math.max(m, 1)) * c.durationSec * FPS * 0.8);
};

/**
 * The word of `text` worth marking: the longest word (4+ letters) that the narrator says, else null. `before` is the
 * text in front of it (to measure its x offset) and `frame` is when it is spoken.
 */
export const spokenKeyword = (c: BoardCtx, text: string): {before: string; word: string; frame: number} | null => {
  const ws = text.split(/\s+/).filter(Boolean);
  const cands = ws
    .map((w, i) => ({w: w.replace(/[^\p{L}\p{N}'-]+$/u, ''), i}))
    .filter((x) => normWord(x.w).length >= 4)
    .sort((a, b) => b.w.length - a.w.length);
  for (const {w, i} of cands) {
    const hit = wordHit(c, w);
    if (hit) return {before: ws.slice(0, i).join(' ') + (i ? ' ' : ''), word: w, frame: hit.frame};
  }
  return null;
};

/** The heading line: baseline `y` (default 135, with the underline 27 below). With speakers the tag sits at the top end edge, so the heading is capped to stop short of it (speaker-tag-geom.ts). */
export const heading = (b: Board, text: string, c: BoardCtx, y = 135, size = 66) => {
  const f = fitLines(text, size, c.speakers ? boardHeadingMaxW(WIDTH) : WIDTH - 100, 700, 40);
  const at = c.carriedHead ? CARRIED : c.leadFrames;
  const t = b.text(f.lines[0], LEFT, y, f.size, INK, at, {weight: 700});
  b.underline(t.x0, t.x1, y + 27, YELLOW, t.end, 16);
  return t.end;
};

/** The board colour of speaker `index`: the same accent as their name pill and avatar (paper theme, accents[index % 2]). */
export const speakerColor = (index: number): string => [THEME_SPECS.paper.C.primary, THEME_SPECS.paper.C.accent][index % 2];

/**
 * A speaker's faceless bust drawn with the pen: head and shoulders outlines (the avatar geometry, so it is the same person as the
 * name pill's avatar), a marker hatch in their accent colour, and their initial on the chest badge. `x`/`y` is the top-left of the
 * `px` square. `fade` (0..1) pulls the colours toward the paper (a dimmed speaker): solid colours, never transparency. Returns the frame it is finished.
 */
export const boardAvatar = (b: Board, sp: SpeakerEntry, x: number, y: number, px: number, t0: number, fade = 0): number => {
  const g = avatarGeom(sp.index);
  const k = px / 100;
  const at = (p: [number, number]): [number, number] => [x + p[0] * k, y + p[1] * k];
  const dim = (c: string) => (fade > 0 ? mixHex(c, PAPER, fade) : c);
  const fill = dim(speakerColor(sp.index)), ink = dim(INK);
  const w = Math.max(3, Math.round(px / 22));
  const head = g.outline.head.map(at), sh = g.outline.shoulders.map(at);
  // marker hatch: horizontal strokes across each shape, clipped to its width at that height
  const hatch = (pts: [number, number][], y0: number, y1: number, step: number, from: number) => {
    let t = from;
    for (let yy = y0; yy <= y1; yy += step) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        if ((a[1] <= yy && c[1] > yy) || (c[1] <= yy && a[1] > yy)) xs.push(a[0] + ((yy - a[1]) / (c[1] - a[1])) * (c[0] - a[0]));
      }
      if (xs.length >= 2) {
        const x0 = Math.min(...xs) + w, x1 = Math.max(...xs) - w;
        if (x1 > x0) t = b.stroke([[x0, yy], [x1, yy + 1.5]], fill, step * 1.15, t, 5, 0.75);
      }
    }
    return t;
  };
  let t = hatch(head, y + 14 * k, y + 54 * k, Math.max(6, px / 12), t0);
  t = hatch([...sh, sh[0]], y + 64 * k, y + 99 * k, Math.max(6, px / 12), t);
  t = b.stroke([...head, head[0]], ink, w, t, 14);
  t = b.stroke(sh, ink, w, t, 14);
  const bc = at([g.badge.cx, g.badge.cy]);
  t = b.circle(bc[0], bc[1], g.badge.r * k, g.badge.r * k, ink, t, 8);
  return b.text(speakerInitial(sp.name), bc[0], bc[1] + g.badge.font * k * 0.36, Math.round(g.badge.font * k * 1.05), ink, t, {anchor: 'middle', dur: 6, weight: 700}).end;
};
