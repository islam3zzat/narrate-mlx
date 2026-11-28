// Whiteboard drawing of the `flow` visual: timed hand-drawn Items from the content and the narration (see sdk/board-kit.ts).
import type {Visual} from '../../types';
import {Board, DIM, INK, clampLines, fitLines, wrapText} from '../../sdk/annotate';
import {LEFT, WIDTH, COLORS, layoutOf, revealF, heading, type BoardCtx} from '../../sdk/board-kit';

export const board = (v: Extract<Visual, {type: 'flow'}>, c: BoardCtx, b: Board): boolean => {
  heading(b, v.heading, c);
  const n = v.nodes.length;
  const all = layoutOf(c, v), nl = Math.max(...all.map((x) => x.nodes.length)), nodes = all.flatMap((x) => x.nodes);
  const bw = Math.min(440, (WIDTH - (nl - 1) * 120) / nl);
  const gap = nl > 1 ? (WIDTH - nl * bw) / (nl - 1) : 0;
  const x00 = nl > 1 ? LEFT : LEFT + (WIDTH - bw) / 2;
  const subSize = bw < 330 ? 28 : 34, lineH = subSize * 1.25;
  const subsOf = (nd: {sub?: string}) => (nd.sub ? clampLines(wrapText(nd.sub, subSize, bw - 40), 3, subSize, bw - 40) : []);
  const labelOf = (nd: {label: string}) => fitLines(nd.label, 62, bw - 40, 700, 30, 2);
  const subs = v.nodes.map(subsOf);
  const labels = v.nodes.map(labelOf);
  // box geometry over the whole continued run (just this scene's nodes when it is not continued)
  const extra = Math.max(...nodes.map((nd) => { const l = labelOf(nd); return (l.lines.length - 1) * l.size * 1.05; }));
  const bh = Math.max(230, 160 + extra + (Math.max(0, ...nodes.map((nd) => subsOf(nd).length - 1))) * lineH + 55), cy = 560, top = cy - bh / 2;
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
  return true;
};

