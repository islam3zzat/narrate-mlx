// Exhaustive compile-time catalog registry of every visual construct (`Record<VisualType, CatalogEntry<...>>`).
// Adding any visual type to VisualType fails `tsc --noEmit` until its `catalog.ts` is added here.
// Must NOT import React, Remotion, or Three (checked by test_semantics.py).
import type {VisualType} from './registry';
import type {CatalogEntry} from './catalog-types';
import {catalog as layers3d} from './layers3d/catalog';
import {catalog as title} from './title/catalog';
import {catalog as bullets} from './bullets/catalog';
import {catalog as compare} from './compare/catalog';
import {catalog as steps} from './steps/catalog';
import {catalog as flow} from './flow/catalog';
import {catalog as fanout} from './fanout/catalog';
import {catalog as table} from './table/catalog';
import {catalog as callout} from './callout/catalog';
import {catalog as mermaid} from './mermaid/catalog';
import {catalog as graph} from './graph/catalog';
import {catalog as sequence} from './sequence/catalog';
import {catalog as class_} from './class/catalog';
import {catalog as svg} from './svg/catalog';
import {catalog as timeline} from './timeline/catalog';
import {catalog as code} from './code/catalog';
import {catalog as stat} from './stat/catalog';
import {catalog as plot2d} from './plot2d/catalog';
import {catalog as linkedPlot} from './linked-plot/catalog';
import {catalog as cancellationGrid} from './cancellation-grid/catalog';
import {catalog as field2d} from './field2d/catalog';
import {catalog as surface3d} from './surface3d/catalog';
import {catalog as chart} from './chart/catalog';
import {catalog as ablation} from './ablation/catalog';
import {catalog as matrix} from './matrix/catalog';
import {catalog as equation} from './equation/catalog';
import {catalog as figure} from './figure/catalog';

export type CatalogMap = {[K in VisualType]: CatalogEntry<K>};

export const CATALOG: CatalogMap = {
  layers3d,
  title,
  bullets,
  compare,
  steps,
  flow,
  fanout,
  table,
  callout,
  mermaid,
  graph,
  sequence,
  class: class_,
  svg,
  timeline,
  code,
  stat,
  plot2d,
  'linked-plot': linkedPlot,
  'cancellation-grid': cancellationGrid,
  field2d,
  surface3d,
  chart,
  ablation,
  matrix,
  equation,
  figure,
};

export type AnyCatalogEntry = CatalogEntry<VisualType>;
