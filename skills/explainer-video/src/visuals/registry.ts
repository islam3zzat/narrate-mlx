// The pure list of visual types: schema + semantics + meta for each, with no React, remotion or three behind it
// (cli.ts loads it under plain node; test_semantics checks this). The rendering side is src/visuals/views.tsx.
// Both lists are exhaustive over the visual types, so a type missing from either is a compile error.
import {z} from 'zod';
import type {Visual} from '../types';
import type {Described, Semantics} from '../semantics/types';
import type {FocusTargets, LintCtx, LintResult, Meta} from './meta-types';
import type {ScriptVisual} from '../schema';
import {Layers3DVisual} from './layers3d/schema';
import {TitleVisual} from './title/schema';
import {BulletsVisual} from './bullets/schema';
import {CompareVisual} from './compare/schema';
import {StepsVisual} from './steps/schema';
import {FlowVisual} from './flow/schema';
import {FanoutVisual} from './fanout/schema';
import {TableVisual} from './table/schema';
import {CalloutVisual} from './callout/schema';
import {MermaidVisual} from './mermaid/schema';
import {GraphVisual} from './graph/schema';
import {SequenceVisual} from './sequence/schema';
import {ClassVisual} from './class/schema';
import {SvgVisual} from './svg/schema';
import {TimelineVisual} from './timeline/schema';
import {CodeVisual} from './code/schema';
import {StatVisual} from './stat/schema';
import {Plot2DVisual} from './plot2d/schema';
import {LinkedPlotVisual} from './linked-plot/schema';
import {CancellationGridVisual} from './cancellation-grid/schema';
import {Field2DVisual} from './field2d/schema';
import {Surface3DVisual} from './surface3d/schema';
import {ChartVisual} from './chart/schema';
import {AblationVisual} from './ablation/schema';
import {MatrixVisual} from './matrix/schema';
import {EquationVisual} from './equation/schema';
import {FigureVisual} from './figure/schema';
import {describe as layers3dSem} from './layers3d/semantics';
import {describe as titleSem} from './title/semantics';
import {describe as bulletsSem} from './bullets/semantics';
import {describe as compareSem} from './compare/semantics';
import {describe as stepsSem} from './steps/semantics';
import {describe as flowSem} from './flow/semantics';
import {describe as fanoutSem} from './fanout/semantics';
import {describe as tableSem} from './table/semantics';
import {describe as calloutSem} from './callout/semantics';
import {describe as mermaidSem} from './mermaid/semantics';
import {describe as graphSem} from './graph/semantics';
import {describe as sequenceSem} from './sequence/semantics';
import {describe as classSem} from './class/semantics';
import {describe as svgSem} from './svg/semantics';
import {describe as timelineSem} from './timeline/semantics';
import {describe as codeSem} from './code/semantics';
import {describe as statSem} from './stat/semantics';
import {describe as plot2dSem} from './plot2d/semantics';
import {describe as linkedPlotSem} from './linked-plot/semantics';
import {describe as cancellationGridSem} from './cancellation-grid/semantics';
import {describe as field2dSem} from './field2d/semantics';
import {describe as surface3dSem} from './surface3d/semantics';
import {describe as chartSem} from './chart/semantics';
import {describe as ablationSem} from './ablation/semantics';
import {describe as matrixSem} from './matrix/semantics';
import {describe as equationSem} from './equation/semantics';
import {describe as figureSem} from './figure/semantics';
import {meta as layers3dMeta} from './layers3d/meta';
import {meta as titleMeta} from './title/meta';
import {meta as bulletsMeta} from './bullets/meta';
import {meta as compareMeta} from './compare/meta';
import {meta as stepsMeta} from './steps/meta';
import {meta as flowMeta} from './flow/meta';
import {meta as fanoutMeta} from './fanout/meta';
import {meta as tableMeta} from './table/meta';
import {meta as calloutMeta} from './callout/meta';
import {meta as mermaidMeta} from './mermaid/meta';
import {meta as graphMeta} from './graph/meta';
import {meta as sequenceMeta} from './sequence/meta';
import {meta as classMeta} from './class/meta';
import {meta as svgMeta} from './svg/meta';
import {meta as timelineMeta} from './timeline/meta';
import {meta as codeMeta} from './code/meta';
import {meta as statMeta} from './stat/meta';
import {meta as plot2dMeta} from './plot2d/meta';
import {meta as linkedPlotMeta} from './linked-plot/meta';
import {meta as cancellationGridMeta} from './cancellation-grid/meta';
import {meta as field2dMeta} from './field2d/meta';
import {meta as surface3dMeta} from './surface3d/meta';
import {meta as chartMeta} from './chart/meta';
import {meta as ablationMeta} from './ablation/meta';
import {meta as matrixMeta} from './matrix/meta';
import {meta as equationMeta} from './equation/meta';
import {meta as figureMeta} from './figure/meta';

/** The schema of each type. The order is the order of the JSON Schema's anyOf and of the "Expected ..." error message. */
const SCHEMAS = {
  layers3d: Layers3DVisual, surface3d: Surface3DVisual,
  title: TitleVisual, bullets: BulletsVisual, compare: CompareVisual, steps: StepsVisual, flow: FlowVisual, fanout: FanoutVisual,
  table: TableVisual, callout: CalloutVisual, mermaid: MermaidVisual, graph: GraphVisual, sequence: SequenceVisual, class: ClassVisual, svg: SvgVisual, timeline: TimelineVisual, code: CodeVisual, stat: StatVisual, plot2d: Plot2DVisual, 'linked-plot': LinkedPlotVisual, 'cancellation-grid': CancellationGridVisual, field2d: Field2DVisual, chart: ChartVisual, ablation: AblationVisual, matrix: MatrixVisual, equation: EquationVisual, figure: FigureVisual,
};
type Schemas = (typeof SCHEMAS)[keyof typeof SCHEMAS];

export const VisualSchema = z.discriminatedUnion('type', Object.values(SCHEMAS) as [Schemas, ...Schemas[]])
  .describe('What is drawn in the scene; "type" selects the shape');

export type VisualType = Visual['type'];

export type Entry<T extends VisualType> = {schema: (typeof SCHEMAS)[T]; semantics: Semantics<T>; meta: Meta<T>};
export const REGISTRY: {[T in VisualType]: Entry<T>} = {
  layers3d: {schema: SCHEMAS.layers3d, semantics: layers3dSem, meta: layers3dMeta},
  title: {schema: SCHEMAS.title, semantics: titleSem, meta: titleMeta},
  bullets: {schema: SCHEMAS.bullets, semantics: bulletsSem, meta: bulletsMeta},
  compare: {schema: SCHEMAS.compare, semantics: compareSem, meta: compareMeta},
  steps: {schema: SCHEMAS.steps, semantics: stepsSem, meta: stepsMeta},
  flow: {schema: SCHEMAS.flow, semantics: flowSem, meta: flowMeta},
  fanout: {schema: SCHEMAS.fanout, semantics: fanoutSem, meta: fanoutMeta},
  table: {schema: SCHEMAS.table, semantics: tableSem, meta: tableMeta},
  callout: {schema: SCHEMAS.callout, semantics: calloutSem, meta: calloutMeta},
  mermaid: {schema: SCHEMAS.mermaid, semantics: mermaidSem, meta: mermaidMeta},
  graph: {schema: SCHEMAS.graph, semantics: graphSem, meta: graphMeta},
  sequence: {schema: SCHEMAS.sequence, semantics: sequenceSem, meta: sequenceMeta},
  class: {schema: SCHEMAS.class, semantics: classSem, meta: classMeta},
  svg: {schema: SCHEMAS.svg, semantics: svgSem, meta: svgMeta},
  timeline: {schema: SCHEMAS.timeline, semantics: timelineSem, meta: timelineMeta},
  code: {schema: SCHEMAS.code, semantics: codeSem, meta: codeMeta},
  stat: {schema: SCHEMAS.stat, semantics: statSem, meta: statMeta},
  plot2d: {schema: SCHEMAS.plot2d, semantics: plot2dSem, meta: plot2dMeta},
  'linked-plot': {schema: SCHEMAS['linked-plot'], semantics: linkedPlotSem, meta: linkedPlotMeta},
  'cancellation-grid': {schema: SCHEMAS['cancellation-grid'], semantics: cancellationGridSem, meta: cancellationGridMeta},
  field2d: {schema: SCHEMAS.field2d, semantics: field2dSem, meta: field2dMeta},
  surface3d: {schema: SCHEMAS.surface3d, semantics: surface3dSem, meta: surface3dMeta},
  chart: {schema: SCHEMAS.chart, semantics: chartSem, meta: chartMeta},
  ablation: {schema: SCHEMAS.ablation, semantics: ablationSem, meta: ablationMeta},
  matrix: {schema: SCHEMAS.matrix, semantics: matrixSem, meta: matrixMeta},
  equation: {schema: SCHEMAS.equation, semantics: equationSem, meta: equationMeta},
  figure: {schema: SCHEMAS.figure, semantics: figureSem, meta: figureMeta},
};

export const describe = (visual: Visual, prev?: Visual, rendered?: {layout?: unknown}): Described =>
  (REGISTRY[visual.type].semantics as (v: Visual, p?: Visual, r?: {layout?: unknown}) => Described)(visual, prev, rendered);

/** Style checks of one scene: the type's own lint. Only warns for now (a script that passed the schema must not start failing);
 *  `errors` is for rules a type decides are fatal. What a type supports (focus, continues, 3D) is checked by the schema, from
 *  its capabilities. Messages carry no "video/scene: " prefix. */
export const lintScene = (sc: {visual: ScriptVisual; narration: string}, ctx: Omit<LintCtx, 'narration'>): LintResult => {
  const m = REGISTRY[sc.visual.type].meta as Meta<VisualType>;
  return m.lint(sc.visual as never, {...ctx, narration: sc.narration});
};

/** Focus targets (part ids and optional [from, to] links) for a visual, or null when dynamic/unsupported. */
export const focusTargetsOf = (v: ScriptVisual): FocusTargets | null => {
  const m = REGISTRY[v.type].meta as Meta<VisualType>;
  return m.focusTargets ? m.focusTargets(v as never) : null;
};
