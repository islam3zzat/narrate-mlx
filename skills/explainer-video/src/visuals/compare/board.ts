// Whiteboard drawing of the `compare` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {Board, DIM, INK, clampLines, fitLines, wrapText} from '../../sdk/annotate';
import {LEFT, WIDTH, BOTTOM, COLORS, FPS, revealF, heading, type BoardCtx} from '../../sdk/board-kit';

/** Returns false when the columns are too tall to draw legibly (the caller then falls back to the normal view). */
export const board = (v: Extract<Visual, {type: 'compare'}>, c: BoardCtx, b: Board): boolean => {
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

