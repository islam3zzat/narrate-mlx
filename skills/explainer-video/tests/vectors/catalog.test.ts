import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BUILTIN_CATALOG as CATALOG} from '../../src/visuals/catalog';
import {BUILTIN_CAPABILITIES as CAPABILITIES} from '../../src/visuals/capabilities';
import {BUILTIN_REGISTRY as REGISTRY, describe, lintScene, type BuiltinVisualType as VisualType} from '../../src/visuals/registry';

let checks = 0;

// 1. Exhaustive key coverage: CATALOG must match REGISTRY 1-for-1
const regKeys = Object.keys(REGISTRY).sort();
const catKeys = Object.keys(CATALOG).sort();
assert.deepEqual(catKeys, regKeys, `CATALOG missing types: ${regKeys.filter((k) => !catKeys.includes(k)).join(', ')}`);
checks++;

const publicDir = path.join(process.cwd(), 'catalog-public');
const REMOTION_ID_RE = /^[a-zA-Z0-9-]+$/;
const compIds = new Set<string>();

const registerCompId = (id: string) => {
  assert.match(id, REMOTION_ID_RE, `Invalid Remotion composition ID "${id}" (only [a-zA-Z0-9-]+ allowed)`);
  assert.ok(!compIds.has(id), `Duplicate Remotion composition ID "${id}" across Visual Catalog folders`);
  compIds.add(id);
  checks++;
};

for (const type of regKeys as VisualType[]) {
  registerCompId(type);
  const entry = CATALOG[type];
  assert.equal(entry.type, type, `entry.type mismatch for ${type}`);
  assert.ok(entry.title.trim().length > 0, `empty title for ${type}`);

  const allVariants = [entry.default, ...(entry.variants ?? [])];
  const seenIds = new Set<string>();

  for (const variant of allVariants) {
    assert.ok(!seenIds.has(variant.id), `duplicate variant id "${variant.id}" in ${type}/catalog.ts`);
    seenIds.add(variant.id);
    if (variant !== entry.default) registerCompId(`${type}-${variant.id}`);

    // 2. Schema validation against REGISTRY[type].schema
    const parsed = REGISTRY[type].schema.parse(variant.visual);
    checks++;

    // 3. Semantics reveal computation
    const desc = describe(parsed as any, variant.prev as any, variant.mermaidRendered);
    assert.ok(Array.isArray(desc.slots) && Array.isArray(desc.carried), `invalid describe() output for ${type}/${variant.id}`);
    assert.equal(desc.slots.length, desc.carried.length);
    checks++;

    // 4. Mode capability check
    const mode = variant.mode ?? CAPABILITIES[type].modes[0];
    assert.ok(
      (CAPABILITIES[type].modes as readonly string[]).includes(mode),
      `${type}/${variant.id}: mode "${mode}" is not supported by CAPABILITIES[${type}].modes`,
    );
    checks++;

    // 5. RTL capability check
    if (variant.dir === 'rtl') {
      assert.ok(
        CAPABILITIES[type].rtl === 'yes' || CAPABILITIES[type].rtl === 'warn',
        `${type}/${variant.id} specifies rtl but CAPABILITIES.rtl is unsupported`,
      );
    }

    // 6. Scene-level lint must have zero fatal errors (and check focus targets if provided)
    const sceneLike = {
      id: `${type}-${variant.id}`,
      narration: variant.narration,
      visual: parsed,
      ...(variant.focus?.length
        ? {focus: variant.focus.map((f, idx) => ({at: `cue_${idx}`, on: f.on}))}
        : {}),
    };
    const lint = lintScene(sceneLike, {lang: variant.dir === 'rtl' ? 'ar' : 'en', mode});
    assert.deepEqual(
      lint.errors,
      [],
      `${type}/${variant.id} failed lintScene: ${lint.errors.join('; ')}`,
    );
    checks++;

    // 7. Focus target IDs exist in meta.focusTargets (if declared)
    if (variant.focus?.length) {
      const ft = REGISTRY[type].meta.focusTargets?.(parsed as any);
      if (ft) {
        const known = new Set(ft.ids);
        for (const f of variant.focus) {
          for (const target of f.on) {
            assert.ok(
              known.has(target) || target.includes('->'),
              `${type}/${variant.id}: unknown focus target "${target}" (known: ${[...known].join(', ')})`,
            );
          }
        }
      }
    }

    // 8. Offline public assets must exist on disk inside catalog-public/
    if (variant.mermaidRendered?.svg) {
      assert.ok(
        fs.existsSync(path.join(publicDir, variant.mermaidRendered.svg)),
        `Missing catalog mermaid asset: ${variant.mermaidRendered.svg}`,
      );
    }
    if (variant.figureAsset) {
      assert.ok(
        fs.existsSync(path.join(publicDir, variant.figureAsset)),
        `Missing catalog figure asset: ${variant.figureAsset}`,
      );
    }
    checks++;
  }
}

console.log(`catalog coverage gate: ${regKeys.length} visual types, ${checks} checks passed`);
