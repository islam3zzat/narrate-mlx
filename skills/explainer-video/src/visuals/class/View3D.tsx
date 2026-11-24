// 3D view of the `class` visual. Moved from three/Diagram3D.tsx (Class3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import {useTheme, type ThemeDef} from '../../theme';
import {fillOf, type Tone} from '../../flow';
import type {Visual} from '../../types';
import {Dim, focusAt, look, partIn, linkIn, liftOffset, focusBox, unionBox, Block, Stage3D, canvasTexture, type Vec3, type Visual3DProps} from '../../three/common';
import {Chip, MARK_LEN, MarkKind, Marker, NOTEX, P3, PolyBeam, Pop, S, SPRING, T, Tex, chipTex, polyAt, polyLen, trim, unit2, useBuilt} from '../../three/diagram-kit';

type ClassV = Extract<Visual, {type: 'class'}>;

const K_W = 400, ROW = 32;

const PED = 0.2, TIER_GAP = 1.5, TIER_Z = 0.8, K_D = 0.6, X_GAP = 0.9;

type KClass = {id: string; name: string; stereotype?: string; attributes: string[]; methods: string[]; tone?: Tone};

const sectionH = (rows: number) => (rows ? rows * ROW + 20 : 0);

const kHeight = (c: KClass) => (c.stereotype ? 92 : 64) + sectionH(c.attributes.length) + sectionH(c.methods.length) + (c.attributes.length + c.methods.length === 0 ? 20 : 0);

type Rel = ClassV['relations'][number]['type'];

const REL: Record<Rel, {start?: MarkKind; end?: MarkKind; dashed?: boolean}> = {
  inherits: {end: 'tri'},
  implements: {end: 'tri', dashed: true},
  composes: {start: 'diamond-solid'},
  aggregates: {start: 'diamond'},
  associates: {end: 'tri-solid'},
  depends: {end: 'tri-solid', dashed: true},
};

function classTex(c: KClass, fill: string, h: number, rtl: boolean, th: ThemeDef): Tex {
  const w = K_W;
  const tex = canvasTexture(Math.round(w * T), Math.round(h * T), (ctx) => {
    ctx.scale(T, T);
    ctx.fillStyle = th.C.panel; ctx.fillRect(0, 0, w, h);
    const head = c.stereotype ? 92 : 64;
    ctx.fillStyle = fill; ctx.fillRect(0, 0, w, head);
    ctx.fillStyle = th.onAccent(fill); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = rtl ? 'rtl' : 'ltr';
    if (c.stereotype) { ctx.font = `400 20px ${th.MONO}`; ctx.fillText(`«${c.stereotype}»`, w / 2, 33, w - 24); }
    ctx.font = `700 34px ${th.FONT}`;
    ctx.fillText(c.name, w / 2, head - 19, w - 24);
    let y = head;
    for (const rows of [c.attributes, c.methods]) {
      if (!rows.length) continue;
      ctx.fillStyle = th.C.ink; ctx.fillRect(0, y, w, 3);
      ctx.font = `400 22px ${th.MONO}`; ctx.textAlign = rtl ? 'right' : 'left'; ctx.direction = 'ltr';
      rows.forEach((t, i) => ctx.fillText(t, rtl ? w - 18 : 18, y + 10 + i * ROW + 23, w - 36));
      ctx.textAlign = 'center';
      y += sectionH(rows.length);
    }
  });
  return {tex, w: w * S, h: h * S};
}

/** Tier (0 = lowest) of every class: a parent sits one above its child; parts share their whole's tier. */
function tiersOf(ids: string[], rels: ClassV['relations']): Map<string, number> {
  const lvl = new Map(ids.map((id) => [id, 0]));
  for (let it = 0; it < 12; it++) {
    for (const r of rels) {
      if (r.type === 'inherits' || r.type === 'implements') lvl.set(r.to, Math.max(lvl.get(r.to)!, lvl.get(r.from)! + 1));
      else if (r.type === 'composes' || r.type === 'aggregates') { const m = Math.max(lvl.get(r.from)!, lvl.get(r.to)!); lvl.set(r.from, m); lvl.set(r.to, m); }
    }
  }
  const used = [...new Set(lvl.values())].sort((a, b) => a - b);
  return new Map(ids.map((id) => [id, used.indexOf(lvl.get(id)!)]));
}

export const View3D: React.FC<Visual3DProps<ClassV>> = ({visual: raw, frame, frames, at, rtl, focus, lead}) => {
  const {fps} = useVideoConfig();
  const th = useTheme();
  const {C} = th;
  const FILL = fillOf(C);
  const classes: KClass[] = React.useMemo(() => raw.classes.map((c) => ({...c, attributes: c.attributes ?? [], methods: c.methods ?? []})), [raw]);
  const n = classes.length;
  const hs = React.useMemo(() => new Map(classes.map((c) => [c.id, kHeight(c) * S])), [classes]);

  const geo = React.useMemo(() => {
    const ids = classes.map((c) => c.id);
    const level = tiersOf(ids, raw.relations);
    const top = Math.max(...level.values());
    const x = new Map<string, number>();
    const order: string[][] = [];
    const isPart = (r: ClassV['relations'][number]) => r.type === 'composes' || r.type === 'aggregates';
    for (let l = top; l >= 0; l--) {
      let items = ids.filter((id) => level.get(id) === l);
      // key: mean x of already-placed classes this one inherits from / relates to
      const key = (id: string) => {
        const xs: number[] = [];
        for (const r of raw.relations) {
          const other = r.from === id ? r.to : r.to === id ? r.from : null;
          if (other && x.has(other) && level.get(other)! > l) xs.push(x.get(other)!);
        }
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
      };
      const ks = new Map(items.map((id) => [id, key(id)]));
      items = [...items].sort((a, b) => (isNaN(ks.get(a)!) ? 1e6 : ks.get(a)!) - (isNaN(ks.get(b)!) ? 1e6 : ks.get(b)!) || ids.indexOf(a) - ids.indexOf(b));
      // wholes go between their parts
      for (const r of raw.relations.filter(isPart)) {
        const whole = r.from;
        if (!items.includes(whole)) continue;
        const parts = raw.relations.filter((q) => isPart(q) && q.from === whole && items.includes(q.to)).map((q) => q.to);
        const rest = items.filter((id) => id !== whole && !parts.includes(id));
        const at0 = Math.min(items.indexOf(whole), ...parts.map((p) => items.indexOf(p)));
        const left = parts.slice(0, Math.ceil(parts.length / 2)), right = parts.slice(Math.ceil(parts.length / 2));
        rest.splice(Math.min(at0, rest.length), 0, ...left, whole, ...right);
        items = rest;
      }
      const total = items.length * K_W * S + (items.length - 1) * X_GAP;
      const known = items.map((id) => ks.get(id)!).filter((k) => !isNaN(k));
      const centre = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
      items.forEach((id, i) => x.set(id, centre - total / 2 + K_W * S / 2 + i * (K_W * S + X_GAP)));
      order[l] = items;
    }
    const base: number[] = [];
    for (let l = 0; l <= top; l++) base[l] = l === 0 ? PED : base[l - 1] + Math.max(...order[l - 1].map((id) => hs.get(id)!)) + TIER_GAP + PED;
    const xs = [...x.values()], mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const pos = new Map(ids.map((id) => [id, {x: (x.get(id)! - mid) * (rtl ? -1 : 1), base: base[level.get(id)!], z: -level.get(id)! * TIER_Z, level: level.get(id)!}]));
    const wx = Math.max(...[...pos.values()].map((p) => Math.abs(p.x))) + K_W * S / 2 + 0.4;
    const hTop = base[top] + Math.max(...order[top].map((id) => hs.get(id)!));
    return {pos, order, wx, hTop, top};
  }, [raw, classes, rtl, hs]);

  const key = JSON.stringify([th.name, classes, raw.relations.map((r) => r.label), rtl]);
  const tex = useBuilt(key, () => [
    ...classes.map((c) => classTex(c, FILL[(c.tone ?? 'neutral') as Tone], hs.get(c.id)! / S, rtl, th)),
    ...raw.relations.map((r) => (r.label ? chipTex(r.label, C.bg, rtl, th) : NOTEX())),
  ]);
  const idx = new Map(classes.map((c, i) => [c.id, i]));
  const ats = classes.map((_, i) => at(i, n));
  const shownAt = (id: string) => {
    const [a, b] = id.split('->');
    return b === undefined ? (idx.has(a) ? ats[idx.get(a)!] : Infinity) : idx.has(a) && idx.has(b) ? Math.max(ats[idx.get(a)!], ats[idx.get(b)!]) : Infinity;
  };
  const f = focusAt(focus, lead, frame, shownAt);
  const hw = K_W * S / 2;
  const front = (z: number) => z + K_D / 2 + 0.02;

  // attachment offsets so several beams on one face do not share a spot
  const slots = new Map<string, number[]>();
  const sideOf = (r: ClassV['relations'][number], end: 'from' | 'to') => {
    const a = geo.pos.get(r.from)!, b = geo.pos.get(r.to)!;
    if (a.level === b.level) return null;
    const lower = end === 'from' ? a.level < b.level : b.level < a.level;
    return `${r[end]}:${lower ? 'top' : 'bottom'}`;
  };
  raw.relations.forEach((r, i) => (['from', 'to'] as const).forEach((e) => { const k = sideOf(r, e); if (k) slots.set(k, [...(slots.get(k) ?? []), i]); }));
  const offset = (r: ClassV['relations'][number], i: number, end: 'from' | 'to') => {
    const k = sideOf(r, end);
    const list = k ? slots.get(k)! : [];
    return list.length > 1 ? (list.indexOf(i) - (list.length - 1) / 2) * 0.9 : 0;
  };

  const routeOf = (r: ClassV['relations'][number], i: number): {pts: P3[]; startPlane: 'xy'; endPlane: 'xy'} => {
    const a = geo.pos.get(r.from)!, b = geo.pos.get(r.to)!;
    const ha = hs.get(r.from)!, hb = hs.get(r.to)!;
    if (a.level === b.level) {
      const row = geo.order[a.level];
      const adjacent = Math.abs(row.indexOf(r.from) - row.indexOf(r.to)) === 1;
      if (adjacent) {
        const s = b.x >= a.x ? 1 : -1, y = a.base + 0.75;
        return {pts: [[a.x + s * hw, y, front(a.z)], [b.x - s * hw, y, front(b.z)]], startPlane: 'xy', endPlane: 'xy'};
      }
      const ya = a.base + ha + 0.8, yb = b.base + hb + 0.8;     // not neighbours: arc over the top instead of across the faces
      return {pts: [[a.x, a.base + ha, front(a.z)], [a.x, ya, front(a.z)], [b.x, yb, front(b.z)], [b.x, b.base + hb, front(b.z)]], startPlane: 'xy', endPlane: 'xy'};
    }
    const aLow = a.level < b.level;
    const xa = a.x + offset(r, i, 'from'), xb = b.x + offset(r, i, 'to');
    const y0 = aLow ? a.base + ha : a.base - PED, y3 = aLow ? b.base - PED : b.base + hb;
    const ym = (y0 + y3) / 2;
    return {pts: [[xa, y0, front(a.z)], [xa, ym, front(a.z)], [xb, ym, front(b.z)], [xb, y3, front(b.z)]], startPlane: 'xy', endPlane: 'xy'};
  };

  // focus: the camera frames the focused classes (and both ends of focused relations)
  const classBox = (id: string): [Vec3, Vec3] => {
    const g = geo.pos.get(id)!;
    return [[g.x - hw, g.base - PED, g.z - K_D / 2], [g.x + hw, g.base + hs.get(id)!, g.z + K_D / 2]];
  };
  const cam = focusBox(f, (st) => unionBox([
    ...classes.filter((c) => partIn(c.id)(st)).map((c) => classBox(c.id)),
    ...raw.relations.filter((r) => linkIn(r.from, r.to)(st)).flatMap((r) => [classBox(r.from), classBox(r.to)]),
  ]), [[-geo.wx, 0, -geo.top * TIER_Z - K_D], [geo.wx, geo.hTop, K_D]]);
  const dimOf = (l: {opacity: number}) => (1 - l.opacity) / (1 - 0.22);

  return (
    <Stage3D min={cam[0]} max={cam[1]} dir={[0.16, 0.2, 1]} fill={[0.9, 0.6]} frame={frame} frames={frames} rtl={rtl}>
      {tex && raw.relations.map((r, i) => {
        const spec = REL[r.type];
        const a = idx.get(r.from)!, b = idx.get(r.to)!;
        const start = Math.max(ats[a], ats[b]) - 4;
        const p = spring({frame: frame - start, fps, config: {damping: 16, stiffness: 120}});
        if (p <= 0.001) return null;
        const {pts} = routeOf(r, i);
        const m = pts.length;
        const body = trim(pts, spec.start ? MARK_LEN[spec.start] - 0.05 : 0, spec.end ? MARK_LEN[spec.end] - 0.05 : 0);
        const chip = tex[n + i];
        const mid = polyAt(pts, polyLen(pts) / 2);
        return (
          <Dim key={i} v={dimOf(look(f, linkIn(r.from, r.to)))}>
            <PolyBeam pts={body} p={Math.min(1, p * 1.1)} dashed={spec.dashed} />
            {p > 0.95 && spec.end && <Marker kind={spec.end} plane="xy" tip={pts[m - 1]} out={unit2(pts[m - 2], pts[m - 1], 'xy')} />}
            {p > 0.95 && spec.start && <Marker kind={spec.start} plane="xy" tip={pts[0]} out={unit2(pts[1], pts[0], 'xy')} />}
            {r.label && <Chip chip={chip} at={[mid[0], mid[1] + (Math.abs(pts[0][1] - pts[m - 1][1]) < 0.01 ? chip.h / 2 + 0.15 : 0), mid[2] + 0.3]} p={p} />}
          </Dim>
        );
      })}
      {tex && classes.map((c, i) => {
        const p = spring({frame: frame - ats[i], fps, config: SPRING});
        if (p <= 0.001) return null;
        const g = geo.pos.get(c.id)!, h = hs.get(c.id)!;
        const lc = look(f, partIn(c.id)), lo = liftOffset(lc.lift);
        return (
          <Dim key={c.id} v={dimOf(lc)}>
          <Pop p={p} pos={[g.x + lo[0], g.base + lo[1], g.z + lo[2]]} rise>
            <group position={[0, h / 2, 0]}>
              <Block w={K_W * S} h={h} d={K_D} fill={C.panel} front={tex[i].tex} shadow={0.1} />
            </group>
            <group position={[0, -PED / 2, 0]}>
              <Block w={K_W * S + 0.5} h={PED} d={K_D + 0.5} fill={FILL[(c.tone ?? 'neutral') as Tone]} />
            </group>
          </Pop>
          </Dim>
        );
      })}
    </Stage3D>
  );
};

// ------------------------------------------------------------------ mermaid
