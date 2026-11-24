// 3D view of `surface3d`: smooth vertex-colored surface mesh, wireframe grid, partial slices, tangent plane, and Riemann columns/voxels.
import React from 'react';
import * as THREE from 'three';
import {spring, useVideoConfig} from 'remotion';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {mixHex, useTheme} from '../../theme';
import {prog} from '../../kit2d';
import {Beam3D, Mat, REST_GAP, Stage3D, useCardTextures, type CardSpec, type Visual3DProps} from '../../three/common';
import {
  buildSliceCurve,
  buildSurfaceEval,
  buildSurfaceMeshData,
  buildTangentPatch,
  buildVolumeBoxes,
  WORLD_X,
  WORLD_Y,
  WORLD_Z,
  type Surface3DV,
} from './mesh';

const LineOverlay: React.FC<{segments: Float32Array; color: string; width: number}> = ({segments, color, width}) => {
  const obj = React.useMemo(() => {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(segments);
    const mat = new LineMaterial({color: new THREE.Color(color).getHex(), linewidth: width, resolution: new THREE.Vector2(1920, 1080)});
    return new LineSegments2(geo, mat);
  }, [segments, color, width]);
  React.useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  return <primitive object={obj} />;
};

const SurfaceMesh: React.FC<{positions: Float32Array; indices: number[]; elevT: Float32Array}> = ({positions, indices, elevT}) => {
  const {C} = useTheme();
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(indices);
    const colors = new Float32Array(elevT.length * 3);
    const c = new THREE.Color();
    for (let i = 0; i < elevT.length; i++) {
      const t = elevT[i];
      const hex = t < 0.5
        ? mixHex(C.accent, C.primary, t * 2)
        : mixHex(C.primary, C.secondary, (t - 0.5) * 2);
      c.set(hex); // converts sRGB hex -> linear working space for Three.js color management
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [positions, indices, elevT, C.accent, C.primary, C.secondary]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <Mat vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
};

const TangentQuad: React.FC<{positions: Float32Array; color: string}> = ({positions, color}) => {
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  }, [positions]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <Mat color={color} side={THREE.DoubleSide} transparent opacity={0.44} depthWrite={false} />
    </mesh>
  );
};

const SliceOverlayView: React.FC<{
  surf: ReturnType<typeof buildSurfaceEval>;
  axis: 'x' | 'y';
  atVal: number;
  color: string;
}> = ({surf, axis, atVal, color}) => {
  const sl = React.useMemo(() => buildSliceCurve(surf, axis, atVal), [surf, axis, atVal]);
  return (
    <group>
      <mesh position={sl.planePos} rotation={[0, sl.planeRotY, 0]}>
        <planeGeometry args={sl.planeSize} />
        <Mat color={color} side={THREE.DoubleSide} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <LineOverlay segments={sl.curveSegments} color={color} width={5.5} />
    </group>
  );
};

const TangentOverlayView: React.FC<{
  surf: ReturnType<typeof buildSurfaceEval>;
  atPt: readonly [number, number];
  size: number;
  p: number;
  patchColor: string;
  dotColor: string;
}> = ({surf, atPt, size, p, patchColor, dotColor}) => {
  const tp = React.useMemo(() => buildTangentPatch(surf, atPt, size), [surf, atPt[0], atPt[1], size]);
  return (
    <group>
      <TangentQuad positions={tp.positions} color={patchColor} />
      <mesh position={tp.contact}>
        <sphereGeometry args={[0.14, 18, 14]} />
        <Mat color={dotColor} />
      </mesh>
      <Beam3D a={tp.contact} b={tp.normalTip} p={p} arrow thick={0.08} color={patchColor} />
    </group>
  );
};

const ColumnsOverlayView: React.FC<{
  surf: ReturnType<typeof buildSurfaceEval>;
  nx: number;
  ny: number;
  nz: number;
  xRange?: readonly [number, number];
  yRange?: readonly [number, number];
  mode: 'columns' | 'voxels';
  drop: number;
  baseCol: string;
  topCol: string;
}> = ({surf, nx, ny, nz, xRange, yRange, mode, drop, baseCol, topCol}) => {
  const boxes = React.useMemo(
    () => buildVolumeBoxes(surf, nx, ny, nz, xRange, yRange, mode),
    [surf, nx, ny, nz, xRange?.[0], xRange?.[1], yRange?.[0], yRange?.[1], mode],
  );
  if (drop < 0.05) return null;
  return (
    <group>
      {boxes.map((b, bi) => {
        const col = mixHex(baseCol, topCol, b.t);
        const bottomY = b.pos[1] - b.size[1] / 2;
        const hScaled = b.size[1] * drop;
        const yPos = bottomY * drop + hScaled / 2 + REST_GAP;
        return (
          <mesh key={bi} position={[b.pos[0], yPos, b.pos[2]]}>
            <boxGeometry args={[b.size[0], hScaled, b.size[2]]} />
            <Mat color={col} />
          </mesh>
        );
      })}
    </group>
  );
};

export const View3D: React.FC<Visual3DProps<Surface3DV>> = ({visual: v, frame, frames, at, rtl}) => {
  const {C} = useTheme();
  const {fps} = useVideoConfig();

  const surf = React.useMemo(() => buildSurfaceEval(v), [v]);
  const mesh = React.useMemo(() => buildSurfaceMeshData(v, surf), [v, surf]);

  const axisSpecs: CardSpec[] = React.useMemo(() => [
    {w: 1.4, h: 0.45, fill: C.panel, title: v.xLabel ?? 'x', titleSize: 42, align: 'center', pad: 8},
    {w: 1.4, h: 0.45, fill: C.panel, title: v.yLabel ?? 'y', titleSize: 42, align: 'center', pad: 8},
    {w: 1.4, h: 0.45, fill: C.panel, title: v.zLabel ?? 'z', titleSize: 42, align: 'center', pad: 8},
  ], [C.panel, v.xLabel, v.yLabel, v.zLabel]);
  const axisTex = useCardTextures(axisSpecs);

  const overlays = v.overlays ?? [];
  const rise = Math.min(1, spring({frame: frame - 4, fps, config: {damping: 16, stiffness: 120}}));

  return (
    <Stage3D
      min={[-WORLD_X * 0.55, -0.3, -WORLD_Z * 0.58]}
      max={[WORLD_X * 0.58, WORLD_Y + 0.65, WORLD_Z * 0.58]}
      dir={[0.68, 0.55, 0.92]}
      frame={frame}
      frames={frames}
      rtl={rtl}
    >
      {/* Base coordinate floor slab */}
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[WORLD_X + 0.4, 0.12, WORLD_Z + 0.4]} />
        <Mat color={C.muted} />
      </mesh>
      {/* Coordinate axes along the front-left corner */}
      <Beam3D a={[-WORLD_X * 0.5, 0, WORLD_Z * 0.5]} b={[WORLD_X * 0.55, 0, WORLD_Z * 0.5]} arrow thick={0.07} color={C.ink} />
      <Beam3D a={[-WORLD_X * 0.5, 0, WORLD_Z * 0.5]} b={[-WORLD_X * 0.5, 0, -WORLD_Z * 0.55]} arrow thick={0.07} color={C.ink} />
      <Beam3D a={[-WORLD_X * 0.5, 0, WORLD_Z * 0.5]} b={[-WORLD_X * 0.5, WORLD_Y + 0.4, WORLD_Z * 0.5]} arrow thick={0.07} color={C.ink} />

      {axisTex && (
        <group>
          <mesh position={[WORLD_X * 0.56, 0.28, WORLD_Z * 0.52]}>
            <planeGeometry args={[1.4, 0.45]} />
            <Mat map={axisTex[0]} />
          </mesh>
          <mesh position={[-WORLD_X * 0.56, 0.28, -WORLD_Z * 0.54]}>
            <planeGeometry args={[1.4, 0.45]} />
            <Mat map={axisTex[1]} />
          </mesh>
          <mesh position={[-WORLD_X * 0.54, WORLD_Y + 0.56, WORLD_Z * 0.5]}>
            <planeGeometry args={[1.4, 0.45]} />
            <Mat map={axisTex[2]} />
          </mesh>
        </group>
      )}

      {/* Main smooth surface mesh + crisp wireframe grid (+ surface-locked slice & tangent overlays) */}
      {rise > 0.001 && (
        <group scale={[1, rise, 1]}>
          <SurfaceMesh positions={mesh.positions} indices={mesh.indices} elevT={mesh.elevT} />
          <LineOverlay segments={mesh.gridLines} color={C.ink} width={2.2} />
          {overlays.map((ov, oi) => {
            const start = at(oi, overlays.length);
            const p = prog(frame, start, 18);
            if (p <= 0.01) return null;
            if (ov.kind === 'slice') {
              return <SliceOverlayView key={`slice-${oi}`} surf={surf} axis={ov.axis} atVal={ov.at} color={C.danger} />;
            }
            if (ov.kind === 'tangent') {
              return (
                <TangentOverlayView
                  key={`tangent-${oi}`}
                  surf={surf}
                  atPt={ov.at}
                  size={ov.size ?? 1.15}
                  p={p}
                  patchColor={C.secondary}
                  dotColor={C.primary}
                />
              );
            }
            return null;
          })}
        </group>
      )}

      {/* Volume integration columns/voxels */}
      {overlays.map((ov, oi) => {
        if (ov.kind !== 'columns') return null;
        const start = at(oi, overlays.length);
        const p = prog(frame, start, 18);
        if (p <= 0.01) return null;
        const drop = Math.min(1, spring({frame: frame - start, fps, config: {damping: 15, stiffness: 130}}));
        return (
          <ColumnsOverlayView
            key={`cols-${oi}`}
            surf={surf}
            nx={ov.nx}
            ny={ov.ny}
            nz={ov.nz ?? 3}
            xRange={ov.xRange}
            yRange={ov.yRange}
            mode={ov.mode ?? 'columns'}
            drop={drop}
            baseCol={C.accent}
            topCol={C.primary}
          />
        );
      })}
    </Stage3D>
  );
};
