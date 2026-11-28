// Whiteboard drawing of the `callout` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {BLUE, Board, DIM, INK, RED, clampLines, fitLines, fitSize, wrapText} from '../../sdk/annotate';
import {BOTTOM, COLORS, clamp, wordHit, secF, type BoardCtx} from '../../sdk/board-kit';

const ellipsizeTo = (ln: string, size: number) => clampLines([ln], 1, size, 1500, 700)[0];

export const board = (v: Extract<Visual, {type: 'callout'}>, c: BoardCtx, b: Board): boolean => {
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
  return true;
};

