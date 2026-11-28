// Whiteboard drawing of the `duo` visual: the two speakers as pen-drawn busts at the bottom corners, the current speaker in full
// colour and the other faded toward the paper, the question written between them, then the optional quote (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {BLUE, Board, DIM, INK, YELLOW, clampLines, curvePts, fitSize, wrapText} from '../../sdk/annotate';
import {speakerPair} from '../../speakers';
import {BOTTOM, LEFT, RIGHT, boardAvatar, revealF, speakerColor, type BoardCtx} from '../../sdk/board-kit';

const FIGURE = 250, FADE = 0.62;

export const board = (v: Extract<Visual, {type: 'duo'}>, c: BoardCtx, b: Board): boolean => {
  const n = v.quote ? 2 : 1;
  const pair = c.speakers?.length ? speakerPair(c.speakers, []).slice(0, 2) : [{id: 'a', name: '?', role: '', index: 0}, {id: 'b', name: '?', role: '', index: 1}];
  const top = BOTTOM - 40 - FIGURE;
  pair.forEach((s, i) => {
    const lit = !c.speaker || c.speaker === s.id;
    const x = i === 0 ? LEFT + 30 : RIGHT - 30 - FIGURE;
    boardAvatar(b, s, x, top, FIGURE, c.leadFrames + i * 6, lit ? 0 : FADE);
    b.text(s.name, x + FIGURE / 2, BOTTOM + 14, 42, lit ? INK : DIM, c.leadFrames + 18 + i * 6, {anchor: 'middle', weight: 700});
    if (lit && c.speaker) {
      // two sound arcs on the side of the head that faces the middle
      const dir = i === 0 ? 1 : -1, hx = x + FIGURE * (i === 0 ? 0.82 : 0.18), hy = top + FIGURE * 0.34;
      [0, 1].forEach((k) => b.stroke(curvePts([hx + dir * (22 + k * 26), hy - 34 - k * 8], [hx + dir * (22 + k * 26), hy + 34 + k * 8], dir * -22 * (1 + k * 0.5)), speakerColor(s.index), 5, c.leadFrames + 24 + k * 4, 10));
    }
  });
  // the question, centred between the figures
  const W = RIGHT - LEFT - 2 * (FIGURE + 120), cx = (LEFT + RIGHT) / 2;
  const size0 = 76;
  let size = size0, lines = wrapText(v.question, size, W, 700);
  while (lines.length > 3 && size > 44) { size -= 4; lines = wrapText(v.question, size, W, 700); }
  lines = clampLines(lines, 3, size, W, 700);
  size = Math.min(size, ...lines.map((l) => fitSize(l, size, W, 700, 36)));
  const t0 = revealF(c, 0, n), pitch = size * 1.18, y0 = 360;
  let end = t0, x0 = cx, x1 = cx;
  lines.forEach((ln, i) => {
    const t = b.text(ln, cx, y0 + i * pitch, size, INK, i ? end : t0, {anchor: 'middle', weight: 700, dur: 26});
    end = t.end;
    x0 = i ? Math.min(x0, t.x0) : t.x0; x1 = i ? Math.max(x1, t.x1) : t.x1;
  });
  const uy = y0 + (lines.length - 1) * pitch + 22;
  b.underline(x0, x1, uy, YELLOW, end, 16);
  if (v.quote) {
    const qs = 46, ql = clampLines(wrapText(`“${v.quote}”`, qs, W), 3, qs, W);
    const q0 = Math.max(revealF(c, 1, n), end + 10), qy = uy + 120;
    ql.forEach((ln, i) => b.text(ln, cx, qy + i * qs * 1.2, qs, BLUE, i ? q0 + 20 * i : q0, {anchor: 'middle', dur: 30}));
  }
  return true;
};
