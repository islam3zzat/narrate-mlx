// Per-visual-type annotation layouts for the whiteboard layout. Each builder turns a visual + narration timing into timed Items.
// Geometry comes from item counts and measured text widths (never from fixed pixel rows), and emphasis (underlines,
// circles, highlights) is derived from the content plus the words the narrator actually says: nothing here is
// specific to one script. Content area: x 110..1810, y 230..950 (heading above, subtitle below).
import constants from '../constants.json';
import {normWord} from '../words';
import type {Scene, Visual} from '../types';
import {BLUE, Board, DIM, GREEN, INK, RED, YELLOW, clampLines, fitLines, fitSize, measure, wrapText, type Item} from '../sdk/annotate';

export type Ctx = Pick<Scene, 'narration' | 'leadFrames' | 'revealSec' | 'words' | 'sentences' | 'durationSec' | 'frames'>;
const FPS = constants.fps;
const COLORS = [BLUE, RED, GREEN];
const LEFT = 110, RIGHT = 1810, WIDTH = RIGHT - LEFT, BOTTOM = 950;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Frame of the first spoken word at or after word index `from` that shares `key`'s first 5 letters (a cheap stem match); null if never spoken. */
const wordHit = (c: Ctx, key: string, from = 0): {frame: number; i: number} | null => {
  const k = normWord(key).slice(0, 5);
  if (!k || !c.words) return null;
  for (let i = from; i < c.words.length; i++) {
    if (normWord(c.words[i].w).startsWith(k)) return {frame: c.leadFrames + Math.round(c.words[i].start * FPS), i};
  }
  return null;
};
const secF = (c: Ctx, s: number) => c.leadFrames + Math.round(s * FPS);
const revealF = (c: Ctx, i: number, n: number): number =>
  c.revealSec?.[i] !== undefined ? secF(c, c.revealSec[i]) : c.leadFrames + Math.round((i / Math.max(n, 1)) * c.durationSec * FPS * 0.8);

/**
 * The word of `text` worth marking: the longest word (4+ letters) that the narrator says, else null. `before` is the
 * text in front of it (to measure its x offset) and `frame` is when it is spoken.
 */
const spokenKeyword = (c: Ctx, text: string): {before: string; word: string; frame: number} | null => {
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

const heading = (b: Board, text: string, c: Ctx) => {
  const f = fitLines(text, 66, WIDTH - 100, 700, 40);
  const t = b.text(f.lines[0], LEFT, 135, f.size, INK, c.leadFrames, {weight: 700});
  b.underline(t.x0, t.x1, 162, YELLOW, t.end, 16);
  return t.end;
};

const title = (v: Extract<Visual, {type: 'title'}>, c: Ctx, b: Board) => {
  const kf = fitLines(v.kicker.toUpperCase(), 40, 1500, 400, 26);
  const k = b.text(kf.lines[0], 160, 400, kf.size, BLUE, c.leadFrames);
  const maxW = 1600;
  let size = fitSize(v.headline, 150, maxW, 700, 100);
  const lines = measure(v.headline, size, 700) <= maxW ? [v.headline] : clampLines(wrapText(v.headline, (size = 100), maxW, 700), 3, size, maxW, 700);
  const y0 = 560 - (lines.length - 1) * size * 0.55;
  let at = k.end + 4, last = {end: at, x0: 160, x1: 160};
  lines.forEach((ln, i) => {
    last = b.text(ln, 160, y0 + i * size * 1.1, size, INK, at, {weight: 700, dur: Math.round(44 / lines.length)});
    at = last.end;
    const kw = spokenKeyword(c, ln);
    if (kw) {
      const x0 = last.x0 + measure(kw.before, size, 700);
      b.highlight(x0, x0 + measure(kw.word, size, 700), y0 + i * size * 1.1 + 40, Math.round(size * 0.27), Math.max(kw.frame - 6, last.end), YELLOW);
    }
  });
  const yEnd = y0 + (lines.length - 1) * size * 1.1;
  const s2 = c.sentences?.[1] ? secF(c, c.sentences[1].start) : last.end + 40;
  const subSize = fitSize(v.sub, 64, 1500, 400, 44);
  const subLines = clampLines(wrapText(v.sub, subSize, 1500), 2, subSize, 1500);
  let sat = Math.max(s2, last.end + 20);
  subLines.forEach((ln, i) => {
    const y = yEnd + 160 + i * subSize * 1.2;
    const s = b.text(ln, 160, y, subSize, DIM, sat);
    sat = s.end;
    const kw = spokenKeyword(c, ln);
    if (kw) {
      const x0 = s.x0 + measure(kw.before, subSize), w = measure(kw.word, subSize);
      b.circle(x0 + w / 2, y - 20, w / 2 + 24, 54, RED, Math.max(kw.frame, s.end), 22);
    }
  });
};

const flow = (v: Extract<Visual, {type: 'flow'}>, c: Ctx, b: Board) => {
  heading(b, v.heading, c);
  const n = v.nodes.length;
  const bw = Math.min(440, (WIDTH - (n - 1) * 120) / n);
  const gap = n > 1 ? (WIDTH - n * bw) / (n - 1) : 0;
  const x00 = n > 1 ? LEFT : LEFT + (WIDTH - bw) / 2;
  const subSize = bw < 330 ? 28 : 34, lineH = subSize * 1.25;
  const subs = v.nodes.map((nd) => (nd.sub ? clampLines(wrapText(nd.sub, subSize, bw - 40), 3, subSize, bw - 40) : []));
  const labels = v.nodes.map((nd) => fitLines(nd.label, 62, bw - 40, 700, 30, 2));
  const extra = Math.max(...labels.map((l) => (l.lines.length - 1) * l.size * 1.05));
  const bh = Math.max(230, 160 + extra + (Math.max(0, ...subs.map((s) => s.length - 1))) * lineH + 55), cy = 560, top = cy - bh / 2;
  v.nodes.forEach((nd, i) => {
    const t0 = revealF(c, i, n);
    const x = x00 + i * (bw + gap), col = COLORS[i % 3];
    if (i > 0) b.arrow([x - gap + 20, cy], [x - 24, cy], INK, t0 - 22, i % 2 ? -26 : 26, 18);
    b.rect(x, top, bw, bh, col, t0);
    const lab = labels[i];
    let l = {end: t0 + 8, x0: 0, x1: 0}, at = t0 + 8;
    lab.lines.forEach((ln, k) => { l = b.text(ln, x + bw / 2, top + 100 + k * lab.size * 1.05, lab.size, INK, at, {anchor: 'middle', weight: 700}); at = l.end; });
    b.underline(l.x0, l.x1, top + 118 + (lab.lines.length - 1) * lab.size * 1.05, col, l.end, 10);
    const next = i + 1 < n ? revealF(c, i + 1, n) : t0 + 150;
    subs[i].forEach((ln, j) => b.text(ln, x + bw / 2, top + 170 + extra + j * lineH, subSize, DIM, l.end + 12 + j * 18, {anchor: 'middle', dur: Math.min(60, Math.max(14, next - t0 - 50))}));
  });
};

const bullets = (v: Extract<Visual, {type: 'bullets'}>, c: Ctx, b: Board) => {
  heading(b, v.heading, c);
  const n = v.items.length;
  const pitch = Math.min(150, (BOTTOM - 320) / n);
  const size = clamp(Math.round(pitch * 0.5), 34, 60);
  v.items.forEach((t, i) => {
    const y = 340 + i * pitch, col = COLORS[i % 3];
    const t0 = revealF(c, i, n);
    b.circle(170, y - size * 0.3, 9, 9, col, t0, 8);
    const f = fitLines(t, size, RIGHT - 250, 400, 30);
    const tx = b.text(f.lines[0], 230, y, f.size, INK, t0 + 6);
    const kw = spokenKeyword(c, f.lines[0]);
    if (kw) {
      const x0 = tx.x0 + measure(kw.before, f.size);
      b.underline(x0, x0 + measure(kw.word, f.size), y + 10, col, Math.max(kw.frame, tx.end), 10);
    }
  });
};

const steps = (v: Extract<Visual, {type: 'steps'}>, c: Ctx, b: Board) => {
  heading(b, v.heading, c);
  const n = v.items.length;
  const pitch = Math.min(200, (BOTTOM - 300) / Math.max(n, 1));
  const size = clamp(Math.round(pitch * 0.45), 34, 62), r = Math.round(size * 0.74);
  v.items.forEach((t, i) => {
    const y = 360 + i * pitch;
    const follow = v.active === undefined;
    const t0 = follow ? revealF(c, i, n) : c.leadFrames + 20 + i * 22;
    const isActive = v.active === i, done = v.active !== undefined && i < v.active;
    const lit = isActive || follow;
    const tf = fitLines(t, size, 1380, isActive ? 700 : 400, 30);
    const tx = b.text(tf.lines[0], 300, y, tf.size, lit ? INK : DIM, t0 + 8, {weight: isActive ? 700 : 400});
    b.circle(200, y - size * 0.35, r, r, lit ? BLUE : DIM, t0, 16);
    b.text(String(i + 1), 200, y, Math.round(size * 0.84), lit ? BLUE : DIM, t0 + 4, {anchor: 'middle', dur: 6});
    if (done) b.check(Math.min(tx.x1 + 40, 1800), y - 10, Math.round(size * 0.74), GREEN, tx.end + 4);
    if (isActive) {
      const hl = Math.max(tx.end + 4, c.revealSec?.[i] !== undefined ? secF(c, c.revealSec[i]) : 0);
      b.highlight(300, tx.x1, y - size * 0.13, Math.round(size * 0.97), hl, YELLOW);
      const a0 = Math.min(tx.x1 + 190, 1860);
      b.arrow([a0, y - 6], [a0 - 146, y - 18], RED, hl + 4, 30, 16);
    }
  });
};

const fanout = (v: Extract<Visual, {type: 'fanout'}>, c: Ctx, b: Board) => {
  heading(b, v.heading, c);
  const n = v.targets.length, cy = 590;
  const pitch = Math.min(270, 720 / n), boxH = pitch - 55;
  const s0 = c.leadFrames + 6;
  b.rect(LEFT, cy - 110, 420, 220, BLUE, s0);
  const sf = fitLines(v.source.label, 64, 380, 700, 32);
  const sl = b.text(sf.lines[0], 320, cy + 20, sf.size, INK, s0 + 8, {anchor: 'middle', weight: 700});
  b.underline(sl.x0, sl.x1, cy + 38, BLUE, sl.end, 10);
  const labelSize = clamp(Math.round(boxH * 0.4), 30, 62), subSize = clamp(Math.round(boxH * 0.24), 22, 38);
  v.targets.forEach((t, i) => {
    const ty = cy + (i - (n - 1) / 2) * pitch;
    const t0 = revealF(c, i, n);
    const col = COLORS[(i + 1) % 3];
    b.arrow([550, cy + (ty - cy) * 0.15], [980, ty], INK, t0 - 24, (ty < cy ? -1 : 1) * 40 * (n > 1 ? 1 : 0), 22);
    b.rect(1000, ty - boxH / 2, 800, boxH, col, t0);
    const lf = fitLines(t.label, labelSize, 720, 700, 26);
    const l = b.text(lf.lines[0], 1040, ty - boxH * 0.07, lf.size, INK, t0 + 8, {weight: 700});
    const sf2 = fitLines(t.sub, subSize, 720, 400, 20);
    b.text(sf2.lines[0], 1040, ty + boxH * 0.28, sf2.size, DIM, l.end + 4, {dur: 26});
  });
};

/** Returns false when the columns are too tall to draw legibly (the caller then falls back to the normal view). */
const compare = (v: Extract<Visual, {type: 'compare'}>, c: Ctx, b: Board): boolean => {
  const MIN = 24;
  const wrap = (size: number, textW: number) => v.columns.map((col) => col.items.map((it) => clampLines(wrapText(it, size, textW - 44), 3, size, textW - 44)));
  const tall = (size: number, textW: number) => Math.max(...wrap(size, textW).map((items) => items.reduce((h, ls) => h + ls.length * size * 1.22 + size * 0.9, 0)));
  if (540 + tall(MIN, WIDTH / v.columns.length - 100) > BOTTOM) return false;
  heading(b, v.heading, c);
  const n = v.columns.length;
  const colW = WIDTH / n, textW = colW - 100;
  for (let i = 1; i < n; i++) {
    const d = LEFT + i * colW - 10;
    b.stroke([[d, 250], [d - 2, 480], [d + 2, 700], [d, 900]], DIM, 4, c.leadFrames + 10, 40, 0.6);
  }
  const endF = c.leadFrames + Math.round(c.durationSec * FPS) - 20;
  // body text size: start from the column count, shrink until the tallest column fits above BOTTOM
  let size = n === 2 ? 46 : n === 3 ? 40 : 34;
  while (size > MIN && 540 + tall(size, textW) > BOTTOM) size -= 2;
  const all = wrap(size, textW);
  v.columns.forEach((col, i) => {
    const x = LEFT + i * colW + (i ? 40 : 0), color = COLORS[i % 3];
    const t0 = revealF(c, i, n);
    const nextT = i + 1 < n ? revealF(c, i + 1, n) : endF;
    const tf = fitLines(col.title, 66, textW, 700, 36);
    const t = b.text(tf.lines[0], x, 340, tf.size, INK, t0, {weight: 700});
    b.underline(t.x0, t.x1, 366, color, t.end, 12);
    const gf = fitLines(col.tag, 40, textW, 400, 26);
    const tg = b.text(gf.lines[0], x, 430, gf.size, color, t.end + 8);
    const m = col.items.length;
    const span = Math.max(30, nextT - tg.end - 12);
    let y = 540;
    all[i].forEach((ls, j) => {
      const ti = tg.end + 12 + Math.round((j / m) * span);
      b.text('-', x, y, size + 10, color, ti, {dur: 4});
      const dur = Math.min(40, Math.max(14, Math.round(span / m) - 4));
      ls.forEach((ln, k) => b.text(ln, x + 44, y + k * size * 1.22, size, INK, ti + 3 + k * 6, {dur}));
      y += ls.length * size * 1.22 + size * 0.9;
    });
  });
  return true;
};

const callout = (v: Extract<Visual, {type: 'callout'}>, c: Ctx, b: Board) => {
  const warn = v.tone === 'warn';
  const hf = fitLines(v.heading.toUpperCase(), 48, 1400, 400, 28);
  const h = b.text(hf.lines[0], 160, 190, hf.size, warn ? RED : BLUE, c.leadFrames);
  b.circle((h.x0 + h.x1) / 2, 172, (h.x1 - h.x0) / 2 + 46, 48, warn ? RED : BLUE, h.end, 20);
  // the big message: split on commas when it has them (one beat per clause), else wrap
  const detailSize = 56, detailLinesFor = (sz: number) => clampLines(wrapText(v.text, sz, 1500), 4, sz, 1500);
  const rough = (v.big.includes(',') ? v.big.split(/,\s*/).map((s, i, a) => (i < a.length - 1 ? `${s},` : s)) : wrapText(v.big, 120, 1500, 700)).slice(0, 5);
  const avail = BOTTOM - 400 - (detailLinesFor(detailSize).length * 66 + 40);
  const pitch = clamp(avail / rough.length, 70, 160), size = Math.round(pitch * 0.75);
  const parts = v.big.includes(',') ? rough : clampLines(wrapText(v.big, size, 1500, 700), 5, size, 1500, 700);
  const bigSize = Math.min(size, ...parts.map((ln) => fitSize(ln, size, 1500, 700, 40)));
  parts.forEach((ln, i) => {
    const y = 400 + i * pitch;
    const t0 = c.leadFrames + 24 + i * 6;
    const bare = ln.replace(/,$/, '');
    const hit = wordHit(c, bare.split(' ')[0]) ?? wordHit(c, bare.split(' ').slice(-1)[0]) ?? {frame: c.leadFrames + 40 + i * 50, i: 0};
    const tx = b.text(ellipsizeTo(ln, bigSize), 160, y, bigSize, INK, Math.max(t0, Math.min(hit.frame - 4, t0 + 30 * i)), {weight: 700, dur: 28});
    b.underline(tx.x0, tx.x1 - (ln.endsWith(',') ? bigSize * 0.25 : 0), y + bigSize * 0.2, COLORS[i % 3], Math.max(tx.end, hit.frame), 14);
  });
  // detail text follows the narration's second sentence when there is one, else the end of the big message
  const lastEnd = c.leadFrames + 24 + parts.length * 30 + 30;
  const detailAt = c.sentences?.[1] ? secF(c, c.sentences[1].start) : lastEnd;
  detailLinesFor(detailSize).forEach((ln, j) => b.text(ln, 160, 400 + parts.length * pitch + 40 + j * 66, detailSize, DIM, detailAt + j * 20));
};

const ellipsizeTo = (ln: string, size: number) => clampLines([ln], 1, size, 1500, 700)[0];

/** Frames at the end of a scene kept free for the eraser wipe (10) plus a margin. */
const WIPE_MARGIN = 14;

/**
 * Items are timed from the narration, so the last ones can start late and their fixed draw times then run past the
 * end of the scene (text frozen half-written). Squeeze only those late items to finish before the wipe; earlier
 * items keep their narration-synced timing. Very short scenes end up drawn fast, never cut off.
 */
const fitToScene = (items: Item[], frames: number): Item[] => {
  const deadline = frames - WIPE_MARGIN;
  for (const it of items) {
    it.t0 = Math.min(it.t0, deadline - 4);
    it.dur = Math.max(4, Math.min(it.dur, deadline - it.t0));
  }
  return items;
};

export const buildBoard = (visual: Visual, c: Ctx, seed: number): Item[] | null => {
  const b = new Board(seed);
  switch (visual.type) {
    case 'title': title(visual, c, b); break;
    case 'bullets': bullets(visual, c, b); break;
    case 'flow': flow(visual, c, b); break;
    case 'steps': steps(visual, c, b); break;
    case 'fanout': fanout(visual, c, b); break;
    case 'compare': if (!compare(visual, c, b)) return null; break;
    case 'callout': callout(visual, c, b); break;
    default: return null;
  }
  return fitToScene(b.items, c.frames);
};
