// Whiteboard drawing of the `fanout` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {BLUE, Board, DIM, INK, fitLines} from '../../sdk/annotate';
import {LEFT, COLORS, clamp, revealF, heading, type BoardCtx} from '../../sdk/board-kit';

export const board = (v: Extract<Visual, {type: 'fanout'}>, c: BoardCtx, b: Board): boolean => {
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
  return true;
};

