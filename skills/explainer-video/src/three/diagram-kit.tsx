// Helpers shared by several 3D views in Diagram3D.tsx's family (src/visuals/*/View3D.tsx). Moved from Diagram3D.tsx unchanged, with `export` added.
import React from 'react';
import * as THREE from 'three';
import {MONO, getTheme, useTheme, type ThemeDef} from '../theme';
import {Mat, Beam3D, PX, canvasTexture, useFontsReady, type Vec3} from './common';

export const S = 1 / 100;          // world units per layout pixel

export const T = PX * S;           // texture pixels per layout pixel

export const SPRING = {damping: 14, stiffness: 140};

// ------------------------------------------------------------------ shared helpers

export type Tex = {tex: THREE.Texture; w: number; h: number};

/** Builds textures once fonts are ready (and again when `key` changes); disposes the old ones. Null until ready. */
export function useBuilt(key: string, build: () => Tex[]): Tex[] | null {
  const ready = useFontsReady();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = React.useMemo(() => (ready ? build() : null), [ready, key]);
  React.useEffect(() => () => built?.forEach((b) => b.tex.dispose()), [built]);
  return built;
}

/** A small label chip, like the 2D edge label. World size includes a scale-up for legibility. */
export function chipTex(label: string, fill: string, rtl = false, th?: ThemeDef): Tex {
  const theme = th ?? getTheme();
  const ink = theme.C.ink;
  const font = `700 26px ${theme.MONO}`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(label).width) + 30, h = 40;
  const tex = canvasTexture(Math.round(w * T), Math.round(h * T), (ctx) => {
    ctx.scale(T, T);
    ctx.fillStyle = ink; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fill; ctx.fillRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = theme.onAccent(fill); ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';   // bidi order of mixed Arabic and Latin labels
    ctx.fillText(label, w / 2, h / 2 + 1);
  });
  return {tex, w: w * S * 1.2, h: h * S * 1.2};
}

export type Pt = [number, number];

export type P3 = Vec3;

export const d3 = (a: P3, b: P3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export const lerp3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Moves the first point `s` and the last point `e` inward along their segments. */
export function trim(pts: P3[], s: number, e: number): P3[] {
  const out = pts.map((p) => [...p] as P3);
  const n = out.length;
  if (s > 0) out[0] = lerp3(pts[0], pts[1], Math.min(0.9, s / Math.max(d3(pts[0], pts[1]), 1e-6)));
  if (e > 0) out[n - 1] = lerp3(pts[n - 1], pts[n - 2], Math.min(0.9, e / Math.max(d3(pts[n - 1], pts[n - 2]), 1e-6)));
  return out;
}

export const polyLen = (pts: P3[]) => pts.slice(1).reduce((a, p, i) => a + d3(pts[i], p), 0);

export const polyAt = (pts: P3[], d: number): P3 => {
  for (let i = 1; i < pts.length; i++) {
    const l = d3(pts[i - 1], pts[i]);
    if (d <= l || i === pts.length - 1) return lerp3(pts[i - 1], pts[i], l ? Math.min(1, d / l) : 0);
    d -= l;
  }
  return pts[0];
};

/** A polyline of beams grown by p (0..1) along its length, dashed if asked; corners get a small cube. */
export const PolyBeam: React.FC<{pts: P3[]; p: number; dashed?: boolean}> = ({pts, p, dashed}) => {
  const th = useTheme();
  const L = polyLen(pts), shown = L * p;
  let acc = 0;
  return (
    <group>
      {pts.slice(1).map((b, i) => {
        const a = pts[i], l = d3(a, b);
        const sp = Math.max(0, Math.min(1, (shown - acc) / Math.max(l, 1e-6)));
        acc += l;
        return (
          <group key={i}>
            <Beam3D a={a} b={b} p={sp} arrow={false} dashed={dashed} />
            {i > 0 && sp > 0 && !dashed && (
              <mesh position={a}>
                <boxGeometry args={[0.12, 0.12, 0.12]} />
                <Mat color={th.C.ink} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};

export type MarkKind = 'tri' | 'tri-solid' | 'diamond' | 'diamond-solid';

export const MARK_LEN: Record<MarkKind, number> = {tri: 0.64, 'tri-solid': 0.5, diamond: 0.9, 'diamond-solid': 0.9};

export const markShape = (kind: MarkKind, k = 1): THREE.Shape => {
  const L = MARK_LEN[kind], h = kind.startsWith('tri') ? (kind === 'tri' ? 0.64 : 0.5) : 0.56;
  const pts: Pt[] = kind.startsWith('tri') ? [[0, 0], [-L, h / 2], [-L, -h / 2]] : [[0, 0], [-L / 2, h / 2], [-L, 0], [-L / 2, -h / 2]];
  const c = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const sh = new THREE.Shape();
  pts.forEach((p, i) => {
    const x = c + (p[0] - c) * k, y = p[1] * k;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  });
  sh.closePath();
  return sh;
};

/**
 * A flat end marker with its tip at `tip`; `out` is the unit direction from body to tip within the marker's plane:
 * 'xy' stands facing the camera, 'xz' lies on the floor (out = [dx, dz]). Hollow ones are white with a black rim.
 */
export const Marker: React.FC<{kind: MarkKind; tip: P3; out: Pt; plane: 'xy' | 'xz'}> = ({kind, tip, out, plane}) => {
  const th = useTheme();
  const solid = kind.endsWith('solid');
  const outer = React.useMemo(() => new THREE.ShapeGeometry(markShape(kind, 1)), [kind, solid]);
  const inner = React.useMemo(() => new THREE.ShapeGeometry(markShape(kind, 0.6)), [kind]);
  React.useEffect(() => () => { outer.dispose(); inner.dispose(); }, [outer, inner]);
  const ang = plane === 'xy' ? Math.atan2(out[1], out[0]) : Math.atan2(-out[1], out[0]);
  return (
    <group position={tip} rotation={plane === 'xz' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <group rotation={[0, 0, ang]}>
        <mesh geometry={outer} position={[0, 0, 0.04]}><Mat color={th.C.ink} /></mesh>
        {!solid && <mesh geometry={inner} position={[0, 0, 0.14]}><Mat color={th.C.panel} /></mesh>}
      </group>
    </group>
  );
};

export const unit2 = (a: P3, b: P3, plane: 'xy' | 'xz'): Pt => {
  const j = plane === 'xy' ? 1 : 2;
  const dx = b[0] - a[0], dj = b[j] - a[j], l = Math.hypot(dx, dj) || 1;
  return [dx / l, dj / l];
};

/** An edge label. `onTop`: drawn over everything (no depth test), for a label with no unobstructed place to sit. */
export const Chip: React.FC<{chip: Tex; at: P3; p: number; onTop?: boolean}> = ({chip, at, p, onTop}) => (
  <mesh position={at} scale={[Math.min(1, p), Math.min(1, p), 1]} renderOrder={onTop ? 10 : 0}>
    <planeGeometry args={[chip.w, chip.h]} />
    <Mat map={chip.tex} depthTest={!onTop} />
  </mesh>
);

/** Pop-in around the group origin (the base point of whatever stands there). */
export const Pop: React.FC<{p: number; children: React.ReactNode; pos: Vec3; rise?: boolean}> = ({p, children, pos, rise}) => {
  const k = 0.7 + 0.3 * Math.min(p, 1.15);
  return <group position={pos} scale={rise ? [1, Math.max(0.01, Math.min(p, 1.1)), 1] : [k, k, k]}>{children}</group>;
};

export const NOTEX = () => ({tex: new THREE.Texture(), w: 0, h: 0});

// ------------------------------------------------------------------ graph: stations on a floor
// Dagre's rank axis becomes depth (first rank nearest the camera, the flow recedes into the distance), the other
// axis is spread sideways. Edges lie on the floor and packets run along them towards the next station.
