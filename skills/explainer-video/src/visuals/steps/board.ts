// Whiteboard drawing of the `steps` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {CARRIED} from '../../semantics/carry';
import {BLUE, Board, DIM, GREEN, INK, RED, YELLOW, fitLines} from '../../sdk/annotate';
import {BOTTOM, clamp, isCarried, layoutOf, secF, revealF, heading, type BoardCtx} from '../../sdk/board-kit';

export const board = (v: Extract<Visual, {type: 'steps'}>, c: BoardCtx, b: Board): boolean => {
  heading(b, v.heading, c);
  const n = v.items.length;
  const pitch = Math.min(200, (BOTTOM - 300) / Math.max(...layoutOf(c, v).map((x) => x.items.length), 1));
  const size = clamp(Math.round(pitch * 0.45), 34, 62), r = Math.round(size * 0.74);
  v.items.forEach((t, i) => {
    const y = 360 + i * pitch;
    const follow = v.active === undefined;
    const t0 = isCarried(c, i) ? CARRIED : follow ? revealF(c, i, n) : c.leadFrames + 20 + i * 22;
    const isActive = v.active === i, done = v.active !== undefined && i < v.active;
    const lit = isActive || follow;
    const tf = fitLines(t, size, 1380, isActive ? 700 : 400, 30);
    const tx = b.text(tf.lines[0], 300, y, tf.size, lit ? INK : DIM, t0 + 8, {weight: isActive ? 700 : 400});
    b.circle(200, y - size * 0.35, r, r, lit ? BLUE : DIM, t0, 16);
    b.text(String(i + 1), 200, y, Math.round(size * 0.84), lit ? BLUE : DIM, t0 + 4, {anchor: 'middle', dur: 6});
    if (done) b.check(Math.min(tx.x1 + 40, 1800), y - 10, Math.round(size * 0.74), GREEN, tx.end + 4);
    if (isActive) {
      const hl = Math.max(tx.end + 4, c.revealSec?.[i] !== undefined && !isCarried(c, i) ? secF(c, c.revealSec[i]) : 0);
      b.highlight(300, tx.x1, y - size * 0.13, Math.round(size * 0.97), hl, YELLOW);
      const a0 = Math.min(tx.x1 + 190, 1860);
      b.arrow([a0, y - 6], [a0 - 146, y - 18], RED, hl + 4, 30, 16);
    }
  });
  return true;
};

