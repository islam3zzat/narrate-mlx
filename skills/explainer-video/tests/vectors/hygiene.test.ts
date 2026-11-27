import assert from 'node:assert/strict';
import path from 'node:path';
import {lintAllVisuals, NODE_ONLY_SOURCES} from '../../src/visual-lint';

/**
 * Centralized AST source hygiene & theme-invariant checks across every visual file
 * in REGISTRY (views + sibling helpers), shared SDK/plotting helpers, and every other
 * render-bundled src/** file (reduced rule set; Node-only files are allowlisted).
 */
const {checkedFiles, visualCount, sharedFiles, checkedLabels, violations} = lintAllVisuals(path.resolve(process.cwd(), 'src'));

assert.deepEqual(
  violations,
  [],
  `Visual hygiene violations:\n${violations.map((v) => `  ${v.file}:${v.line} [${v.rule}] ${v.message}`).join('\n')}`,
);

for (const must of [
  'src/three/common.tsx', 'src/flow.tsx', 'src/kit2d.tsx', 'src/focus.ts', 'src/continuity.ts', 'src/SceneChrome.tsx',
  'src/three/cards-kit.tsx', 'src/three/process-kit.tsx', 'src/three/diagram-kit.tsx',
]) {
  assert.ok(checkedLabels.includes(must), `${must} must be covered by the hygiene lint`);
}
for (const node of NODE_ONLY_SOURCES) {
  assert.ok(!checkedLabels.includes(`src/${node}`), `Node-only ${node} must not be linted as a render source`);
}

console.log(`hygiene checks: ${checkedFiles} files passed across ${visualCount} visual types (${sharedFiles} shared src files)`);
