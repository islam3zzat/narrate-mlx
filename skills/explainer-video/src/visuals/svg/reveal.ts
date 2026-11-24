// When and how far each part of an svg drawing has appeared: pure functions of the frame (no React, no remotion), so a
// test can run them. Mirrors `at` in kit2d.tsx for when (narration reveal times, else spread over the first 80% of the audio).
import constants from '../../constants.json';
import type {Effect} from './parse';

/** Frame at which part `i` of `n` appears: its narration time when known, else spread evenly. */
export const revealFrame = (i: number, n: number, lead: number, audioFrames: number, reveal?: number[]): number =>
  reveal && reveal[i] !== undefined ? lead + Math.round(reveal[i] * constants.fps) : lead + Math.round((i / Math.max(n, 1)) * audioFrames * 0.8);

/** Frames a draw or fade takes. */
export const REVEAL_FRAMES = 14;

// a damped spring from 0 to 1 (closed form), slightly under-damped: a small overshoot, settled in about 20 frames
const ZETA = 0.6, OMEGA = 0.42;
const spring = (t: number): number => {
  if (t <= 0) return 0;
  const wd = OMEGA * Math.sqrt(1 - ZETA * ZETA);
  return 1 - Math.exp(-ZETA * OMEGA * t) * (Math.cos(wd * t) + ((ZETA * OMEGA) / wd) * Math.sin(wd * t));
};

// the first moment the spring reaches 1: from then on the progress (opacity) stays 1, so it never goes back down (the scale still overshoots)
const CROSS = (() => { let t = 0; while (spring(t) < 1 && t < 200) t += 0.01; return t; })();

/** How far the part has appeared, 0..1, never decreasing: 0 before frame `at`, 1 once settled. */
export const revealProgress = (frame: number, at: number, effect: Effect): number => {
  const t = frame - at;
  if (t <= 0) return 0;
  if (effect === 'pop') return t >= CROSS ? 1 : spring(t);
  const u = Math.min(1, t / REVEAL_FRAMES);
  return 1 - Math.pow(1 - u, 3);
};

/** Scale of a popping part: grows from 0.8 with a little overshoot (1 for the other effects). */
export const popScale = (frame: number, at: number, effect: Effect): number => (effect === 'pop' ? 0.8 + 0.2 * spring(frame - at) : 1);
