// 3D view of the `graph` visual. Moved from three/Diagram3D.tsx (Graph3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import {FONT, MONO, mixHex, useTheme, type ThemeDef} from '../../theme';
import {autoLayout, dotFill, fillOf, type Tone} from '../../flow';
import type {Visual} from '../../types';
import {Mat, Dim, focusAt, look, partIn, linkIn, liftOffset, focusBox, unionBox, Block, Stage3D, canvasTexture, wrapText, type Vec3, type Visual3DProps} from '../../three/common';
import {Chip, Marker, NOTEX, P3, PolyBeam, Pop, S, SPRING, T, Tex, chipTex, polyAt, polyLen, trim, unit2, useBuilt} from '../../three/diagram-kit';

type GraphV = Extract<Visual, {type: 'graph'}>;

/** Packets running along a polyline; a pure function of the frame. */
const PolyDots: React.FC<{pts: P3[]; frame: number; from: number; color: string; phase: number; lift?: number}> = ({pts, frame, from, color, phase, lift = 0.1}) => {
  if (frame < from + 10) return null;
  const L = polyLen(pts);
  return (
    <group>
      {[0, 1, 2].map((k) => {
        const u = ((((frame - from) / 75 + phase + k / 3) % 1) + 1) % 1;
        const fade = Math.min(1, u / 0.1, (1 - u) / 0.1);
        const [x, y, z] = polyAt(pts, u * 0.92 * L);
        return (
          <mesh key={k} position={[x, y + lift, z]} scale={[fade, fade, fade]}>
            <sphereGeometry args={[0.17, 20, 14]} />
            <Mat color={color} />
          </mesh>
        );
      })}
    </group>
  );
};

const G_W = 340;

const gHeight = (n: {label: string; sub?: string}) => 36 + Math.ceil(n.label.length / 14) * 42 + (n.sub ? 8 + Math.ceil(n.sub.length / 20) * 28 : 0);

const FLOOR_H = 0.16, STATION_D = 0.8, RANK_K = 0.95, EDGE_Y = 0.1, RISE = 0.75;

function graphTex(n: {label: string; sub?: string}, fill: string, h: number, rtl: boolean, th: ThemeDef): Tex {
  const w = G_W;
  const tex = canvasTexture(Math.round(w * T), Math.round(h * T), (ctx) => {
    ctx.scale(T, T);
    ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h);
    if (th.isAnime) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fillRect(0, 0, w, Math.max(8, Math.round(h * 0.12)));
      ctx.fillStyle = 'rgba(42, 38, 88, 0.10)';
      ctx.beginPath();
      ctx.moveTo(w * 0.72, h); ctx.lineTo(w, h * 0.38); ctx.lineTo(w, h); ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = th.onAccent(fill); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.font = `700 36px ${FONT}`;
    const lab = wrapText(ctx, n.label, w - 32);
    ctx.font = `400 22px ${MONO}`;
    const sub = n.sub ? wrapText(ctx, n.sub, w - 32) : [];
    const total = lab.length * 42 + (sub.length ? 8 + sub.length * 28 : 0);
    let y = (h - total) / 2;
    ctx.font = `700 36px ${FONT}`;
    for (const t of lab) { y += 42; ctx.fillText(t, w / 2, y - 11, w - 24); }
    if (sub.length) {
      y += 8; ctx.font = `400 22px ${MONO}`; ctx.globalAlpha = 0.85;
      for (const t of sub) { y += 28; ctx.fillText(t, w / 2, y - 7, w - 24); }
      ctx.globalAlpha = 1;
    }
  });
  return {tex, w: w * S, h: h * S};
}

export const View3D: React.FC<Visual3DProps<GraphV>> = ({visual: v, frame, frames, at, rtl, focus, lead}) => {
  const {fps} = useVideoConfig();
  const th = useTheme();
  const {C, isAnime} = th;
  const FILL = fillOf(C);
  const n = v.nodes.length;
  const hs = React.useMemo(() => new Map(v.nodes.map((nd) => [nd.id, gHeight(nd) * S])), [v]);
  const geo = React.useMemo(() => {
    // always laid out top-to-bottom: dagre y = rank (becomes depth), dagre x = spread
    const layout = autoLayout(v.nodes.map((nd) => ({id: nd.id, w: G_W, h: 100})), v.edges.map((e) => ({from: e.from, to: e.to})), 'TB', 1700, 700, undefined, false);
    const ctr = [...layout.positions].map(([id, p]) => ({id, x: p.x + G_W / 2, y: p.y + 50}));
    const xs = ctr.map((c) => c.x), ys = ctr.map((c) => c.y);
    const xm = (Math.min(...xs) + Math.max(...xs)) / 2, y0 = Math.min(...ys), depth = (Math.max(...ys) - y0) * S * RANK_K;
    const m = new Map<string, {x: number; z: number}>();
    for (const c of ctr) m.set(c.id, {x: (c.x - xm) * S * (rtl ? -1 : 1), z: depth / 2 - (c.y - y0) * S * RANK_K});
    const hw = G_W * S / 2, hmax = Math.max(...v.nodes.map((nd) => hs.get(nd.id)!));
    const wx = Math.max(...[...m.values()].map((p) => Math.abs(p.x))) + hw + 0.5, wz = depth / 2 + STATION_D / 2 + 0.6;
    // Terraces: every rank stands on its own flat step, one RISE higher per rank going back, so stations further
    // back are never hidden by the ones in front while the camera stays low enough for their text to face it.
    const zs = [...new Set([...m.values()].map((p) => Math.round(p.z * 1000) / 1000))].sort((a, b) => b - a);
    const rank = (z: number) => zs.reduce((best, r, i) => (Math.abs(r - z) < Math.abs(zs[best] - z) ? i : best), 0);
    const steps = zs.map((z, i) => ({
      y: i * RISE,
      front: i === 0 ? wz : (zs[i - 1] + z) / 2,
      back: i === zs.length - 1 ? -wz : (z + zs[i + 1]) / 2,
    }));
    return {m, wx, wz, hmax, rank, steps, top: (zs.length - 1) * RISE};
  }, [v, rtl, hs]);
  const lvl = (z: number) => geo.steps[geo.rank(z)].y;
  const key = JSON.stringify([th.name, v.nodes, v.edges.map((e) => [e.label, e.tone]), rtl]);
  const tex = useBuilt(key, () => [
    ...v.nodes.map((nd) => graphTex(nd, FILL[(nd.tone ?? 'neutral') as Tone], hs.get(nd.id)! / S, rtl, th)),
    ...v.edges.map((e) => (e.label ? chipTex(e.label, e.tone ? FILL[e.tone] : C.bg, rtl, th) : NOTEX())),
  ]);
  const idx = new Map(v.nodes.map((nd, i) => [nd.id, i]));
  const ats = v.nodes.map((_, i) => at(i, n));
  const shownAt = (id: string) => {
    const [a, b] = id.split('->');
    return b === undefined ? (idx.has(a) ? ats[idx.get(a)!] : Infinity) : idx.has(a) && idx.has(b) ? Math.max(ats[idx.get(a)!], ats[idx.get(b)!]) : Infinity;
  };
  const f = focusAt(focus, lead, frame, shownAt);
  const hw = G_W * S / 2;

  /** Edge route along the terraces: flat on the source step, up the riser in front of the target's step, across. */
  /**
   * Edges that would pass through something go around it, on the ground, along rows no station stands on:
   * - skip: an edge that skips a rank (it would run through the terrace between). It leaves its source by the back,
   *   runs sideways along the row behind the source's rank to a lane at the outer edge of the terraces, climbs each
   *   riser in that lane, runs along the row in front of the target's rank and enters the target from the front.
   * - row: an edge between two stations on one rank with another station between them runs along the row in front.
   * Each detour gets its own lane (skip: one per side, outward; row: one per rank, forward), so opposite or parallel
   * edges never share a beam or a label spot. Labels: skip labels sit outside the terrace edge, beside the lane
   * (never behind a station; the camera box includes them); row labels sit in the widest gap between stations.
   */
  const LANE_GAP = 0.45, ROW_GAP = 0.35;
  const detours = React.useMemo(() => {
    const perSide = new Map<number, number>(), perRank = new Map<number, number>();
    return v.edges.map((e) => {
      const a = geo.m.get(e.from)!, b = geo.m.get(e.to)!;
      const ra = geo.rank(a.z), rb = geo.rank(b.z);
      if (ra === rb) {
        const between = v.nodes.some((nd) => {
          const g = geo.m.get(nd.id)!;
          return nd.id !== e.from && nd.id !== e.to && geo.rank(g.z) === ra && Math.min(a.x, b.x) + 0.01 < g.x && g.x < Math.max(a.x, b.x) - 0.01;
        });
        if (!between) return null;
        const j = perRank.get(ra) ?? 0; perRank.set(ra, j + 1);
        return {kind: 'row' as const, j, side: 0};
      }
      if (Math.abs(ra - rb) < 2) return null;
      const side = a.x + b.x >= 0 ? 1 : -1;
      const j = perSide.get(side) ?? 0; perSide.set(side, j + 1);
      return {kind: 'skip' as const, j, side};
    });
  }, [v, geo]);
  const lanes = Math.max(0, ...detours.map((d) => (d?.kind === 'skip' ? d.j + 1 : 0)));
  const wx = geo.wx + Math.max(0, lanes - 1) * LANE_GAP;   // the terraces widen to hold every lane

  const aroundRoute = (i: number): {pts: P3[]; label: (chipW: number) => P3} | null => {
    const d = detours[i];
    if (!d) return null;
    const e = v.edges[i], a = geo.m.get(e.from)!, b = geo.m.get(e.to)!;
    const ya = lvl(a.z) + EDGE_Y, yb = lvl(b.z) + EDGE_Y;
    if (d.kind === 'row') {
      const zf = a.z + STATION_D / 2 + 0.4 + d.j * ROW_GAP;   // in front of the rank, on its own step
      const pts: P3[] = [[a.x, ya, a.z + STATION_D / 2], [a.x, ya, zf], [b.x, yb, zf], [b.x, yb, b.z + STATION_D / 2]];
      // the label goes in the widest gap between stations on this rank, within the edge's span
      const xs = v.nodes.map((nd) => geo.m.get(nd.id)!).filter((g) => geo.rank(g.z) === geo.rank(a.z)).map((g) => g.x).sort((p, q) => p - q);
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      let best = (lo + hi) / 2, width = -1;
      for (let k = 0; k + 1 < xs.length; k++) {
        if (xs[k] < lo - 0.01 || xs[k + 1] > hi + 0.01) continue;
        const gap = xs[k + 1] - xs[k] - 2 * hw;
        if (gap > width) { width = gap; best = (xs[k] + xs[k + 1]) / 2; }
      }
      return {pts, label: () => [best, ya, zf + 0.05]};
    }
    const up = geo.rank(b.z) > geo.rank(a.z) ? 1 : -1;     // +1: the target is further back
    const lane = d.side * (geo.wx - 0.3 + d.j * LANE_GAP);
    const rowA = a.z - up * (STATION_D / 2 + 0.35 + d.j * 0.12);   // the row behind (or in front of) the source
    const rowB = b.z + up * (STATION_D / 2 + 0.35 + d.j * 0.12);   // the row in front of (or behind) the target
    const pts: P3[] = [[a.x, ya, a.z - up * STATION_D / 2], [a.x, ya, rowA], [lane, ya, rowA]];
    for (let r = geo.rank(a.z) + up; r !== geo.rank(b.z) + up; r += up) {
      const riser = up > 0 ? geo.steps[r].front : geo.steps[r].back;
      pts.push([lane, geo.steps[r - up].y + EDGE_Y, riser], [lane, geo.steps[r].y + EDGE_Y, riser]);
    }
    pts.push([lane, yb, rowB], [b.x, yb, rowB], [b.x, yb, b.z + up * STATION_D / 2]);
    // beside the lane, outside the terrace edge, halfway up its climb
    const mid = 3 + Math.floor((pts.length - 6) / 2);
    return {pts, label: (w) => [lane + d.side * (w / 2 + 0.2), (pts[mid][1] + pts[mid + 1][1]) / 2, pts[mid][2] + 0.05]};
  };

  const routeOf = (from: string, to: string, i: number): P3[] => {
    const around = aroundRoute(i);
    if (around) return around.pts;
    const a = geo.m.get(from)!, b = geo.m.get(to)!;
    const ya = lvl(a.z) + EDGE_Y, yb = lvl(b.z) + EDGE_Y;
    if (Math.abs(a.z - b.z) < 0.3) {                      // same rank, neighbours: side to side
      const s = b.x >= a.x ? 1 : -1;
      return [[a.x + s * hw, ya, a.z], [b.x - s * hw, yb, b.z]];
    }
    const sg = b.z <= a.z ? -1 : 1;                       // -1: the target is further back (and higher)
    const step = geo.steps[geo.rank(b.z)];
    const zc = sg < 0 ? step.front : step.back;           // the riser between the source side and the target's step
    const p0: P3 = [a.x, ya, a.z + sg * STATION_D / 2], p3: P3 = [b.x, yb, b.z - sg * STATION_D / 2];
    if (Math.abs(a.x - b.x) < 0.02) return [p0, [a.x, ya, zc], [a.x, yb, zc], p3];
    // cross over on the source step, then climb at the target's x: the climb is beside the source station, not
    // hidden behind it, and the label can sit on that riser face
    const zx = zc - sg * 0.35;
    return [p0, [a.x, ya, zx], [b.x, ya, zx], [b.x, ya, zc], [b.x, yb, zc], p3];
  };

  // focus: the camera frames the focused stations (and both ends of focused edges)
  const nodeBox = (id: string): [Vec3, Vec3] => {
    const g = geo.m.get(id)!, y = lvl(g.z);
    return [[g.x - hw, y, g.z - STATION_D / 2], [g.x + hw, y + hs.get(id)!, g.z + STATION_D / 2]];
  };
  // how far lane labels reach past the terrace edge (they sit outside it), so the camera keeps them on stage
  const labelOut = tex ? Math.max(0, ...v.edges.map((e, k) => (detours[k]?.kind === 'skip' && e.label ? tex[n + k].w + 0.4 : 0))) : 0;
  const cam = focusBox(f, (st) => unionBox([
    ...v.nodes.filter((nd) => partIn(nd.id)(st)).map((nd) => nodeBox(nd.id)),
    ...v.edges.filter((e) => linkIn(e.from, e.to)(st)).flatMap((e) => [nodeBox(e.from), nodeBox(e.to)]),
  ]), [[-wx - labelOut, -FLOOR_H, -geo.wz], [wx + labelOut, geo.top + geo.hmax + 0.2, geo.wz]]);
  const dimOf = (l: {opacity: number}) => (1 - l.opacity) / (1 - 0.22);

  return (
    <Stage3D min={cam[0]} max={cam[1]} dir={[0.16, 0.5, 1]} fill={[0.9, 0.6]} frame={frame} frames={frames} rtl={rtl}>
      {geo.steps.map((st, i) => (
        <group key={i} position={[0, (st.y - FLOOR_H) / 2, (st.front + st.back) / 2]}>
          <Block w={wx * 2} h={st.y + FLOOR_H} d={st.front - st.back} fill={i % 2 ? (isAnime ? mixHex(C.muted, C.panel, 0.35) : '#e2e2e2') : C.muted} shadow={i === 0 ? 0.14 : 0} />
        </group>
      ))}
      {tex && v.edges.map((e, i) => {
        const a = idx.get(e.from)!, b = idx.get(e.to)!;
        const start = Math.max(ats[a], ats[b]) - 4;
        const p = spring({frame: frame - start, fps, config: {damping: 16, stiffness: 120}});
        if (p <= 0.001) return null;
        const pts = routeOf(e.from, e.to, i);
        const m = pts.length;
        const body = trim(pts, 0, 0.38);
        const chip = tex[n + i];
        // on the cross-over (branching edges), just past the bend, so labels sit clear of both stations
        // labels sit on the riser face the edge climbs (below the target's station, so they never cover its text),
        // pushed clear of the source station; same-rank edges keep the midpoint
        const over = aroundRoute(i);
        const ri = m === 6 ? 3 : 1;                       // index of the riser's foot
        const src = geo.m.get(e.from)!;
        // beside the climb, on its outer side (away from the source), so neither the beam nor its dots cross it
        // Try both sides of the climb (outer first) and take the first one that no station standing on the same step
        // (in front of the riser, where it would hide the label) covers; if both are covered, keep clear of the source.
        const out = Math.sign(pts[ri][0] - src.x) || 1;
        const step = geo.rank(src.z);
        const blockers = v.nodes.map((nd) => geo.m.get(nd.id)!).filter((g) => geo.rank(g.z) === step);
        const free = (x: number) => blockers.every((g) => Math.abs(x - g.x) >= hw + chip.w / 2 + 0.1);
        const freeX = [out, -out].map((sd) => pts[ri][0] + sd * (chip.w / 2 + 0.2)).find(free);
        const blocked = !over && m >= 4 && freeX === undefined;
        let lx = freeX ?? pts[ri][0] + out * (chip.w / 2 + 0.2);
        const clear = hw + chip.w / 2 + 0.1;
        if (!free(lx) && Math.abs(lx - src.x) < clear) lx = src.x + out * clear;
        const last: P3 = over
          ? over.label(chip.w)
          : m >= 4
          ? [lx, (pts[ri][1] + pts[ri + 1][1]) / 2 - chip.h / 2 - 0.2, pts[ri][2] + 0.06]
          : polyAt(pts, polyLen(pts) / 2);
        const le = look(f, linkIn(e.from, e.to));
        return (
          <Dim key={i} v={dimOf(le)}>
            <PolyBeam pts={body} p={Math.min(1, p * 1.1)} dashed={e.dashed} />
            {p > 0.95 && <Marker kind="tri-solid" plane="xz" tip={pts[m - 1]} out={unit2(pts[m - 2], pts[m - 1], 'xz')} />}
            {p > 0.95 && v.animate !== false && <PolyDots pts={pts} frame={frame} from={start} color={dotFill(e.tone ?? v.nodes[a].tone, C)} phase={(i * 0.37) % 1} />}
            {e.label && <Chip chip={chip} at={[last[0], last[1] + 0.25 + chip.h / 2, last[2]]} p={p} onTop={blocked} />}
          </Dim>
        );
      })}
      {tex && v.nodes.map((nd, i) => {
        const p = spring({frame: frame - ats[i], fps, config: SPRING});
        if (p <= 0.001) return null;
        const g = geo.m.get(nd.id)!, h = hs.get(nd.id)!;
        const ln = look(f, partIn(nd.id)), lo = liftOffset(ln.lift);
        return (
          <Dim key={nd.id} v={dimOf(ln)}>
            <Pop p={p} pos={[g.x + lo[0], lvl(g.z) + lo[1], g.z + lo[2]]} rise>
              <group position={[0, h / 2, 0]}>
                <Block w={G_W * S} h={h} d={STATION_D} fill={FILL[(nd.tone ?? 'neutral') as Tone]} front={tex[i].tex} shadow={0.1} />
              </group>
            </Pop>
          </Dim>
        );
      })}
    </Stage3D>
  );
};

// ------------------------------------------------------------------ class: tiers of abstraction
// A class stands on its own pedestal; the tier's height is its abstraction level. Parents (the targets of inherits and
// implements) sit on a higher tier, set a little further back, with the inheritance beams rising to them. Composition
// and aggregation put the parts beside the whole on the same tier, with the diamond at the whole.
