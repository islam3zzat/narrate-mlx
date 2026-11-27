// Pure frame-activity schedule for 2D video deduplication (no React, remotion, or three).
// Identifies contiguous static holds so the browser renders every unique frame once at FPS = 30
// and FFmpeg repeats identical JPEG bytes for provably unchanged frames.
import constants from './constants.json';
import {stepActiveIntervals} from './sdk/algo-math';
import type {Scene, VideoData} from './types';

export type FrameRun = {frame: number; count: number};
export type FrameSchedule = {totalFrames: number; uniqueFrames: number; runs: FrameRun[]};

const slotAt = (i: number, n: number, lead: number, audioFrames: number, reveal?: number[]): number =>
  reveal && reveal[Math.floor(i)] !== undefined
    ? lead + Math.round(reveal[Math.floor(i)] * constants.fps)
    : lead + Math.round((i / Math.max(n, 1)) * audioFrames * 0.8);

const captionChangeFrames = (scene: Scene, audioFrames: number): number[] => {
  if (scene.sentences?.length) {
    return [0, ...scene.sentences.map((s) => scene.leadFrames + Math.round(s.start * constants.fps))];
  }
  const sentences =
    scene.narration
      .match(/[^.!?\u061F]+[.!?\u061F]+(\s|$)|[^.!?\u061F]+$/g)
      ?.map((s) => s.trim()) ?? [scene.narration];
  const total = sentences.reduce((a, s) => a + s.length, 0) || 1;
  const out: number[] = [];
  let acc = 0;
  for (const s of sentences) {
    const start = scene.leadFrames + (acc / total) * audioFrames;
    out.push(Math.floor(start), Math.ceil(start));
    acc += s.length;
  }
  return out;
};

/**
 * Scene-local inclusive [start, end] active frame intervals for a 2D scene, or `'continuous'`
 * if any part can animate on arbitrary frames (travelling dots, particles, or unverified views).
 */
export const sceneActiveIntervals = (
  scene: Scene,
  hasPrev: boolean,
  nextContinues: boolean,
): [number, number][] | 'continuous' => {
  const v = scene.visual;
  const lead = scene.leadFrames;
  const audioFrames = Math.round(scene.durationSec * constants.fps);
  const intervals: [number, number][] = [[0, 0]];

  if (!hasPrev) intervals.push([0, 8]);
  if (!nextContinues) intervals.push([Math.max(0, scene.frames - 8), scene.frames - 1]);
  for (const f of captionChangeFrames(scene, audioFrames)) intervals.push([f, f]);
  for (const e of scene.focusSec ?? []) {
    const t = lead + Math.round(e.t * constants.fps);
    intervals.push([t, t + 13]); // FOCUS_FRAMES = 12 (+1 margin)
  }

  const pushSlots = (count: number, len = 15, pre = 0) => {
    for (let i = 0; i < count; i++) {
      const t = slotAt(i, count, lead, audioFrames, scene.revealSec);
      intervals.push([t - pre, t + len]);
    }
  };

  switch (v.type) {
    case 'title':
    case 'callout':
      intervals.push([4, 27]); // prog(frame, 4, 22)
      return intervals;
    case 'bullets':
      pushSlots(v.items.length);
      return intervals;
    case 'compare':
      pushSlots(v.columns.length);
      return intervals;
    case 'table':
      pushSlots(v.rows.length);
      return intervals;
    case 'flow':
      pushSlots(v.nodes.length, 15, 4); // node at(i) and arrow at(i+1) - 4
      return intervals;
    case 'fanout':
      intervals.push([4, 19]);
      for (let i = 0; i < v.targets.length; i++) {
        const t = scene.revealSec
          ? slotAt(i, v.targets.length, lead, audioFrames, scene.revealSec)
          : slotAt(i + 0.5, v.targets.length + 0.5, lead, audioFrames);
        intervals.push([t, t + 15]);
      }
      return intervals;
    case 'steps':
      if (v.active !== undefined) intervals.push([0, 15]);
      pushSlots(v.items.length);
      return intervals;
    case 'timeline':
      intervals.push([2, 13]);
      pushSlots(v.events.length);
      return intervals;
    case 'code':
      intervals.push([2, 13]);
      pushSlots(v.highlights.length);
      return intervals;
    case 'stat':
      intervals.push([2, 13]);
      pushSlots(v.stats.length, 48); // countFrames <= 36 + chipP 10f + 2f margin
      return intervals;
    case 'figure':
      intervals.push([0, lead + 9]);
      pushSlots(v.regions?.length ?? 0, 19); // TRANSITION_FRAMES = 18
      return intervals;
    case 'mermaid':
      if (!v.build && !(scene.focusSec?.length)) {
        intervals.push([4, 23]); // static mermaid: prog(frame, 4, 18)
        return intervals;
      }
      return 'continuous';
    case 'equation':
      intervals.push([0, lead + 9], [lead, lead + 45]);
      pushSlots(v.terms.length, 45);
      return intervals;
    case 'svg':
      intervals.push([2, 13]);
      pushSlots(v.parts.length, 45);
      return intervals;
    case 'array-algo':
    case 'graph-algo':
      intervals.push(...stepActiveIntervals(v.steps.length, lead, audioFrames, scene.revealSec));
      return intervals;
    default:
      return 'continuous';
  }
};

/** Compute run-length schedule of unique frames to render in Chromium. */
export const computeFrameSchedule = (video: VideoData): FrameSchedule => {
  const total = Math.max(0, Math.floor(video.totalFrames));
  if (total === 0) return {totalFrames: 0, uniqueFrames: 0, runs: []};

  if (video.mode === '3d') {
    const runs: FrameRun[] = Array.from({length: total}, (_, frame) => ({frame, count: 1}));
    return {totalFrames: total, uniqueFrames: total, runs};
  }

  const dirty = new Uint8Array(total);
  dirty[0] = 1;
  const markRange = (a: number, b: number) => {
    const lo = Math.max(0, Math.floor(a));
    const hi = Math.min(total - 1, Math.floor(b));
    for (let f = lo; f <= hi; f++) dirty[f] = 1;
  };

  let pos = 0;
  const hasChapters = video.scenes.some((s) => s.chapter && !s.continues);
  video.scenes.forEach((sc, i) => {
    const chapter = hasChapters && sc.chapter && !sc.continues ? sc.chapter : undefined;
    if (chapter) {
      const pre = i > 0 ? constants.transitionFrames : 0;
      const chStart = pos - pre;
      pos += constants.chapterFrames - (i > 0 ? 2 * constants.transitionFrames : constants.transitionFrames);
      markRange(chStart, pos + constants.transitionFrames);
    }
    const res = sceneActiveIntervals(sc, !!sc.continues, !!video.scenes[i + 1]?.continues);
    if (res === 'continuous') {
      markRange(pos, pos + sc.frames - 1);
    } else {
      for (const [a, b] of res) {
        const lo = Math.max(0, a);
        const hi = Math.min(sc.frames - 1, b);
        if (lo <= hi) markRange(pos + lo, pos + hi);
      }
    }
    pos += sc.frames;
  });

  const runs: FrameRun[] = [];
  for (let f = 0; f < total; f++) {
    if (dirty[f] === 1 || runs.length === 0) {
      runs.push({frame: f, count: 1});
    } else {
      runs[runs.length - 1].count += 1;
    }
  }
  return {totalFrames: total, uniqueFrames: runs.length, runs};
};
