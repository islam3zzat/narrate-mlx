// The rendering list: each visual type's 2D and 3D view. SceneBody (visuals.tsx) and Scene3D (three/Scene3D.tsx) look
// their component up here. The pure list (registry.ts) has the schema and semantics. This is the only place that
// imports the views, so a type that has none fails to compile once the Record is exhaustive.
// Heavy dependencies (Three.js 3D views, shiki, katex, @xyflow/react, dagre, field/plot/svg) are lazy-loaded via
// React.lazy + Remotion delayRender so tabs only parse/load the chunks needed for their active scene.
import React from 'react';
import {continueRender, delayRender} from 'remotion';
import type {Visual} from '../types';
import type {Visual3DProps} from '../three/common';
import type {VisualType} from './registry';
import type {View2DProps} from './props';

export function lazyView<P extends Record<string, any>>(
  loader: () => Promise<{default: React.FC<P>}>,
  label: string,
): React.FC<P> {
  const Comp = React.lazy(() => {
    const handle = delayRender(`lazy:${label}`);
    return loader().finally(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => continueRender(handle)));
    });
  }) as React.ComponentType<any>;
  return (props: P) => (
    <React.Suspense fallback={null}>
      <Comp {...props} />
    </React.Suspense>
  );
}

// Lightweight 2D views kept eager in main bundle
import {View2D as Title2D} from './title/View2D';
import {View2D as Callout2D} from './callout/View2D';
import {View2D as Bullets2D} from './bullets/View2D';
import {View2D as Steps2D} from './steps/View2D';
import {View2D as Compare2D} from './compare/View2D';
import {View2D as Table2D} from './table/View2D';
import {View2D as Flow2D} from './flow/View2D';
import {View2D as Fanout2D} from './fanout/View2D';
import {View2D as Timeline2D} from './timeline/View2D';
import {View2D as Stat2D} from './stat/View2D';
import {View2D as Chart2D} from './chart/View2D';
import {View2D as Ablation2D} from './ablation/View2D';
import {View2D as Matrix2D} from './matrix/View2D';
import {View2D as Figure2D} from './figure/View2D';
import {View2D as Graph2D} from './graph/View2D';
import {View2D as Class2D} from './class/View2D';
import {View2D as Sequence2D} from './sequence/View2D';

// Heavy 2D views code-split on demand
const Svg2D = lazyView<View2DProps<'svg'>>(() => import('./svg/View2D').then((m) => ({default: m.View2D})), 'svg-2d');
const Code2D = lazyView<View2DProps<'code'>>(() => import('./code/View2D').then((m) => ({default: m.View2D})), 'code-2d');
const Plot2d2D = lazyView<View2DProps<'plot2d'>>(() => import('./plot2d/View2D').then((m) => ({default: m.View2D})), 'plot2d-2d');
const LinkedPlot2D = lazyView<View2DProps<'linked-plot'>>(() => import('./linked-plot/View2D').then((m) => ({default: m.View2D})), 'linked-plot-2d');
const CancellationGrid2D = lazyView<View2DProps<'cancellation-grid'>>(() => import('./cancellation-grid/View2D').then((m) => ({default: m.View2D})), 'cancellation-grid-2d');
const Field2d2D = lazyView<View2DProps<'field2d'>>(() => import('./field2d/View2D').then((m) => ({default: m.View2D})), 'field2d-2d');
const Equation2D = lazyView<View2DProps<'equation'>>(() => import('./equation/View2D').then((m) => ({default: m.View2D})), 'equation-2d');
const Mermaid2D = lazyView<View2DProps<'mermaid'>>(() => import('./mermaid/View2D').then((m) => ({default: m.View2D})), 'mermaid-2d');

// 3D views code-split on demand (Three.js + @react-three/fiber never parsed on 2D renders)
const Title3D = lazyView<Visual3DProps<Extract<Visual, {type: 'title'}>>>(() => import('./title/View3D').then((m) => ({default: m.View3D})), 'title-3d');
const Callout3D = lazyView<Visual3DProps<Extract<Visual, {type: 'callout'}>>>(() => import('./callout/View3D').then((m) => ({default: m.View3D})), 'callout-3d');
const Bullets3D = lazyView<Visual3DProps<Extract<Visual, {type: 'bullets'}>>>(() => import('./bullets/View3D').then((m) => ({default: m.View3D})), 'bullets-3d');
const Steps3D = lazyView<Visual3DProps<Extract<Visual, {type: 'steps'}>>>(() => import('./steps/View3D').then((m) => ({default: m.View3D})), 'steps-3d');
const Compare3D = lazyView<Visual3DProps<Extract<Visual, {type: 'compare'}>>>(() => import('./compare/View3D').then((m) => ({default: m.View3D})), 'compare-3d');
const Table3D = lazyView<Visual3DProps<Extract<Visual, {type: 'table'}>>>(() => import('./table/View3D').then((m) => ({default: m.View3D})), 'table-3d');
const Flow3D = lazyView<Visual3DProps<Extract<Visual, {type: 'flow'}>>>(() => import('./flow/View3D').then((m) => ({default: m.View3D})), 'flow-3d');
const Fanout3D = lazyView<Visual3DProps<Extract<Visual, {type: 'fanout'}>>>(() => import('./fanout/View3D').then((m) => ({default: m.View3D})), 'fanout-3d');
const Layers3d3D = lazyView<Visual3DProps<Extract<Visual, {type: 'layers3d'}>>>(() => import('./layers3d/View3D').then((m) => ({default: m.View3D})), 'layers3d-3d');
const Graph3D = lazyView<Visual3DProps<Extract<Visual, {type: 'graph'}>>>(() => import('./graph/View3D').then((m) => ({default: m.View3D})), 'graph-3d');
const Class3D = lazyView<Visual3DProps<Extract<Visual, {type: 'class'}>>>(() => import('./class/View3D').then((m) => ({default: m.View3D})), 'class-3d');
const Sequence3D = lazyView<Visual3DProps<Extract<Visual, {type: 'sequence'}>>>(() => import('./sequence/View3D').then((m) => ({default: m.View3D})), 'sequence-3d');
const Mermaid3D = lazyView<Visual3DProps<Extract<Visual, {type: 'mermaid'}>>>(() => import('./mermaid/View3D').then((m) => ({default: m.View3D})), 'mermaid-3d');
const Surface3d3D = lazyView<Visual3DProps<Extract<Visual, {type: 'surface3d'}>>>(() => import('./surface3d/View3D').then((m) => ({default: m.View3D})), 'surface3d-3d');

type VisualOf<T extends VisualType> = Extract<Visual, {type: T}>;
/** `View2D` is null for a type with no 2D picture of its own (layers3d is 3D only: its 2D overlay is the shared heading and caption);
 *  `View3D` is null for a type that cannot be drawn in 3D (svg is 2D only: the schema rejects it in a 3D script). */
export type ViewSet<T extends VisualType> = {View2D: React.FC<View2DProps<T>> | null; View3D: React.FC<Visual3DProps<VisualOf<T>>> | null};

export const VIEWS: {[T in VisualType]: ViewSet<T>} = {
  title: {View2D: Title2D, View3D: Title3D},
  callout: {View2D: Callout2D, View3D: Callout3D},
  bullets: {View2D: Bullets2D, View3D: Bullets3D},
  steps: {View2D: Steps2D, View3D: Steps3D},
  compare: {View2D: Compare2D, View3D: Compare3D},
  table: {View2D: Table2D, View3D: Table3D},
  flow: {View2D: Flow2D, View3D: Flow3D},
  fanout: {View2D: Fanout2D, View3D: Fanout3D},
  layers3d: {View2D: null, View3D: Layers3d3D},
  graph: {View2D: Graph2D, View3D: Graph3D},
  class: {View2D: Class2D, View3D: Class3D},
  sequence: {View2D: Sequence2D, View3D: Sequence3D},
  mermaid: {View2D: Mermaid2D, View3D: Mermaid3D},
  svg: {View2D: Svg2D, View3D: null},
  timeline: {View2D: Timeline2D, View3D: null},
  code: {View2D: Code2D, View3D: null},
  stat: {View2D: Stat2D, View3D: null},
  plot2d: {View2D: Plot2d2D, View3D: null},
  'linked-plot': {View2D: LinkedPlot2D, View3D: null},
  'cancellation-grid': {View2D: CancellationGrid2D, View3D: null},
  field2d: {View2D: Field2d2D, View3D: null},
  surface3d: {View2D: null, View3D: Surface3d3D},
  chart: {View2D: Chart2D, View3D: null},
  ablation: {View2D: Ablation2D, View3D: null},
  matrix: {View2D: Matrix2D, View3D: null},
  equation: {View2D: Equation2D, View3D: null},
  figure: {View2D: Figure2D, View3D: null},
};

/** The views of a visual's type, typed loosely for the dispatchers (the Record above is checked per type). */
export const viewsOf = (v: Visual) => VIEWS[v.type] as {View2D: React.FC<View2DProps<any>> | null; View3D: React.FC<Visual3DProps<any>> | null};
