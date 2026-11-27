import React from 'react';
import {Composition, Folder} from 'remotion';
import constants from './constants.json';
import {CatalogScene, type CatalogSceneProps} from './CatalogScene';
import {CATALOG} from './visuals/catalog';
import {CAPABILITIES} from './visuals/capabilities';
import type {Visual} from './types';
import type {CatalogVariant} from './visuals/catalog-types';
import type {VisualType} from './visuals/registry';

const toProps = <T extends VisualType>(type: T, v: CatalogVariant<T>): CatalogSceneProps => ({
  type,
  variantLabel: v.label,
  theme: v.theme,
  mode: v.mode ?? (CAPABILITIES[type].modes[0] as '2d' | '3d'),
  dir: v.dir ?? 'ltr',
  visual: v.visual as Visual,
  narration: v.narration,
  focus: v.focus,
  mermaidRendered: v.mermaidRendered,
  figureAsset: v.figureAsset,
  prev: v.prev as Visual | undefined,
});

const ORDERED_TYPES = Object.keys(CATALOG) as VisualType[];

export const CatalogRoot: React.FC = () => (
  <>
    <Folder name="Visual-Catalog">
      {ORDERED_TYPES.map((type) => {
        const entry = CATALOG[type];
        const v = entry.default;
        const frames = Math.round((v.durationSec ?? 8) * constants.fps);
        return (
          <Composition
            key={type}
            id={type}
            component={CatalogScene}
            durationInFrames={frames}
            fps={constants.fps}
            width={1920}
            height={1080}
            defaultProps={toProps(type, v as CatalogVariant<typeof type>)}
          />
        );
      })}
    </Folder>
    <Folder name="Showcase-Variants">
      {ORDERED_TYPES.flatMap((type) => {
        const entry = CATALOG[type];
        return (entry.variants ?? []).map((v) => {
          const frames = Math.round((v.durationSec ?? 8) * constants.fps);
          return (
            <Composition
              key={`${type}-${v.id}`}
              id={`${type}-${v.id}`}
              component={CatalogScene}
              durationInFrames={frames}
              fps={constants.fps}
              width={1920}
              height={1080}
              defaultProps={toProps(type, v as CatalogVariant<typeof type>)}
            />
          );
        });
      })}
    </Folder>
  </>
);
