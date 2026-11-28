// Whiteboard drawing of the `stance` visual: the question as the heading, a pen-drawn bust and name at the head of each speaker's
// column, and each entry as a marker, its text and a kind-coloured underline in its speaker's column, in the order spoken. An agree,
// disagree or resolve entry draws an arrow across to the entry it answers, and a resolve also draws a check mark over that entry.
// Rows are fixed slots, so carried entries (a continued scene) are drawn finished, exactly in place, and nothing glides.
import type {Visual} from '../../types';
import {CARRIED} from '../../semantics/carry';
import {Board, DIM, GREEN, INK, RED, BLUE, clampLines, fitLines, measure, polyline, wrapText} from '../../sdk/annotate';
import {distinctIds, speakerById, speakerPair} from '../../speakers';
import {BOTTOM, LEFT, RIGHT, boardAvatar, heading, isCarried, layoutOf, revealF, type BoardCtx} from '../../sdk/board-kit';
import {columnIds, placeEntries} from './layout';

const GAP = 140, COL_W = (RIGHT - LEFT - GAP) / 2, X0 = [LEFT, RIGHT - COL_W], INNER = [LEFT + COL_W + 14, RIGHT - COL_W - 14];
const MARK = 62, SIZE = 38, LINE = 44, Y0 = 448, ROWS = 4, PITCH = (BOTTOM - Y0 - 20) / ROWS;
const KIND_COLOR = {claim: BLUE, agree: GREEN, disagree: RED, resolve: GREEN} as const;

export const board = (v: Extract<Visual, {type: 'stance'}>, c: BoardCtx, b: Board): boolean => {
  heading(b, v.question, c, 172, 60);   // lower and smaller than the usual heading: the question is longer than a heading (the heading width stops short of the speaker tag, see board-kit)
  const all = layoutOf(c, v);
  const named = all.flatMap((x) => x.entries.map((e) => e.by));
  const order = distinctIds(named);
  const ids = columnIds(c.speakers, named);
  const people = (c.speakers?.length ? speakerPair(c.speakers, []) : ids.map((id) => speakerById(undefined, id, ids))).slice(0, 2);
  const placed = placeEntries(v.entries, ids);
  const n = v.entries.length + 1;
  // geometry of every entry first (the resolve entries draw over the one they settle)
  const textW = COL_W - MARK - 8;
  const geo = v.entries.map((e, i) => {
    const lines = clampLines(wrapText(e.text, SIZE, textW), 2, SIZE, textW);
    const fit = lines.map((l) => fitLines(l, SIZE, textW, 400, 28).size);
    const size = Math.min(SIZE, ...fit);
    const x = X0[placed[i].col] + MARK, y = Y0 + placed[i].row * PITCH;
    return {lines, size, x, y, col: placed[i].col, w0: measure(lines[0] ?? '', size)};
  });

  // column heads: a bust and the name, and a hand-drawn divider
  const head0 = c.carriedHead ? CARRIED : c.leadFrames;
  people.forEach((s, ci) => {
    const x = X0[ci];
    boardAvatar(b, s, x, 222, 112, head0 + ci * 6);
    b.text(s.name, x + 132, 318, 50, INK, head0 + 16 + ci * 6, {weight: 700});
  });
  b.stroke(polyline([[(LEFT + RIGHT) / 2, 235], [(LEFT + RIGHT) / 2 + 3, 560], [(LEFT + RIGHT) / 2 - 2, BOTTOM - 10]], b.nextSeed(), 2), DIM, 4, head0 + 6, 40, 0.5);

  v.entries.forEach((e, i) => {
    const g = geo[i], t0 = revealF(c, i + 1, n);
    const color = KIND_COLOR[e.kind];
    const mx = X0[g.col] + 22, my = g.y - 12;
    // the marker: a dot for a claim, a check for agree, a cross for disagree, a circled check for resolve
    if (e.kind === 'claim') b.circle(mx, my, 12, 12, color, t0, 8);
    else if (e.kind === 'agree') b.check(mx - 12, my + 2, 30, color, t0);
    else if (e.kind === 'disagree') {
      b.stroke(polyline([[mx - 13, my - 13], [mx + 13, my + 13]], b.nextSeed(), 1), color, 7, t0, 6);
      b.stroke(polyline([[mx + 13, my - 13], [mx - 13, my + 13]], b.nextSeed(), 1), color, 7, t0 + 5, 6);
    } else {
      b.circle(mx, my, 22, 22, color, t0, 10);
      b.check(mx - 12, my + 2, 24, color, t0 + 6);
    }
    let end = t0 + 8, first = {x0: g.x, x1: g.x};
    g.lines.forEach((ln, k) => {
      const tx = b.text(ln, g.x, g.y + k * LINE, g.size, INK, end);
      end = tx.end;
      if (k === 0) first = tx;
    });
    b.underline(first.x0, first.x1, g.y + 10, color, end - 6, 10);
    if (e.ref === undefined) return;
    const r = geo[e.ref];
    // an arrow across the gap to the entry it answers (entries of one column need none)
    if (r.col !== g.col) b.arrow([INNER[g.col], g.y - 14], [INNER[r.col], r.y - 14], e.kind === 'disagree' ? RED : e.kind === 'claim' ? DIM : GREEN, t0 - 6, g.col ? 26 : -26, 18);
    if (e.kind === 'resolve') {
      // the check over the settled entry, at the end of its first line
      const cx = Math.min(r.x + r.w0 + 14, X0[r.col] + COL_W - 90);
      b.check(cx, r.y - 6, 86, GREEN, isCarried(c, i + 1) ? CARRIED : end + 4);
    }
  });
  return true;
};
