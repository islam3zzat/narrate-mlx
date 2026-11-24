// 3D view of the `steps` visual. Moved from three/Process3D.tsx (Steps3D); see three/common.tsx for the shared pieces.
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import {useTheme} from '../../theme';
import type {ScriptVisual} from '../../schema';
import {Block, Stage3D, useCardTextures, type CardSpec, type Visual3DProps} from '../../three/common';
import {SPRING, clamp01, drop, enter} from '../../three/process-kit';

type StepsV = Extract<ScriptVisual, {type: 'steps'}>;

// ------------------------------------------------------------------ steps
export const View3D: React.FC<Visual3DProps<StepsV>> = ({visual: v, frame, frames, at, rtl}) => {
  const {fps} = useVideoConfig();
  const {C} = useTheme();
  const n = v.items.length;
  const W = n <= 4 ? 4.0 : n <= 6 ? 3.4 : 3.1, GAP = 0.2, D = 1.6, H0 = 1.6, DH = n > 5 ? 0.3 : 0.5;
  const starts = v.items.map((_, i) => at(i, n));
  let current = v.active ?? 0;
  if (v.active === undefined) for (let k = 0; k < n; k++) if (frame >= starts[k]) current = k;
  const hOf = (i: number) => H0 + DH * i;
  const fillOf = (i: number) => (i < current ? C.accent : i === current ? C.primary : C.panel);
  // Every step's three looks (done, active, not yet) are drawn once up front; the frame only picks one. Rebuilding the
  // textures when the active step moved recreated them (and their blocks) mid-scene.
  const STATES = [{fill: C.accent, mark: (_: number) => '✓'}, {fill: C.primary, mark: (i: number) => `${i + 1}`}, {fill: C.panel, mark: (i: number) => `${i + 1}`}];
  const specs: CardSpec[] = v.items.flatMap((t, i) => STATES.map((st) => ({
    w: W, h: hOf(i), fill: st.fill, title: `${st.mark(i)}  ${t}`,
    titleSize: n > 5 ? 50 : 62, align: 'center' as const, rtl, pad: 24,
  })));
  const tex = useCardTextures(specs);
  const texOf = (i: number) => tex![i * 3 + (i < current ? 0 : i === current ? 1 : 2)];
  const xOf = (i: number) => (i - (n - 1) / 2) * (W + GAP) * (rtl ? -1 : 1);
  const liftOf = (i: number) => (i === current ? 0.22 * clamp01(spring({frame: frame - starts[i] - 4, fps, config: SPRING})) : 0);
  const topOf = (i: number) => hOf(i) + liftOf(i);
  const total = n * (W + GAP);

  // marker token: hops from the previous step onto the current one (drops in from above on the first / fixed one)
  const T = 0.7;
  const hopStart = v.active === undefined ? starts[current] : starts[current] + 6;
  const q = clamp01(spring({frame: frame - hopStart, fps, config: {damping: 16, stiffness: 120}}));
  const from = v.active === undefined && current > 0 ? current - 1 : -1;
  const mx = from >= 0 ? xOf(from) + (xOf(current) - xOf(from)) * q : xOf(current);
  const baseY = from >= 0 ? topOf(from) + (topOf(current) - topOf(from)) * q : topOf(current);
  const my = baseY + T / 2 + (from >= 0 ? Math.sin(Math.PI * q) * 1.3 : (1 - q) * 3.5);
  const showMarker = frame >= starts[current] && (from >= 0 || q > 0.01);
  const markerTilt = from >= 0 ? Math.sin(Math.PI * q) * 0.6 * (rtl ? 1 : -1) : 0;

  return (
    <Stage3D min={[-total / 2, 0, -D / 2]} max={[total / 2, hOf(n - 1) + 1.6, D / 2]} dir={[0.16, 0.34, 1]} frame={frame} frames={frames} rtl={rtl}>
      {tex && v.items.map((_, i) => {
        const s = enter(frame, starts[i], fps);
        if (s <= 0.01) return null;
        return (
          <group key={i} position={[xOf(i), hOf(i) / 2 + liftOf(i) + drop(s) * 0.6, 0]}>
            <Block w={W} h={hOf(i)} d={D} fill={fillOf(i)} front={texOf(i)} shadow={0.16} />
          </group>
        );
      })}
      {tex && showMarker && (
        <group position={[mx, my, D / 2 - 0.55]} rotation={[0, 0, markerTilt]}>
          <Block w={T} h={T} d={T} fill={C.secondary} shadow={0.1} />
        </group>
      )}
    </Stage3D>
  );
};
