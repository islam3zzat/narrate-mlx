// Whiteboard drawing of the `bullets` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {CARRIED} from '../../semantics/carry';
import {Board, INK, fitLines, measure} from '../../sdk/annotate';
import {RIGHT, BOTTOM, COLORS, clamp, isCarried, layoutOf, revealF, spokenKeyword, heading, type BoardCtx} from '../../sdk/board-kit';

export const board = (v: Extract<Visual, {type: 'bullets'}>, c: BoardCtx, b: Board): boolean => {
  heading(b, v.heading, c);
  const n = v.items.length;
  const pitch = Math.min(150, (BOTTOM - 320) / Math.max(...layoutOf(c, v).map((x) => x.items.length)));
  const size = clamp(Math.round(pitch * 0.5), 34, 60);
  v.items.forEach((t, i) => {
    const y = 340 + i * pitch, col = COLORS[i % 3];
    const t0 = revealF(c, i, n);
    b.circle(170, y - size * 0.3, 9, 9, col, t0, 8);
    const f = fitLines(t, size, RIGHT - 250, 400, 30);
    const tx = b.text(f.lines[0], 230, y, f.size, INK, t0 + 6);
    // the underline belongs to the scene that first wrote the item (its narration said the word), so a carried item keeps it
    const carried = isCarried(c, i);
    const kw = spokenKeyword(carried ? c.origin?.[i] ?? c : c, f.lines[0]);
    if (kw) {
      const x0 = tx.x0 + measure(kw.before, f.size);
      b.underline(x0, x0 + measure(kw.word, f.size), y + 10, col, carried ? CARRIED : Math.max(kw.frame, tx.end), 10);
    }
  });
  return true;
};

