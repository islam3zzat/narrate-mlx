import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {lintSharedSources, lintVisualDir} from '../../src/visual-lint';

let checks = 0;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-lint-test-'));
try {
  // 1. Seeded violations across sibling .ts helper, sibling .tsx helper, and pure compute.ts
  const badRoot = path.join(tmp, 'bad', 'src');
  const badVisuals = path.join(badRoot, 'visuals');
  const badDir = path.join(badVisuals, 'bad-algo');
  fs.mkdirSync(badDir, {recursive: true});

  fs.writeFileSync(
    path.join(badDir, 'capabilities.ts'),
    "export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'yes'} as const;\n",
  );
  fs.writeFileSync(
    path.join(badDir, 'compute.ts'),
    [
      "import {Heading} from '../../sdk/view2d';",
      'export const r = Math.random();',
      'export const t = Date.now();',
      'export const fmt = new Intl.NumberFormat();',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(badDir, 'helper.tsx'),
    [
      'import React from "react";',
      'export const BadHelper = () => (',
      '  <svg>',
      '    <defs><clipPath id="fixed-clip" /></defs>',
      '    <text fontSize={180} fill="#ff00aa">hi</text>',
      '    <div style={{transition: "all 0.2s"}}>https://evil.test</div>',
      '  </svg>',
      ');',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(badDir, 'View2D.tsx'),
    'import React from "react";\nexport const View2D = () => <div />;\n',
  );

  const res = lintVisualDir(badVisuals, 'bad-algo', badRoot);
  const rules = new Set(res.violations.map((v) => v.rule));
  for (const expectedRule of [
    'pure-boundary',
    'forbidden-api',
    'no-static-svg-id',
    'no-large-font',
    'no-raw-colors',
    'no-css-animation',
    'no-external-urls',
  ]) {
    assert.ok(rules.has(expectedRule), `expected rule ${expectedRule} in [${[...rules].join(', ')}]`);
  }
  checks++;

  // 2. Clean SDK-based visual passes with 0 violations
  const okRoot = path.join(tmp, 'ok', 'src');
  const okVisuals = path.join(okRoot, 'visuals');
  const okDir = path.join(okVisuals, 'good-algo');
  fs.mkdirSync(okDir, {recursive: true});

  fs.writeFileSync(
    path.join(okDir, 'capabilities.ts'),
    "import type {Capabilities} from '../../sdk/pure';\nexport const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'warn'} as const satisfies Capabilities;\n",
  );
  fs.writeFileSync(
    path.join(okDir, 'compute.ts'),
    "import {formatCompactNumber} from '../../sdk/algo-math';\nexport const labelOf = (n: number) => formatCompactNumber(n);\n",
  );
  fs.writeFileSync(
    path.join(okDir, 'View2D.tsx'),
    [
      "import React from 'react';",
      "import {SceneCanvas, useStableId, useTheme} from '../../sdk/view2d';",
      "export const View2D: React.FC<{visual: {heading: string}}> = ({visual}) => {",
      '  const {C} = useTheme();',
      "  const clipId = useStableId('good');",
      '  return <SceneCanvas heading={visual.heading}><svg><defs><clipPath id={clipId} /></defs><rect fill={C.primary} /></svg></SceneCanvas>;',
      '};',
    ].join('\n'),
  );

  const okRes = lintVisualDir(okVisuals, 'good-algo', okRoot);
  assert.deepEqual(okRes.violations, []);
  checks++;

  // 3. lintSharedSources: reduced rule set over non-visual src files
  const mk = (name: string, files: Record<string, string>) => {
    const root = path.join(tmp, name, 'src');
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true});
      fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
  };
  const raf4 = 'export const a = () => { requestAnimationFrame(f); requestAnimationFrame(f); requestAnimationFrame(f); requestAnimationFrame(f); };\n';

  const r1 = lintSharedSources(mk('s1', {'three/common.tsx': 'export const r = Math.random();\n'}), {nodeOnly: []});
  assert.ok(r1.violations.some((v) => v.rule === 'forbidden-api' && v.file === 'src/three/common.tsx' && /Math\.random/.test(v.message)));
  assert.deepEqual(r1.labels, ['src/three/common.tsx']);
  checks++;

  const r2 = lintSharedSources(mk('s2', {
    'flow.tsx': [
      'export const a = useFrame(() => {});',
      'export const b = (el: any) => { el.innerHTML = "x"; };',
      'export const c = eval("1");',
      'export const d = new Function("return 1");',
    ].join('\n'),
  }), {nodeOnly: []});
  assert.ok(r2.violations.length >= 4 && r2.violations.every((v) => v.rule === 'forbidden-api' && v.file === 'src/flow.tsx'));
  checks++;

  const r3 = lintSharedSources(mk('s3', {
    'kit2d.tsx': [
      'import {useCurrentFrame} from "remotion";',
      'export const K = () => { const f = useCurrentFrame(); return <svg><text fontSize={200} fill="#ff00aa" style={{transition: "all 1s"}}>https://x.test</text><clipPath id="c" /></svg>; };',
    ].join('\n'),
  }), {nodeOnly: []});
  assert.deepEqual(r3.violations, []);
  checks++;

  const r4 = lintSharedSources(
    mk('s4', {'focus.ts': 'import fs from "node:fs";\nexport const x = fs;\n', 'cli.ts': 'import fs from "node:fs";\nexport const y = fs;\n'}),
    {nodeOnly: ['cli.ts']},
  );
  assert.deepEqual(r4.violations.map((v) => [v.file, v.rule]), [['src/focus.ts', 'no-node-imports']]);
  assert.deepEqual(r4.labels, ['src/focus.ts']);
  checks++;

  const r5 = lintSharedSources(mk('s5', {'three/common.tsx': raf4}), {nodeOnly: []});
  assert.deepEqual(r5.violations, []);
  const r6 = lintSharedSources(mk('s6', {'three/common.tsx': raf4 + 'export const e = () => requestAnimationFrame(f);\n'}), {nodeOnly: []});
  assert.ok(r6.violations.some((v) => v.rule === 'forbidden-api' && /count grew/.test(v.message)));
  const r7 = lintSharedSources(mk('s7', {'three/common.tsx': 'export const z = 1;\n'}), {nodeOnly: []});
  assert.ok(r7.violations.some((v) => v.rule === 'prune-allowlist' && v.file === 'src/three/common.tsx'));
  checks++;

  // a bundled file may not import a Node-only source (directly, through a subfolder, or as a directory index); type-only imports are erased and fine
  const nodeOnlyFiles = {'voices.ts': 'export const v = 1;\n', 'tools/index.ts': 'export const t = 1;\n'};
  const r8a = lintSharedSources(mk('s8a', {
    ...nodeOnlyFiles,
    'a.ts': 'import {v} from "./voices";\nexport const x = v;\n',
    'sub/b.ts': 'import {v} from "../voices.ts";\nexport {t} from "../tools";\nexport const y = v;\n',
    'sub/c.ts': 'import type {v} from "../voices";\nexport type X = typeof v;\n',
    'd.ts': 'export const z = () => import("./voices");\n',
  }), {nodeOnly: ['voices.ts', 'tools/index.ts']});
  assert.deepEqual(r8a.violations.map((v) => [v.file, v.rule]).sort(), [['src/a.ts', 'no-node-only-import'], ['src/d.ts', 'no-node-only-import'], ['src/sub/b.ts', 'no-node-only-import'], ['src/sub/b.ts', 'no-node-only-import']]);
  assert.deepEqual(lintSharedSources(mk('s8b', {...nodeOnlyFiles, 'a.ts': 'import {v} from "./voices";\nexport const x = v;\n'}), {nodeOnly: []}).violations, [], 'nothing is Node-only when the allowlist is empty');
  checks++;

  const r8 = lintSharedSources(mk('s8', {'ok.ts': 'export const z = 1;\n'}), {nodeOnly: ['gone.ts']});
  assert.ok(r8.violations.some((v) => v.rule === 'prune-allowlist' && v.file === 'src/gone.ts'));
  checks++;

  const r9 = lintSharedSources(mk('s9', {
    'visuals-local/x/View2D.tsx': 'export const r = Math.random();\n',
    'assets.d.ts': 'declare const r: number; export const q = Math.random();\n',
  }), {nodeOnly: []});
  assert.deepEqual(r9, {labels: [], violations: []});
  checks++;
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}

console.log(`visual-lint checks: ${checks}/${checks} passed`);
