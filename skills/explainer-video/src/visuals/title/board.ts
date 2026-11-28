// Whiteboard drawing of the `title` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {BLUE, Board, DIM, INK, RED, YELLOW, clampLines, fitLines, fitSize, measure, wrapText} from '../../sdk/annotate';
import {secF, spokenKeyword, type BoardCtx} from '../../sdk/board-kit';

export const board = (v: Extract<Visual, {type: 'title'}>, c: BoardCtx, b: Board): boolean => {
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
  return true;
};

