// Bounding boxes of parsed nodes in viewBox units (for the focus camera and the pop's centre). Pure.
import type {SvgNode, Transform} from './parse';
import {SIZE_PX} from './style';

export type Box = {x0: number; y0: number; x1: number; y1: number};
type Pt = [number, number];

const applyTf = (p: Pt, tf: Transform[] | undefined): Pt => {
  let [x, y] = p;
  // SVG applies a transform list right to left to a point
  for (let i = (tf?.length ?? 0) - 1; i >= 0; i--) {
    const {fn, args} = tf![i];
    if (fn === 'translate') { x += args[0]; y += args[1] ?? 0; }
    else if (fn === 'scale') { x *= args[0]; y *= args[1] ?? args[0]; }
    else {
      const a = (args[0] * Math.PI) / 180, cx = args[1] ?? 0, cy = args[2] ?? 0;
      const dx = x - cx, dy = y - cy;
      x = cx + dx * Math.cos(a) - dy * Math.sin(a);
      y = cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
  }
  return [x, y];
};

const nums = (s: string) => s.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) ?? [];

/** End points and control points of a path (arcs: end points only): a box that holds the curve. */
export const pathPoints = (d: string): Pt[] => {
  const out: Pt[] = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const seg of d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g) ?? []) {
    const c = seg[0], rel = c === c.toLowerCase(), a = nums(seg.slice(1));
    const k = {m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0}[c.toLowerCase() as 'm'] ?? 0;
    if (c.toLowerCase() === 'z') { x = sx; y = sy; continue; }
    for (let i = 0; k && i + k <= a.length; i += k) {
      const s = a.slice(i, i + k);
      const ox = rel ? x : 0, oy = rel ? y : 0;
      const l = c.toLowerCase();
      if (l === 'h') { x = ox + s[0]; out.push([x, y]); }
      else if (l === 'v') { y = oy + s[0]; out.push([x, y]); }
      else if (l === 'a') { x = ox + s[5]; y = oy + s[6]; out.push([x, y]); }
      else {
        for (let j = 0; j + 1 < s.length; j += 2) out.push([ox + s[j], oy + s[j + 1]]);
        x = ox + s[k - 2]; y = oy + s[k - 1];
      }
      if (l === 'm' && i === 0) { sx = x; sy = y; }
    }
  }
  return out;
};

const own = (n: SvgNode, scale: number): Pt[] => {
  const a = n.attrs, num = (k: string) => Number(a[k] ?? 0);
  switch (n.tag) {
    case 'rect': return [[num('x'), num('y')], [num('x') + num('width'), num('y') + num('height')]];
    case 'circle': return [[num('cx') - num('r'), num('cy') - num('r')], [num('cx') + num('r'), num('cy') + num('r')]];
    case 'ellipse': return [[num('cx') - num('rx'), num('cy') - num('ry')], [num('cx') + num('rx'), num('cy') + num('ry')]];
    case 'line': return [[num('x1'), num('y1')], [num('x2'), num('y2')]];
    case 'polyline': case 'polygon': { const v = nums(String(a.points)); const p: Pt[] = []; for (let i = 0; i + 1 < v.length; i += 2) p.push([v[i], v[i + 1]]); return p; }
    case 'path': return pathPoints(String(a.d));
    case 'text': {
      // an estimate: 0.6 em per character, one line
      const chars = flatText(n).length;
      const px = SIZE_PX[String(a.size) as keyof typeof SIZE_PX] ?? SIZE_PX.body;
      const w = (chars * px * 0.6) / scale, h = px / scale;
      const x = num('x'), y = num('y'), anchor = a['text-anchor'];
      const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      return [[x0, y - h * 0.8], [x0 + w, y + h * 0.25]];
    }
    default: return [];
  }
};
const flatText = (n: SvgNode): string => (n.tag === '#text' ? n.text ?? '' : n.children.map(flatText).join(''));

/** Box of a node and everything inside it, with transforms applied, or null when it draws nothing. `scale` converts text pixels to viewBox units. */
export const boxOf = (n: SvgNode, scale: number): Box | null => {
  let pts: Pt[];
  if (n.tag === 'g') {
    pts = n.children.flatMap((c) => { const b = boxOf(c, scale); return b ? [[b.x0, b.y0], [b.x1, b.y1]] as Pt[] : []; });
  } else pts = own(n, scale);
  if (!pts.length) return null;
  // the corners of the box, so a rotation widens it
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const corners = n.tag === 'path' || n.tag === 'polyline' || n.tag === 'polygon' || n.tag === 'line' ? pts : ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[]);
  const t = corners.map((p) => applyTf(p, n.tf));
  return {x0: Math.min(...t.map((p) => p[0])), y0: Math.min(...t.map((p) => p[1])), x1: Math.max(...t.map((p) => p[0])), y1: Math.max(...t.map((p) => p[1]))};
};
