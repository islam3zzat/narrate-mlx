// Shared pieces for the 3D visuals (spike). Same rules as Layers3D: frame-driven, unlit, flat shadows, fonts first.
import React from 'react';
import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {cancelRender, continueRender, delayRender, interpolate} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import constants from '../constants.json';
import {FONT, MONO, ThemeContext, getTheme, loadFonts, mixHex, useTheme, type ThemeDef} from '../theme';
import {useRtl} from '../rtl';
import type {FocusEvent, FocusNow} from '../focus';
import type {MermaidRendered} from '../types';

const _shadeCol = new THREE.Color();
const _shadeCache = new Map<string, string>();
export const shade = (hex: string, k: number) => {
  const key = `${hex}|${k}`;
  const hit = _shadeCache.get(key);
  if (hit) return hit;
  const out = '#' + _shadeCol.set(hex).multiplyScalar(k).getHexString();
  if (_shadeCache.size >= 256) {
    const oldest = _shadeCache.keys().next().value;
    if (oldest !== undefined) _shadeCache.delete(oldest);
  }
  _shadeCache.set(key, out);
  return out;
};

/**
 * True once the bundled fonts are registered and loaded; holds the render until then. Waits on the same promise as
 * Explainer's loadFonts: document.fonts.load() alone can resolve before those FontFaces are added, and the textures
 * then get measured (wrapped, shrunk) with fallback metrics in some render tabs but not in others.
 *
 * - loadFonts gives up after 10 s (fine for 2D, where CSS text reflows later). A 3D texture would keep fallback glyphs
 *   for the whole render in that tab, so a font that did not load fails the render instead.
 * - The render is released only after `ready` has committed and two animation frames have passed, so the textures
 *   built from it are on the canvas before the frame is captured (continuing in the same callback as setReady let a
 *   tab capture its first frame without them).
 */
export const useFontsReady = (): boolean => {
  const rtl = useRtl();
  const [ready, setReady] = React.useState(false);
  const committed = React.useRef(false);
  React.useEffect(() => { committed.current = true; }, []);
  const [handle] = React.useState(() => {
    const h = delayRender('3d fonts');
    loadFonts(rtl).then(() => document.fonts.ready).finally(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!committed.current) continueRender(h);
      }));
    });
    return h;
  });
  const released = React.useRef(false);
  const release = React.useCallback(() => { if (!released.current) { released.current = true; continueRender(handle); } }, [handle]);
  // unmounting at any point (before the fonts are ready, or while waiting for the paint) must release the handle
  React.useEffect(() => () => release(), [release]);
  React.useEffect(() => {
    let live = true;
    loadFonts(rtl).then(() => document.fonts.ready).then(() => {
      if (!live) return;
      // a loaded face of each family (document.fonts.check() is true when no face for the family exists at all, so it
      // cannot tell a font that was never added)
      const need = ['Space Grotesk', 'Space Mono', ...(rtl ? ['Explainer Arabic'] : [])];
      const faces = [...(document.fonts as unknown as Iterable<FontFace>)];
      const missing = need.filter((fam) => !faces.some((f) => f.family.replace(/["']/g, '') === fam && f.status === 'loaded'));
      if (missing.length) cancelRender(new Error(`3D text needs these fonts, which did not load: ${missing.join(', ')}`));
      else setReady(true);
    }).catch((e) => { if (live) cancelRender(e); });
    return () => { live = false; };
  }, [rtl]);
  React.useEffect(() => {
    if (!ready) return;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(release); });
    return () => cancelAnimationFrame(id);
  }, [ready, release]);
  return ready;
};

/** A texture drawn by `draw` onto a canvas of w x h CSS pixels (2x backing for sharp text). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2;
  const ctx = cv.getContext('2d')!;
  ctx.scale(2, 2);
  draw(ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------- focus dimming
/** 0..1: how far the parts inside are dimmed (focus on something else). Every 3D material reads it via <Mat>. */
export const DimCtx = React.createContext(0);
/** How far a fully dimmed part fades toward the background (2D focus uses opacity 0.22, i.e. 0.78 of the way). */
const DIM_WASH = 0.78;
export const Dim: React.FC<{v: number; children: React.ReactNode}> = ({v, children}) => <DimCtx.Provider value={v}>{children}</DimCtx.Provider>;

// Dimming is an opaque fade toward the page background, not transparency: see-through parts let lines and text behind
// them show through and mix with what is in front, which made dimmed diagrams illegible. The fade happens in the
// shader on the final (sRGB) colour, so it works on textured faces too, and the material stays opaque, so there is no
// `transparent` flip (three.js compiles that into the shader; flipping it mid-render broke sequential renders).
const _hexVecCache = new Map<string, THREE.Vector3>();
const hexToVec3 = (hex: string) => {
  const hit = _hexVecCache.get(hex);
  if (hit) return hit;
  const vec = new THREE.Vector3(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
  _hexVecCache.set(hex, vec);
  return vec;
};
const injectWash = (shader: {uniforms: Record<string, THREE.IUniform>; fragmentShader: string}, u: {uDim: THREE.IUniform; uBg: THREE.IUniform}) => {
  shader.uniforms.uDim = u.uDim;
  shader.uniforms.uBg = u.uBg;
  shader.fragmentShader = 'uniform float uDim;\nuniform vec3 uBg;\n' + shader.fragmentShader.replace(
    '#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, uDim);');
};

/** The one material every 3D visual uses: unlit (exact brand colours), faded by the enclosing <Dim>. */
export const Mat: React.FC<{
  attach?: string;
  color?: string;
  map?: THREE.Texture | null;
  side?: THREE.Side;
  depthTest?: boolean;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
}> = (p) => {
  const d = React.useContext(DimCtx);
  const th = useTheme();
  const u = React.useMemo(() => ({uDim: {value: 0}, uBg: {value: hexToVec3(th.C.bg)}}), []);
  u.uDim.value = d * DIM_WASH;
  u.uBg.value = hexToVec3(th.C.bg);
  const onBeforeCompile = React.useCallback((sh: Parameters<typeof injectWash>[0]) => injectWash(sh, u), [u]);
  const cacheKey = p.vertexColors || p.transparent ? `wash-${p.vertexColors ? 'v' : 'n'}-${p.transparent ? 't' : 'o'}` : 'wash';
  return <meshBasicMaterial {...p} toneMapped={false} onBeforeCompile={onBeforeCompile} customProgramCacheKey={() => cacheKey} />;
};

/** 4px ink edges, screen-space wide (WebGL ignores lineWidth on plain lines). */
export const Outline: React.FC<{w: number; h: number; d: number}> = ({w, h, d}) => {
  const th = useTheme();
  const dim = React.useContext(DimCtx);
  const {inkCol, bgCol} = React.useMemo(
    () => ({inkCol: new THREE.Color(th.C.ink), bgCol: new THREE.Color(th.C.bg)}),
    [th.C.ink, th.C.bg],
  );
  const obj = React.useMemo(() => {
    const geo = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)));
    const mat = new LineMaterial({color: inkCol.getHex(), linewidth: th.BORDER, resolution: new THREE.Vector2(1920, 1080)});
    return new LineSegments2(geo, mat);
  }, [w, h, d, inkCol, th.BORDER]);
  React.useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  // outlines fade the same way: ink mixed toward the background (opaque)
  (obj.material as LineMaterial).color.lerpColors(inkCol, bgCol, dim * DIM_WASH);
  return <primitive object={obj} />;
};

/** Gap between a resting block and the surface under it (see Block). */
export const REST_GAP = 0.006;

/** An unlit box: front face (+z) may carry a texture, sides are shaded (3-band cool indigo cel shading in anime theme). */
export const Block: React.FC<{w: number; h: number; d: number; fill: string; front?: THREE.Texture; outline?: boolean; shadow?: number}> = ({w, h, d, fill, front, outline = true, shadow = 0}) => {
  const th = useTheme();
  const side = shade(fill, 0.72);
  const rightCol = th.isAnime ? mixHex(fill, th.cel.shadowTint, 0.34) : side;
  const leftCol = th.isAnime ? mixHex(fill, th.cel.shadowTint, 0.2) : side;
  const topCol = th.isAnime ? mixHex(fill, '#ffffff', 0.22) : fill;
  const backCol = th.isAnime ? mixHex(fill, th.C.ink, 0.45) : side;
  const shadowCol = th.isAnime ? th.cel.shadowTint : th.C.ink;
  return (
    // Raised a hair: a block resting on a surface would share its bottom plane with it, and the two then flicker
    // (z-fighting) and eat the bottom outline.
    <group position={[0, REST_GAP, 0]}>
      {/* Hard shadow offset right and back, never down: a downward offset pokes into whatever the block stands on. */}
      {shadow > 0 && (
        // 0.03 shorter (same base): a full-height copy shares the block's top plane, and the two then flicker
        <mesh position={[shadow, -0.015, -shadow]}>
          <boxGeometry args={[w, h - 0.03, d]} />
          <Mat color={shadowCol} />
        </mesh>
      )}
      {/* Keyed on the front texture: swapping a material in place makes R3F restore the mesh's default (white)
          material on unmount, which only shows in sequential renders, never in stills. Remount instead. */}
      <mesh key={front ? front.uuid : 'plain'}>
        <boxGeometry args={[w, h, d]} />
        <Mat attach="material-0" color={rightCol} />
        <Mat attach="material-1" color={leftCol} />
        <Mat attach="material-2" color={topCol} />
        <Mat attach="material-3" color={backCol} />
        {front ? <Mat attach="material-4" map={front} /> : <Mat attach="material-4" color={fill} />}
        <Mat attach="material-5" color={backCol} />
      </mesh>
      {outline && <Outline w={w} h={h} d={d} />}
    </group>
  );
};

/** The free band for 3D content, in px from the top and bottom of the 1920x1080 frame: below the 2D heading, above the
 *  subtitles, and above the visual's caption line when it has one (the 2D overlay draws it at about y 800-850). */
export type Band = {top: number; bottom: number};
export const bandFor = (caption: boolean, headingLines = 1, captionLines = 1): Band => ({
  // capped, so absurdly long text cannot squeeze the band to nothing (the camera fit would break)
  top: 222 + (Math.min(headingLines, 3) - 1) * 72,                      // the heading is 68px, line height 1.05
  bottom: caption ? 290 + (Math.min(captionLines, 3) - 1) * 40 : 172,   // the caption line is 30px
});
/** Lines `text` takes at `font` in a box `width` px wide (measured: the overlay wraps by width, not by characters). */
export const linesOf = (text: string | undefined, font: string, width: number): number => {
  if (!text) return 1;
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = font;
  return Math.max(1, wrapText(ctx, text, width).length);
};
export const BandCtx = React.createContext<Band>(bandFor(false));

/**
 * Provides the band for a 3D scene, measuring the heading and caption once the bundled fonts are verified loaded via
 * `useFontsReady` (holding a Remotion delayRender handle until fonts resolve so heading/caption wrapping never uses
 * fallback metrics on first capture). 3D only, so the 2D path is untouched.
 */
export const BandProvider: React.FC<{heading?: string; headingFont: string; caption?: string; children: React.ReactNode}> = ({heading, headingFont, caption, children}) => {
  const loaded = useFontsReady();
  const band = React.useMemo(() => bandFor(!!caption,
    loaded ? linesOf(heading, headingFont, 1700) : 1,
    loaded ? linesOf(caption, `400 30px ${FONT}`, 1700) : 1), [loaded, heading, headingFont, caption]);
  return <BandCtx.Provider value={band}>{children}</BandCtx.Provider>;
};

export const CANVAS_PROPS = {
  width: 1920, height: 1080, dpr: 1, flat: true, linear: false,
  // no render loop: Stage3D draws explicitly after every commit (Draw), so a captured frame is always the committed
  // state of that frame, never a loop iteration that has not caught up yet
  frameloop: 'never' as const,
  gl: {antialias: true, toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true},
  // Clipped to the band between the 2D heading and the subtitles: a focus zoom (or a tall layout) never draws over them,
  // like 2D's overflow-hidden diagram box.
  style: {position: 'absolute', inset: 0, clipPath: 'inset(222px 0 172px 0)'} as React.CSSProperties,
};

// ---------------------------------------------------------------- shared atoms for every 3D visual

export const PX = 160;   // texture pixels per world unit (before the 2x backing)
export type Vec3 = [number, number, number];

/** Wraps `text` into lines no wider than maxW at the current ctx.font. Breaks on spaces; one run per line (bidi-safe). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

export type CardSpec = {
  w: number; h: number;            // face size in world units
  fill: string;
  kicker?: string;                 // small mono tag above the title
  title?: string; titleSize?: number;   // px at PX scale; shrinks to fit
  sub?: string; subSize?: number;
  lines?: string[]; lineSize?: number;  // list lines (mono when `mono`)
  mono?: boolean;
  align?: 'start' | 'center';
  rtl?: boolean;
  pad?: number;                    // px
};

/** Draws a card face: kicker, title (wrapped, shrunk to fit), sub, lines. Text colour follows the fill. */
export function cardTexture(s: CardSpec, th?: ThemeDef): THREE.CanvasTexture {
  const W = Math.round(s.w * PX), H = Math.round(s.h * PX);
  const pad = s.pad ?? 36;
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = s.fill; ctx.fillRect(0, 0, W, H);
    if (th?.isAnime) {
      // Crisp cel specular top highlight ribbon
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fillRect(0, 0, W, Math.max(10, Math.round(H * 0.1)));
      // Hard-edged diagonal cel shadow wedge on bottom-right
      ctx.fillStyle = 'rgba(42, 38, 88, 0.11)';
      ctx.beginPath();
      ctx.moveTo(W * 0.72, H);
      ctx.lineTo(W, H * 0.36);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // Subtle cel halftone dots inside bottom-right shadow corner
      ctx.fillStyle = 'rgba(42, 38, 88, 0.12)';
      for (let gx = Math.round(W * 0.8); gx < W - 8; gx += 16) {
        for (let gy = Math.round(H * 0.62); gy < H - 8; gy += 16) {
          ctx.beginPath();
          ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.direction = s.rtl ? 'rtl' : 'ltr';
    const center = s.align === 'center';
    ctx.textAlign = center ? 'center' : s.rtl ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    const x = center ? W / 2 : s.rtl ? W - pad : pad;
    const maxW = W - pad * 2;
    const ink = (th ?? getTheme()).onAccent(s.fill);
    // measure the whole block first, shrinking the title until everything fits
    type Row = {text: string; font: string; size: number; color: string; gap: number; alpha?: number};
    let scale = 1;
    let rows: Row[] = [];
    for (let tries = 0; tries < 12; tries++) {
      rows = [];
      if (s.kicker) rows.push({text: s.kicker, font: `700 ${Math.round(26 * scale)}px ${MONO}`, size: 26 * scale, color: ink, gap: 14 * scale, alpha: 0.7});
      if (s.title) {
        const size = (s.titleSize ?? 56) * scale; ctx.font = `700 ${size}px ${FONT}`;
        for (const t of wrapText(ctx, s.title, maxW)) rows.push({text: t, font: ctx.font, size, color: ink, gap: size * 0.18});
      }
      if (s.sub) {
        const size = (s.subSize ?? 32) * scale; ctx.font = `400 ${size}px ${FONT}`;
        wrapText(ctx, s.sub, maxW).forEach((t) => rows.push({text: t, font: ctx.font, size, color: ink, gap: size * 0.25, alpha: 0.8}));
      }
      for (const l of s.lines ?? []) {
        const size = (s.lineSize ?? 30) * scale; ctx.font = `${s.mono ? 400 : 500} ${size}px ${s.mono ? MONO : FONT}`;
        for (const t of wrapText(ctx, l, maxW)) rows.push({text: t, font: ctx.font, size, color: ink, gap: size * 0.35});
      }
      const total = rows.reduce((a, r) => a + r.size * 1.12 + r.gap, 0);
      const widest = Math.max(0, ...rows.map((r) => { ctx.font = r.font; return ctx.measureText(r.text).width; }));
      if (total <= H - pad * 1.4 && widest <= maxW) break;
      scale *= 0.9;
    }
    const total = rows.reduce((a, r) => a + r.size * 1.12 + r.gap, 0);
    let y = (H - total) / 2;
    for (const r of rows) {
      y += r.size;
      ctx.font = r.font; ctx.fillStyle = r.color; ctx.globalAlpha = r.alpha ?? 1;
      ctx.fillText(r.text, x, y, maxW);
      y += r.size * 0.12 + r.gap;
    }
    ctx.globalAlpha = 1;
  });
}

function cardSpecsEqual(a: CardSpec[], b: CardSpec[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.w !== y.w || x.h !== y.h || x.fill !== y.fill || x.kicker !== y.kicker ||
      x.title !== y.title || x.titleSize !== y.titleSize || x.sub !== y.sub || x.subSize !== y.subSize ||
      x.lineSize !== y.lineSize || x.mono !== y.mono || x.align !== y.align || x.rtl !== y.rtl || x.pad !== y.pad
    ) return false;
    const lx = x.lines, ly = y.lines;
    if (lx !== ly) {
      if (!lx || !ly || lx.length !== ly.length) return false;
      for (let j = 0; j < lx.length; j++) if (lx[j] !== ly[j]) return false;
    }
  }
  return true;
}

/** Textures for a list of card specs, made once fonts are ready and disposed on change. Null until then. */
export function useCardTextures(specs: CardSpec[]): THREE.CanvasTexture[] | null {
  const ready = useFontsReady();
  const th = useTheme();
  const specRef = React.useRef<{theme: string; specs: CardSpec[]; ver: number} | null>(null);
  if (!specRef.current || specRef.current.theme !== th.name || !cardSpecsEqual(specRef.current.specs, specs)) {
    specRef.current = {theme: th.name, specs, ver: (specRef.current?.ver ?? 0) + 1};
  }
  const ver = specRef.current.ver;
  const tex = React.useMemo(() => (ready ? specs.map((s) => cardTexture(s, th)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, ver]);
  React.useEffect(() => () => tex?.forEach((t) => t.dispose()), [tex]);
  return tex;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);

/** A straight ink beam from a to b, grown by p (0..1), optional cone arrowhead at b, dashed for replies. */
export const Beam3D: React.FC<{a: Vec3; b: Vec3; p?: number; arrow?: boolean; dashed?: boolean; thick?: number; color?: string}> = ({a, b, p = 1, arrow = true, dashed, thick = 0.12, color}) => {
  const th = useTheme();
  const col = color ?? th.C.ink;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const full = dir.length() - (arrow ? 0.4 : 0);
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(X_AXIS, dir);
  const shown = Math.max(0, full * Math.min(1, p));
  const pieces: [number, number][] = [];
  if (dashed) for (let s = 0; s < shown; s += 0.6) pieces.push([s, Math.min(s + 0.36, shown)]);
  else pieces.push([0, shown]);
  if (shown <= 0.001) return null;
  return (
    <group position={a} quaternion={q}>
      {pieces.map(([s, e], k) => (
        <mesh key={k} position={[(s + e) / 2, 0, 0]}>
          <boxGeometry args={[Math.max(e - s, 0.001), thick, thick]} />
          <Mat color={col} />
        </mesh>
      ))}
      {arrow && p >= 0.98 && (
        <mesh position={[full + 0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[thick * 2, 0.42, 4]} />
          <Mat color={col} />
        </mesh>
      )}
    </group>
  );
};

/** Dots travelling a -> b, looping every `period` frames from frame `from`. */
export const Dots3D: React.FC<{a: Vec3; b: Vec3; frame: number; from: number; color: string; count?: number; period?: number; r?: number}> = ({a, b, frame, from, color, count = 2, period = 45, r = 0.17}) => {
  if (frame < from) return null;
  const t = ((frame - from) % period) / period;
  return (
    <group>
      {Array.from({length: count}, (_, k) => {
        const u = 0.06 + ((t + k / count) % 1) * 0.84;
        return (
          <mesh key={k} position={[a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]}>
            <sphereGeometry args={[r, 20, 14]} />
            <Mat color={color} />
          </mesh>
        );
      })}
    </group>
  );
};

const _yAxis = new THREE.Vector3(0, 1, 0);
const _d0 = new THREE.Vector3();
const _center = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _target = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * Camera that frames a world-space box inside the free band of the screen (between the 2D heading and the captions),
 * looking along `dir` (from the target toward the camera). Settles in from slightly wider, then drifts a little.
 * Exact for perspective: the distance is solved so every corner of the box lands inside the band.
 */
const Fit: React.FC<{min: Vec3; max: Vec3; dir: Vec3; frame: number; frames: number; rtl: boolean; drift?: number; fill?: [number, number]; band: Band}> = ({min, max, dir, frame, frames, rtl, drift = 0.05, fill = [0.84, 0.54], band}) => {
  const {camera} = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const settle = interpolate(frame, [0, 36], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3});
  const az = (settle * 0.12 + interpolate(frame, [0, frames], [-drift, drift])) * (rtl ? -1 : 1);
  _d0.set(rtl ? -dir[0] : dir[0], dir[1], dir[2]).normalize().applyAxisAngle(_yAxis, az);
  _center.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  _fwd.copy(_d0);                                           // toward the camera
  _right.crossVectors(_yAxis, _fwd).normalize();
  _up.crossVectors(_fwd, _right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * (1920 / 1080);
  // fraction of the screen the box may use: never taller than the band (minus a margin)
  const FX = fill[0], FY = Math.min(fill[1], (1080 - band.top - band.bottom) / 1080 - 0.03);
  let dist = 1;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    _corner.set(x, y, z).sub(_center);
    const zc = _corner.dot(_fwd);
    dist = Math.max(dist, zc + Math.abs(_corner.dot(_right)) / (tanH * FX), zc + Math.abs(_corner.dot(_up)) / (tanV * FY));
  }
  dist *= 1 + settle * 0.18;
  // centre the content on the band's centre (px below the screen centre; negative = above): aiming the camera up by
  // that much moves the picture down on screen
  const shift = (band.top + 1080 - band.bottom) / 2 - 540;
  _target.copy(_center).addScaledVector(_up, dist * tanV * (shift / 540));
  _pos.copy(_target).addScaledVector(_fwd, dist);
  camera.position.copy(_pos);
  camera.lookAt(_target);
  return null;
};

/**
 * Draws the scene once per commit, synchronously, after the props of everything before it have been applied (it is
 * the last child; layout effects run in order). It re-renders whenever its parent does (a new frame, or textures that
 * arrived), so the canvas always shows the latest committed state when Remotion captures it.
 */
const Draw: React.FC<{frame: number; onDrawn: () => void}> = ({frame, onDrawn}) => {
  const advance = useThree((st) => st.advance);
  React.useLayoutEffect(() => {
    advance(frame / constants.fps);
    onDrawn();
  });
  return null;
};

/** Full-frame 3D stage: canvas + fitted camera. Holds a per-render delayRender until Draw commits and calls advance(). */
export const Stage3D: React.FC<{min: Vec3; max: Vec3; dir?: Vec3; frame: number; frames: number; rtl: boolean; fov?: number; drift?: number; fill?: [number, number]; children: React.ReactNode}> = ({min, max, dir = [0.32, 0.42, 1], frame, frames, rtl, fov = 30, drift, fill, children}) => {
  const band = React.useContext(BandCtx);
  const th = useTheme();
  const pendingRef = React.useRef<{frame: number; handle: number} | null>(null);
  if (!pendingRef.current || pendingRef.current.frame !== frame) {
    if (pendingRef.current) continueRender(pendingRef.current.handle);
    pendingRef.current = {frame, handle: delayRender(`3d-frame-${frame}`)};
  }
  const onDrawn = React.useCallback(() => {
    if (pendingRef.current) {
      const h = pendingRef.current.handle;
      pendingRef.current = null;
      continueRender(h);
    }
  }, []);
  React.useEffect(() => () => {
    if (pendingRef.current) {
      const h = pendingRef.current.handle;
      pendingRef.current = null;
      continueRender(h);
    }
  }, []);
  // clipped to the band: a focus zoom or a tall layout never draws over the heading, caption line or subtitles
  const style = {...CANVAS_PROPS.style, clipPath: `inset(${band.top}px 0 ${band.bottom}px 0)`};
  return (
    <ThreeCanvas {...CANVAS_PROPS} style={style} camera={{fov, near: 0.1, far: 400}}>
      <ThemeContext.Provider value={th}>
        <Fit min={min} max={max} dir={dir} frame={frame} frames={frames} rtl={rtl} drift={drift} fill={fill} band={band} />
        {children}
        <Draw frame={frame} onDrawn={onDrawn} />
      </ThemeContext.Provider>
    </ThreeCanvas>
  );
};

/** Props every 3D visual receives. `at(i, n)`: start frame of item i of n (narration-timed, like 2D). */
export type Visual3DProps<V> = {visual: V; frame: number; frames: number; at: (i: number, n: number) => number; rtl: boolean;
  /** The scene's focus changes (graph, class, sequence) and the lead-in frames before the narration starts. */
  focus?: FocusEvent[]; lead: number; rendered?: MermaidRendered};

// ---------------------------------------------------------------- focus in 3D
// Same timing and ids as 2D (focus.ts). In space: focused parts rise and step toward the camera, the rest dims, and the
// camera moves in on the focused parts when that enlarges them noticeably (like 2D's zoom rule).
export {useFocus, look, partIn, linkIn, type FocusNow} from '../focus';
/** Lift of a focused part, in world units: up and toward the camera. */
export const liftOffset = (lift: number): Vec3 => [0, lift * 0.3, lift * 0.35];

/**
 * The focus state for a 3D diagram, like 2D's useFocus, except that a focus change only starts once something it names
 * is on stage: a focus phrase can be spoken before its part is revealed, and dimming everything around nothing washed
 * the whole scene out. The change is timed from that moment (so it eases in, instead of snapping when the part
 * appears). `shownAt(id)` is the frame a part (id, or "from->to" key) is revealed; Infinity if never.
 */
const FOCUS_FRAMES = 12;
export const focusAt = (events: FocusEvent[] | undefined, lead: number, frame: number, shownAt: (id: string) => number): FocusNow => {
  let prevStart = -Infinity;
  const evs = (events ?? []).map((e) => {
    const on = e.on.length ? new Set(e.on.map((x) => x.replace(/\s+/g, ''))) : null;
    const spoken = lead + Math.round(e.t * constants.fps);
    const open = on ? Math.min(...[...on].map(shownAt)) : spoken;
    const start = Math.max(spoken, open, prevStart);
    prevStart = start;
    return {start, on};
  });
  let k = -1;
  evs.forEach((e, i) => { if (Number.isFinite(e.start) && frame >= e.start) k = i; });
  if (k < 0) return {prev: null, cur: null, p: 1};
  const p = interpolate(frame, [evs[k].start, evs[k].start + FOCUS_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3});
  return {prev: k > 0 ? evs[k - 1].on : null, cur: evs[k].on, p};
};

type Box = [Vec3, Vec3];
const MIN_GAIN = 1.25;      // zoom only when the focused parts get at least this much bigger
const MIN_SHARE = 0.45;     // ...and never closer than this share of the whole diagram's size (keeps context)
const boxFor = (state: Set<string> | null, boxOf: (s: Set<string>) => Box | null, full: Box): Box => {
  if (!state) return full;
  const b = boxOf(state);
  if (!b) return full;
  const [fmin, fmax] = full;
  const min = [...b[0]] as Vec3, max = [...b[1]] as Vec3;
  for (const k of [0, 1] as const) {
    const pad = 0.5, need = (fmax[k] - fmin[k]) * MIN_SHARE, c = (min[k] + max[k]) / 2;
    const half = Math.max((max[k] - min[k]) / 2 + pad, need / 2);
    min[k] = c - half; max[k] = c + half;
  }
  min[2] = fmin[2]; max[2] = fmax[2];
  const gain = Math.min((fmax[0] - fmin[0]) / (max[0] - min[0]), (fmax[1] - fmin[1]) / (max[1] - min[1]));
  return gain < MIN_GAIN ? full : [min, max];
};
/** The box the camera should frame now: the whole diagram, or the focused parts, eased between focus changes. */
export const focusBox = (f: FocusNow, boxOf: (s: Set<string>) => Box | null, full: Box): Box => {
  const a = boxFor(f.prev, boxOf, full), b = boxFor(f.cur, boxOf, full);
  const mix = (x: Vec3, y: Vec3) => x.map((v, i) => v + (y[i] - v) * f.p) as Vec3;
  return [mix(a[0], b[0]), mix(a[1], b[1])];
};
/** Bounding box of a list of boxes (null when empty). */
export const unionBox = (bs: Box[]): Box | null => bs.length
  ? [[0, 1, 2].map((k) => Math.min(...bs.map((b) => b[0][k]))) as Vec3, [0, 1, 2].map((k) => Math.max(...bs.map((b) => b[1][k]))) as Vec3]
  : null;
