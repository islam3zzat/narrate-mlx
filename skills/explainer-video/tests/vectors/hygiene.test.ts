import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import theme from '../../src/theme.json';
import {REGISTRY} from '../../src/visuals/registry';

/**
 * Centralized source hygiene & theme-invariant checks across every visual in REGISTRY
 * plus shared plotting/field helpers. Replaces per-visual regex copy-paste.
 */

const VISUALS_DIR = path.resolve(process.cwd(), 'src/visuals');
const PALETTE = new Set(Object.keys(theme.C));

const FORBIDDEN_APIS = /dangerouslySetInnerHTML|\binnerHTML\b|\buseFrame\b|Math\.random|\beval\b|new Function/;
const COLOR_LITERALS = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;
const HEX_LITERALS = /#[0-9a-fA-F]{3,8}\b/g;

// Ratcheted legacy allowlists: every entry must have >= 1 match and <= the recorded cap.
// Shrink counts as legacy views are refactored; failing at 0 forces pruning stale allowlist entries.
const LEGACY_USE_CURRENT_FRAME = new Set([
  'mermaid/View2D.tsx',
  'sequence/View2D.tsx',
]);

const LEGACY_COLOR_LITERAL_CAPS: Record<string, number> = {
  'title/View2D.tsx': 1,     // drop shadow rgba(...)
  'title/View3D.tsx': 1,     // canvas card overlay rgba(...)
  'compare/View3D.tsx': 2,   // canvas card overlay rgba(...)
  'callout/View3D.tsx': 8,   // floor spotlight discs #hex
  'graph/View3D.tsx': 3,     // canvas overlay rgba(...) + alternating terrace #hex
  'sequence/View3D.tsx': 1,  // canvas card overlay rgba(...)
};

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SHARED_HELPERS = [
  {label: 'src/plot-svg.tsx', file: path.resolve(process.cwd(), 'src/plot-svg.tsx'), checkCurrentFrame: true},
  {label: 'visuals/field2d/ScalarView.tsx', file: path.join(VISUALS_DIR, 'field2d/ScalarView.tsx'), checkCurrentFrame: true},
  {label: 'visuals/field2d/VectorView.tsx', file: path.join(VISUALS_DIR, 'field2d/VectorView.tsx'), checkCurrentFrame: true},
  {label: 'visuals/field2d/particles.ts', file: path.join(VISUALS_DIR, 'field2d/particles.ts'), checkCurrentFrame: true},
];

let checks = 0;
function checkSource(label: string, file: string, isView2D: boolean): void {
  const raw = fs.readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const noUrlHash = code.replace(/url\(#/g, '');

  checks++;
  assert.ok(!FORBIDDEN_APIS.test(code), `${label}: contains forbidden API (${FORBIDDEN_APIS})`);

  checks++;
  const hasCurFrame = /\buseCurrentFrame\b/.test(code);
  if (LEGACY_USE_CURRENT_FRAME.has(label)) {
    assert.ok(hasCurFrame, `${label}: listed in LEGACY_USE_CURRENT_FRAME but no longer calls useCurrentFrame (prune allowlist)`);
  } else {
    assert.ok(!hasCurFrame, `${label}: must take frame via props instead of calling useCurrentFrame()`);
  }

  checks++;
  const badPalette = [...code.matchAll(/\bC\.(\w+)/g)]
    .map((m) => m[1])
    .filter((k) => !PALETTE.has(k));
  assert.deepEqual(badPalette, [], `${label}: references unknown theme.C key(s): ${badPalette.join(', ')}`);

  if (isView2D) {
    checks++;
    const hexHits = noUrlHash.match(HEX_LITERALS) ?? [];
    assert.deepEqual(hexHits, [], `${label}: View2D.tsx must not contain raw hex colors (${hexHits.join(', ')})`);
  }

  checks++;
  const colorHits = noUrlHash.match(COLOR_LITERALS) ?? [];
  if (label in LEGACY_COLOR_LITERAL_CAPS) {
    const cap = LEGACY_COLOR_LITERAL_CAPS[label];
    assert.ok(colorHits.length >= 1, `${label}: allowlisted for ${cap} color literal(s) but found 0 (prune allowlist)`);
    assert.ok(colorHits.length <= cap, `${label}: color literal count grew (${colorHits.length} > cap ${cap})`);
  } else {
    assert.deepEqual(colorHits, [], `${label}: contains raw color literal(s): ${colorHits.join(', ')}`);
  }
}

const visualTypes = Object.keys(REGISTRY);
for (const typeName of visualTypes) {
  let viewCount = 0;
  for (const viewFile of ['View2D.tsx', 'View3D.tsx']) {
    const full = path.join(VISUALS_DIR, typeName, viewFile);
    if (!fs.existsSync(full)) continue;
    viewCount++;
    checkSource(`${typeName}/${viewFile}`, full, viewFile === 'View2D.tsx');
  }
  checks++;
  assert.ok(viewCount > 0, `${typeName}: expected at least View2D.tsx or View3D.tsx`);
}

for (const helper of SHARED_HELPERS) {
  checkSource(helper.label, helper.file, true);
}

console.log(`hygiene checks: ${checks}/${checks} passed across ${visualTypes.length} visual types`);
