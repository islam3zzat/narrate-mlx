// Pure computation helpers for graph-algo (no React or Remotion imports).
import {clamp01, formatCompactNumber, type AlgoStateTone} from '../../sdk/algo-math';
import type {GraphAlgoEdgeT, GraphAlgoNodeT, GraphAlgoVisualT} from './schema';

export type GraphViewport = {x: number; y: number; width: number; height: number};

export type GraphNodePos = {id: string; x: number; y: number; r: number};

export type EdgeGeometry = {
  path: string;
  mid: {x: number; y: number};
  pointAt: (t: number) => {x: number; y: number};
};

/** Canonical key matching `steps[].edgeStates` keys (`edge.id ?? "from->to"`). */
export const edgeKey = (e: Pick<GraphAlgoEdgeT, 'id' | 'from' | 'to'>): string => e.id ?? `${e.from}->${e.to}`;

/** Format numeric or string edge weight deterministically without Intl. */
export const formatWeight = (w: number | string): string => (typeof w === 'number' ? formatCompactNumber(w) : w);

/** Return true for tones that highlight active edge traversal/relaxation transitions. */
export const isActiveTransitionTone = (tone: AlgoStateTone): boolean =>
  tone === 'active' || tone === 'frontier' || tone === 'swap' || tone === 'sorted' || tone === 'pivot';

const computeAutoNormalizedCoords = (
  nodes: readonly GraphAlgoNodeT[],
  edges: readonly GraphAlgoEdgeT[],
  directed: boolean,
): Map<string, {nx: number; ny: number}> => {
  const n = nodes.length;
  const out = new Map<string, {nx: number; ny: number}>();
  if (n === 0) return out;

  const adj = new Map<string, string[]>();
  const undirAdj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
    undirAdj.set(node.id, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    if (!directed) adj.get(e.to)?.push(e.from);
    undirAdj.get(e.from)?.push(e.to);
    undirAdj.get(e.to)?.push(e.from);
  }

  // Deterministic BFS layering starting at nodes[0]; bridge unreachable components via undirected edges.
  const layerOf = new Map<string, number>();
  const bfsFrom = (startId: string, baseLayer: number, useUndirected: boolean) => {
    const queue: string[] = [startId];
    layerOf.set(startId, baseLayer);
    const nbrMap = useUndirected ? undirAdj : adj;
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const curL = layerOf.get(cur) ?? baseLayer;
      for (const nxt of nbrMap.get(cur) ?? []) {
        if (!layerOf.has(nxt)) {
          layerOf.set(nxt, curL + 1);
          queue.push(nxt);
        }
      }
    }
  };

  bfsFrom(nodes[0].id, 0, !directed);
  for (const node of nodes) {
    if (!layerOf.has(node.id)) {
      const maxL = Math.max(0, ...layerOf.values());
      bfsFrom(node.id, maxL + 1, true);
    }
  }

  const buckets = new Map<number, string[]>();
  for (const node of nodes) {
    const l = layerOf.get(node.id) ?? 0;
    const list = buckets.get(l) ?? [];
    list.push(node.id);
    buckets.set(l, list);
  }

  const layerKeys = [...buckets.keys()].sort((a, b) => a - b);
  const maxPerLayer = Math.max(1, ...layerKeys.map((k) => buckets.get(k)!.length));

  if (layerKeys.length >= 3 && maxPerLayer <= 4) {
    const numLayers = layerKeys.length;
    layerKeys.forEach((lk, li) => {
      const ids = buckets.get(lk)!;
      const nx = numLayers === 1 ? 0.5 : li / (numLayers - 1);
      ids.forEach((id, idx) => {
        // Gentle zigzag offset for consecutive single-node layers so multi-hop edges stay legible.
        const singleOffset = ids.length === 1 && numLayers >= 3 && li > 0 && li < numLayers - 1 ? (li % 2 === 1 ? -0.1 : 0.1) : 0;
        const ny =
          ids.length === 1
            ? 0.5 + singleOffset
            : ids.length === 2
              ? 0.18 + idx * 0.64
              : idx / (ids.length - 1);
        out.set(id, {nx, ny});
      });
    });
    return out;
  }

  // Fallback balanced ellipse for dense, cyclic, or star topologies (starting from the left).
  nodes.forEach((node, i) => {
    const angle = Math.PI + (2 * Math.PI * i) / n;
    out.set(node.id, {
      nx: clamp01(0.5 + 0.46 * Math.cos(angle)),
      ny: clamp01(0.5 + 0.44 * Math.sin(angle)),
    });
  });
  return out;
};

/** Compute pixel coordinates and radius for every graph node inside `viewport`. */
export const computeGraphLayout = (
  nodes: readonly GraphAlgoNodeT[],
  edges: readonly GraphAlgoEdgeT[],
  viewport: GraphViewport,
  directed = false,
): GraphNodePos[] => {
  const r = Math.max(28, Math.min(38, Math.round(42 - nodes.length * 1.1)));
  const padX = Math.max(88, r + 54);
  const padTop = Math.max(76, r + 42);
  const padBottom = Math.max(46, r + 14);
  const innerW = Math.max(120, viewport.width - padX * 2);
  const innerH = Math.max(100, viewport.height - padTop - padBottom);

  const needsAuto = nodes.some((n) => n.x === undefined || n.y === undefined);
  const auto = needsAuto ? computeAutoNormalizedCoords(nodes, edges, directed) : new Map<string, {nx: number; ny: number}>();

  return nodes.map((n) => {
    const fallback = auto.get(n.id) ?? {nx: 0.5, ny: 0.5};
    const nx = n.x ?? fallback.nx;
    const ny = n.y ?? fallback.ny;
    return {
      id: n.id,
      x: Math.round((viewport.x + padX + clamp01(nx) * innerW) * 10) / 10,
      y: Math.round((viewport.y + padTop + clamp01(ny) * innerH) * 10) / 10,
      r,
    };
  });
};

/** Compute shortened straight or curved SVG edge path, midpoint (for weight pill), and parametric evaluator. */
export const computeEdgeGeometry = (
  fromPos: {x: number; y: number},
  toPos: {x: number; y: number},
  nodeR: number,
  directed: boolean,
  curved = false,
): EdgeGeometry => {
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const startPad = nodeR + 4;
  const endPad = nodeR + (directed ? 13 : 4);

  if (!curved) {
    const x1 = fromPos.x + ux * startPad;
    const y1 = fromPos.y + uy * startPad;
    const x2 = toPos.x - ux * endPad;
    const y2 = toPos.y - uy * endPad;
    const pointAt = (t: number) => {
      const u = clamp01(t);
      return {x: x1 + (x2 - x1) * u, y: y1 + (y2 - y1) * u};
    };
    return {
      path: `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      mid: pointAt(0.5),
      pointAt,
    };
  }

  const nx = -uy;
  const ny = ux;
  const curveOffset = Math.min(44, Math.max(26, dist * 0.14));
  const cx = (fromPos.x + toPos.x) / 2 + nx * curveOffset;
  const cy = (fromPos.y + toPos.y) / 2 + ny * curveOffset;

  const sDx = cx - fromPos.x;
  const sDy = cy - fromPos.y;
  const sDist = Math.hypot(sDx, sDy) || 1;
  const x1 = fromPos.x + (sDx / sDist) * startPad;
  const y1 = fromPos.y + (sDy / sDist) * startPad;

  const eDx = toPos.x - cx;
  const eDy = toPos.y - cy;
  const eDist = Math.hypot(eDx, eDy) || 1;
  const x2 = toPos.x - (eDx / eDist) * endPad;
  const y2 = toPos.y - (eDy / eDist) * endPad;

  const pointAt = (t: number) => {
    const u = clamp01(t);
    const inv = 1 - u;
    return {
      x: inv * inv * x1 + 2 * inv * u * cx + u * u * x2,
      y: inv * inv * y1 + 2 * inv * u * cy + u * u * y2,
    };
  };

  return {
    path: `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    mid: pointAt(0.5),
    pointAt,
  };
};

/** Collect unique step, node, and explicit edge IDs for `focus` validation. */
export const collectFocusIds = (v: GraphAlgoVisualT): string[] => {
  const ids = new Set<string>();
  for (const n of v.nodes) ids.add(n.id);
  for (const e of v.edges) {
    if (e.id) ids.add(e.id);
  }
  for (const st of v.steps) {
    if (st.id) ids.add(st.id);
  }
  return [...ids];
};
