// Whiteboard drawing of the `notes` visual: the heading and the notes as timed hand-drawn lines, each marked with the pen-drawn
// bust of the speaker it belongs to (or a dot when it is nobody's). Carried notes (a continued scene) are drawn finished, in place.
import type {Visual} from '../../types';
import {CARRIED} from '../../semantics/carry';
import {Board, INK, fitLines, measure} from '../../sdk/annotate';
import {distinctIds, speakerById} from '../../speakers';
import {BOTTOM, COLORS, RIGHT, boardAvatar, clamp, heading, isCarried, layoutOf, revealF, speakerColor, spokenKeyword, type BoardCtx} from '../../sdk/board-kit';

export const board = (v: Extract<Visual, {type: 'notes'}>, c: BoardCtx, b: Board): boolean => {
  heading(b, v.heading, c);
  const n = v.items.length;
  const all = layoutOf(c, v);
  const order = distinctIds(all.flatMap((x) => x.items.flatMap((i) => (i.by ? [i.by] : []))));
  const pitch = Math.min(150, (BOTTOM - 320) / Math.max(...all.map((x) => x.items.length)));
  const size = clamp(Math.round(pitch * 0.5), 34, 60), px = clamp(Math.round(pitch * 0.8), 46, 84);
  v.items.forEach((it, i) => {
    const y = 340 + i * pitch;
    const t0 = revealF(c, i, n);
    const carried = isCarried(c, i);
    const sp = it.by ? speakerById(c.speakers, it.by, order) : undefined;
    const col = sp ? speakerColor(sp.index) : COLORS[i % 3];
    if (sp) boardAvatar(b, sp, 130, y - size * 0.3 - px / 2, px, t0);
    else b.circle(170, y - size * 0.3, 9, 9, col, t0, 8);
    const f = fitLines(it.text, size, RIGHT - 270, 400, 30);
    const tx = b.text(f.lines[0], 250, y, f.size, INK, t0 + 6);
    // the underline belongs to the scene that first wrote the note (its narration said the word), so a carried note keeps it
    const kw = spokenKeyword(carried ? c.origin?.[i] ?? c : c, f.lines[0]);
    if (kw) {
      const x0 = tx.x0 + measure(kw.before, f.size);
      b.underline(x0, x0 + measure(kw.word, f.size), y + 10, col, carried ? CARRIED : Math.max(kw.frame, tx.end), 10);
    }
  });
  return true;
};
