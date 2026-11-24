// Pure geometry & phase-weight logic for `cancellation-grid` (no React/Remotion).
import type {Visual} from '../../types';
import {stageProgress} from '../plot-kit';

export type CancellationV = Extract<Visual, {type: 'cancellation-grid'}>;
export type Phase = CancellationV['stages'][number]['phase'];

export type PhaseWeights = {
  cellsIn: number;
  interiorHighlight: number;
  interiorCancel: number;
  boundarySpotlight: number;
  activePhase: Phase;
  activeNote?: string;
};

export function phaseWeights(
  frame: number,
  stageStarts: readonly number[],
  stages: CancellationV['stages'],
): PhaseWeights {
  let cellsIn = 0;
  let interiorHighlight = 0;
  let interiorCancel = 0;
  let boundarySpotlight = 0;
  let activePhase: Phase = stages[0]?.phase ?? 'cells';
  let activeNote: string | undefined;

  for (let i = 0; i < stages.length; i++) {
    const p = stageProgress(frame, stageStarts[i], 20);
    if (p <= 0) break;
    const st = stages[i];
    activePhase = st.phase;
    activeNote = st.note;
    if (st.phase === 'cells') {
      cellsIn = Math.max(cellsIn, p);
    } else if (st.phase === 'interior') {
      cellsIn = 1;
      interiorHighlight = Math.max(interiorHighlight, p);
    } else if (st.phase === 'cancel') {
      cellsIn = 1;
      interiorHighlight = 1;
      interiorCancel = Math.max(interiorCancel, p);
    } else if (st.phase === 'boundary') {
      cellsIn = 1;
      interiorHighlight = 1;
      interiorCancel = 1;
      boundarySpotlight = Math.max(boundarySpotlight, p);
    }
  }
  return {cellsIn, interiorHighlight, interiorCancel, boundarySpotlight, activePhase, activeNote};
}

export type DirectedEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'interior' | 'boundary';
  pairSign: 1 | -1; // differentiates the two opposing members on an interior seam
};

export type Cell2D = {
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  edges: DirectedEdge[];
};

export function build2DGrid(
  theorem: 'curl-2d' | 'divergence-2d',
  cols: number,
  rows: number,
  box: {x: number; y: number; w: number; h: number},
): {cells: Cell2D[]; outerLoop: DirectedEdge[]} {
  const cw = box.w / cols;
  const ch = box.h / rows;
  const pad = Math.min(cw, ch) * 0.085;
  const cells: Cell2D[] = [];
  const outerLoop: DirectedEdge[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = box.x + c * cw;
      const cy = box.y + r * ch;
      const x0 = cx + pad;
      const x1 = cx + cw - pad;
      const y0 = cy + pad;
      const y1 = cy + ch - pad;
      const mx = (x0 + x1) * 0.5;
      const my = (y0 + y1) * 0.5;
      const edges: DirectedEdge[] = [];

      if (theorem === 'curl-2d') {
        // CCW around cell: bottom (L->R), right (B->T), top (R->L), left (T->B)
        edges.push({x1: x0 + 8, y1: y1, x2: x1 - 8, y2: y1, kind: r === rows - 1 ? 'boundary' : 'interior', pairSign: 1});
        edges.push({x1: x1, y1: y1 - 8, x2: x1, y2: y0 + 8, kind: c === cols - 1 ? 'boundary' : 'interior', pairSign: 1});
        edges.push({x1: x1 - 8, y1: y0, x2: x0 + 8, y2: y0, kind: r === 0 ? 'boundary' : 'interior', pairSign: -1});
        edges.push({x1: x0, y1: y0 + 8, x2: x0, y2: y1 - 8, kind: c === 0 ? 'boundary' : 'interior', pairSign: -1});
      } else {
        // Outward normal arrows from the 4 walls
        const len = Math.min(cw, ch) * 0.24;
        edges.push({x1: mx, y1: y0 + 6, x2: mx, y2: y0 - len * 0.55, kind: r === 0 ? 'boundary' : 'interior', pairSign: 1});
        edges.push({x1: x1 - 6, y1: my, x2: x1 + len * 0.55, y2: my, kind: c === cols - 1 ? 'boundary' : 'interior', pairSign: 1});
        edges.push({x1: mx, y1: y1 - 6, x2: mx, y2: y1 + len * 0.55, kind: r === rows - 1 ? 'boundary' : 'interior', pairSign: -1});
        edges.push({x1: x0 + 6, y1: my, x2: x0 - len * 0.55, y2: my, kind: c === 0 ? 'boundary' : 'interior', pairSign: -1});
      }
      cells.push({col: c, row: r, x: cx, y: cy, w: cw, h: ch, edges});
    }
  }

  // Outer perimeter highlight paths
  if (theorem === 'curl-2d') {
    outerLoop.push({x1: box.x, y1: box.y + box.h, x2: box.x + box.w, y2: box.y + box.h, kind: 'boundary', pairSign: 1});
    outerLoop.push({x1: box.x + box.w, y1: box.y + box.h, x2: box.x + box.w, y2: box.y, kind: 'boundary', pairSign: 1});
    outerLoop.push({x1: box.x + box.w, y1: box.y, x2: box.x, y2: box.y, kind: 'boundary', pairSign: 1});
    outerLoop.push({x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.h, kind: 'boundary', pairSign: 1});
  }
  return {cells, outerLoop};
}

export type IsoFace = {
  poly: [number, number][];
  arrow: {x1: number; y1: number; x2: number; y2: number};
  kind: 'interior' | 'boundary';
  pairSign: 1 | -1;
  shade: 'top' | 'left' | 'right';
};

export type IsoCube = {
  ix: number;
  iy: number;
  iz: number;
  depthKey: number;
  faces: IsoFace[];
};

/** Painter-sorted isometric 3D cells for `divergence-3d` rendered in crisp 2D SVG. */
export function buildIso3DGrid(
  cols: number,
  rows: number,
  depth: number,
  originX: number,
  originY: number,
  unit: number,
): IsoCube[] {
  const cos30 = 0.8660254;
  const sin30 = 0.5;
  const iso = (x: number, y: number, z: number): [number, number] => [
    originX + (x - y) * unit * cos30,
    originY + (x + y) * unit * sin30 - z * unit,
  ];

  const cubes: IsoCube[] = [];
  const gap = 0.08;
  const s = 1 - gap * 2;

  for (let ix = 0; ix < cols; ix++) {
    for (let iy = 0; iy < rows; iy++) {
      for (let iz = 0; iz < depth; iz++) {
        const x0 = ix + gap, x1 = x0 + s;
        const y0 = iy + gap, y1 = y0 + s;
        const z0 = iz + gap, z1 = z0 + s;

        const cTop = iso((x0 + x1) * 0.5, (y0 + y1) * 0.5, z1);
        const cTopTip = iso((x0 + x1) * 0.5, (y0 + y1) * 0.5, z1 + 0.42);
        const cFrontX = iso(x1, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
        const cFrontXTip = iso(x1 + 0.42, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
        const cFrontY = iso((x0 + x1) * 0.5, y1, (z0 + z1) * 0.5);
        const cFrontYTip = iso((x0 + x1) * 0.5, y1 + 0.42, (z0 + z1) * 0.5);

        const faces: IsoFace[] = [
          // Top face (+z)
          {
            poly: [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)],
            arrow: {x1: cTop[0], y1: cTop[1], x2: cTopTip[0], y2: cTopTip[1]},
            kind: iz === depth - 1 ? 'boundary' : 'interior',
            pairSign: 1,
            shade: 'top',
          },
          // Right-front face (+x)
          {
            poly: [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)],
            arrow: {x1: cFrontX[0], y1: cFrontX[1], x2: cFrontXTip[0], y2: cFrontXTip[1]},
            kind: ix === cols - 1 ? 'boundary' : 'interior',
            pairSign: 1,
            shade: 'right',
          },
          // Left-front face (+y)
          {
            poly: [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)],
            arrow: {x1: cFrontY[0], y1: cFrontY[1], x2: cFrontYTip[0], y2: cFrontYTip[1]},
            kind: iy === rows - 1 ? 'boundary' : 'interior',
            pairSign: -1,
            shade: 'left',
          },
        ];

        // Hidden back/bottom faces still contribute interior/boundary arrows when visible through cancelled cubes
        if (ix === 0) {
          const p0 = iso(x0, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
          const p1 = iso(x0 - 0.42, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
          faces.push({
            poly: [iso(x0, y0, z0), iso(x0, y1, z0), iso(x0, y1, z1), iso(x0, y0, z1)],
            arrow: {x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1]},
            kind: 'boundary',
            pairSign: -1,
            shade: 'left',
          });
        }
        if (iy === 0) {
          const p0 = iso((x0 + x1) * 0.5, y0, (z0 + z1) * 0.5);
          const p1 = iso((x0 + x1) * 0.5, y0 - 0.42, (z0 + z1) * 0.5);
          faces.push({
            poly: [iso(x0, y0, z0), iso(x1, y0, z0), iso(x1, y0, z1), iso(x0, y0, z1)],
            arrow: {x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1]},
            kind: 'boundary',
            pairSign: 1,
            shade: 'right',
          });
        }

        cubes.push({ix, iy, iz, depthKey: ix + iy + iz * 1.05, faces});
      }
    }
  }
  return cubes.sort((a, b) => a.depthKey - b.depthKey);
}

export function theoremBadge(theorem: CancellationV['theorem']): string {
  switch (theorem) {
    case 'ftc-1d': return '∑ ΔF = F(b) − F(a)';
    case 'curl-2d': return '∬ (∇ × F) dA = ∮ F · dr';
    case 'divergence-2d': return '∬ (∇ · F) dA = ∮ F · n ds';
    case 'divergence-3d': return '∭ (∇ · F) dV = ∬ F · n dS';
  }
}
