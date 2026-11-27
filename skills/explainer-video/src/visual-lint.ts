// AST-based visual hygiene & pure-boundary linter (Node-only; uses typescript compiler AST).
// Shared by `tests/vectors/hygiene.test.ts` and `cli.ts lint-visual <slug>`.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import theme from './theme.json';
import {BUILTIN_REGISTRY} from './visuals/registry';

export type LintViolation = {
  file: string;
  line: number;
  rule: string;
  message: string;
};

const PALETTE = new Set(Object.keys(theme.C));
const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[0-9]/g;
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'crypto', 'dgram', 'dns', 'events',
  'fs', 'http', 'http2', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
  'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util',
  'v8', 'vm', 'worker_threads', 'zlib',
]);

const PURE_FILENAMES = new Set([
  'capabilities.ts', 'schema.ts', 'semantics.ts', 'meta.ts', 'catalog.ts', 'compute.ts', 'pure.ts',
]);

const FORBIDDEN_PURE_PKGS = new Set(['react', 'react-dom', 'remotion', 'three']);
const FORBIDDEN_PURE_PREFIXES = ['@remotion/', '@react-three/', '@xyflow/', 'react/', 'react-dom/'];
const FORBIDDEN_PURE_TARGET_RE = /View[23]D|\.tsx$|^src\/(?:visuals|kit2d|flow|focus|continuity|rtl|theme|sdk\/(?:view2d|algo-2d))$/;

const BANNED_DETERMINISM_CALLS = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'fetch']);
const BANNED_GLOBAL_PROPS = new Set(['dangerouslySetInnerHTML', 'innerHTML', 'useFrame']);
const BANNED_LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const BANNED_CSS_ANIM_PROPS = new Set([
  'transition', 'transitionDuration', 'transitionProperty',
  'animation', 'animationName', 'animationDuration',
]);
const SVG_DEF_TAGS = new Set(['clipPath', 'mask', 'marker', 'linearGradient', 'radialGradient', 'pattern']);

export const LEGACY_USE_CURRENT_FRAME = new Set([
  'mermaid/View2D.tsx',
  'sequence/View2D.tsx',
]);

export const LEGACY_COLOR_LITERAL_CAPS: Record<string, number> = {
  'title/View2D.tsx': 1,
  'title/View3D.tsx': 1,
  'compare/View3D.tsx': 2,
  'callout/View3D.tsx': 8,
  'graph/View3D.tsx': 3,
  'sequence/View3D.tsx': 1,
};

export const LEGACY_STATIC_SVG_ID_CAPS: Record<string, number> = {
  'class/View2D.tsx': 4,
};

/** Ratcheted legacy allowlist for Remotion delayRender/staticFile async setup in existing views. */
export const LEGACY_ASYNC_RENDER_CAPS: Record<string, number> = {
  'mermaid/View3D.tsx': 3,
  'equation/View2D.tsx': 3,
};

/**
 * Allowed render holds in shared (non-visual) sources: delayRender/continueRender handshakes
 * (font/texture readiness) and one pre-render data fetch. Not legacy debt; still ratcheted so
 * the count cannot grow silently and stale entries get pruned.
 */
export const RENDER_GATE_ASYNC_CAPS: Record<string, number> = {
  'src/three/common.tsx': 4,
  'src/visuals/lazy-view.tsx': 2,
  'src/theme.ts': 3, // useFontGate: one delayRender + two continueRender (IFA-273)
  'src/Root.tsx': 1,
};

const ASYNC_CAPS: Record<string, number> = {...LEGACY_ASYNC_RENDER_CAPS, ...RENDER_GATE_ASYNC_CAPS};

/** Files under `src/` that only run in Node (never bundled for render) and are exempt from the shared lint. */
export const NODE_ONLY_SOURCES: string[] = [
  'cli.ts', // CLI entry: reads/writes workdirs via node:fs/path
  'gen-visuals.ts', // codegen script: walks src/visuals with node:fs
  'style-files.ts', // style discovery: reads style files from disk
  'visual-lint.ts', // this linter: uses node:fs and the TypeScript compiler API
];

export type LintFileOptions = {
  /** 'visual' (default) applies every rule; 'shared' applies only the determinism/safety subset. */
  scope?: 'visual' | 'shared';
  isView: boolean;
  isView2D: boolean;
  isPureVisualFile: boolean;
  srcRoot?: string;
};

const isPureFile = (filePath: string): boolean => {
  const base = path.basename(filePath);
  return PURE_FILENAMES.has(base) || base.endsWith('-math.ts');
};

const propNameText = (name: ts.PropertyName | ts.JsxAttributeName): string | null => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
};

/** Lint a single TypeScript/TSX file via its AST and return all violations. */
export const lintVisualFile = (label: string, filePath: string, opts: LintFileOptions): LintViolation[] => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const isTsx = filePath.endsWith('.tsx');
  const sf = ts.createSourceFile(filePath, raw, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: LintViolation[] = [];
  const visual = (opts.scope ?? 'visual') === 'visual';
  const lineAt = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const add = (node: ts.Node, rule: string, message: string) =>
    violations.push({file: label, line: lineAt(node), rule, message});

  let useCurrentFrameHits = 0;
  let colorLiteralCount = 0;
  let firstColorNode: ts.Node | null = null;
  let staticSvgIdCount = 0;
  let firstStaticSvgIdNode: ts.Node | null = null;
  let legacyAsyncHits = 0;
  let firstLegacyAsyncNode: ts.Node | null = null;

  const checkImportTarget = (node: ts.Node, spec: string) => {
    const clean = spec.replace(/^node:/, '');
    if (spec.startsWith('node:') || NODE_BUILTINS.has(clean)) {
      add(node, 'no-node-imports', `forbidden Node built-in import "${spec}"`);
    }
    if (!opts.isPureVisualFile) return;
    if (
      FORBIDDEN_PURE_PKGS.has(spec) ||
      FORBIDDEN_PURE_PREFIXES.some((p) => spec.startsWith(p))
    ) {
      add(node, 'pure-boundary', `pure visual file cannot import rendering package "${spec}"`);
      return;
    }
    if (spec.startsWith('.') && opts.srcRoot) {
      const resolved = path.normalize(path.join(path.dirname(filePath), spec));
      const relFromSrc = path.relative(path.dirname(opts.srcRoot), resolved).replace(/\\/g, '/');
      if (FORBIDDEN_PURE_TARGET_RE.test(relFromSrc)) {
        add(node, 'pure-boundary', `pure visual file cannot import rendering module "${spec}"`);
      }
    }
  };

  const checkTextLiteral = (node: ts.Node, text: string) => {
    if (!isTsx || !visual) return;
    if (/^https?:\/\//i.test(text) && text !== 'http://www.w3.org/2000/svg') {
      add(node, 'no-external-urls', `disallowed external URL literal "${text.slice(0, 60)}"`);
    }
    const stripped = text.replace(/url\(#/g, '');
    const colorMatches = stripped.match(RAW_COLOR_RE) ?? [];
    if (colorMatches.length) {
      colorLiteralCount += colorMatches.length;
      if (!firstColorNode) firstColorNode = node;
      if (opts.isView2D && !(label in LEGACY_COLOR_LITERAL_CAPS)) {
        const hexHits = stripped.match(HEX_COLOR_RE) ?? [];
        if (hexHits.length) {
          add(node, 'no-raw-colors', `View2D must not contain raw hex colors (${hexHits.join(', ')})`);
          return;
        }
      }
      if (!(label in LEGACY_COLOR_LITERAL_CAPS)) {
        add(node, 'no-raw-colors', `raw color literal(s) disallowed (${colorMatches.join(', ')}); use theme.C tokens`);
      }
    }
  };

  const visit = (node: ts.Node) => {
    // 1. Imports / exports / dynamic imports
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      checkImportTarget(node.moduleSpecifier, node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      checkImportTarget(node.arguments[0], node.arguments[0].text);
    }

    // 2. Banned APIs: eval, setTimeout, setInterval, requestAnimationFrame, fetch
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = node.expression.text;
      if (fn === 'eval') add(node, 'forbidden-api', 'eval() is forbidden');
      else if (BANNED_DETERMINISM_CALLS.has(fn)) {
        if (label in ASYNC_CAPS && (fn === 'fetch' || fn === 'requestAnimationFrame' || fn === 'setTimeout')) {
          legacyAsyncHits++;
          if (!firstLegacyAsyncNode) firstLegacyAsyncNode = node;
        } else {
          add(node, 'forbidden-api', `${fn}() is forbidden in visual code`);
        }
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const ctor = node.expression.text;
      if (ctor === 'Function' || ctor === 'Date' || ctor === 'XMLHttpRequest' || ctor === 'WebSocket') {
        add(node, 'forbidden-api', `new ${ctor}() is forbidden in visual code`);
      }
    }

    // 3. Property accesses: C.<key>, Math.random, Date.now, performance.now, .innerHTML, .toLocaleString
    if (ts.isPropertyAccessExpression(node)) {
      const prop = node.name.text;
      if (ts.isIdentifier(node.expression)) {
        const obj = node.expression.text;
        if (obj === 'C' && !PALETTE.has(prop)) {
          add(node, 'valid-palette-key', `unknown theme.C key "${prop}"`);
        }
        if (obj === 'Math' && prop === 'random') add(node, 'forbidden-api', 'Math.random is forbidden');
        if (obj === 'Date' && prop === 'now') add(node, 'forbidden-api', 'Date.now is forbidden');
        if (obj === 'performance' && prop === 'now') add(node, 'forbidden-api', 'performance.now is forbidden');
        if ((obj === 'window' || obj === 'globalThis') && prop === 'fetch') add(node, 'forbidden-api', `${obj}.fetch is forbidden`);
      }
      if (BANNED_GLOBAL_PROPS.has(prop)) add(node, 'forbidden-api', `${prop} is forbidden`);
      if (BANNED_LOCALE_METHODS.has(prop)) add(node, 'forbidden-api', `${prop}() is forbidden (ICU drift); format deterministically`);
    }

    // 4. Identifiers: Intl, useFrame, useCurrentFrame, dangerouslySetInnerHTML, innerHTML
    if (ts.isIdentifier(node)) {
      const id = node.text;
      if (id === 'Intl') add(node, 'forbidden-api', 'Intl is forbidden (Node/Chrome ICU drift)');
      if (BANNED_GLOBAL_PROPS.has(id) && !ts.isPropertyAccessExpression(node.parent)) {
        // Avoid double reporting property access; still catch JSX/import/direct identifiers
        if (!ts.isImportSpecifier(node.parent) || id === 'useFrame') {
          add(node, 'forbidden-api', `${id} is forbidden`);
        }
      }
      if (visual && opts.isView && id === 'useCurrentFrame') {
        // Ignore type-only or import-specifier? Count actual references & imports alike just like hygiene.test.ts
        const inImport = ts.isImportSpecifier(node.parent);
        if (!inImport) {
          useCurrentFrameHits++;
          if (!LEGACY_USE_CURRENT_FRAME.has(label)) {
            add(node, 'no-use-current-frame', 'must take frame via props instead of calling useCurrentFrame()');
          }
        }
      }
    }

    // 5. CSS transitions/animations & fontSize > 150 in object literals
    if (isTsx && visual && ts.isPropertyAssignment(node)) {
      const key = propNameText(node.name);
      if (key && BANNED_CSS_ANIM_PROPS.has(key)) {
        add(node, 'no-css-animation', `CSS "${key}" is non-deterministic in Remotion; compute styles from frame`);
      }
      if (key === 'fontSize' && ts.isNumericLiteral(node.initializer) && Number(node.initializer.text) > 150) {
        add(node, 'no-large-font', `fontSize ${node.initializer.text} > 150px risks non-deterministic glyph rasterization`);
      }
    }

    // 6. JSX checks: fontSize > 150, dangerouslySetInnerHTML, static SVG def id="..."
    if (isTsx && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : '';
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const aname = propNameText(attr.name);
        if (aname === 'dangerouslySetInnerHTML') {
          add(attr, 'forbidden-api', 'dangerouslySetInnerHTML is forbidden');
        }
        if (visual && aname === 'fontSize' && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression && ts.isNumericLiteral(attr.initializer.expression)) {
          if (Number(attr.initializer.expression.text) > 150) {
            add(attr, 'no-large-font', `fontSize ${attr.initializer.expression.text} > 150px risks non-deterministic glyph rasterization`);
          }
        }
        if (visual && aname === 'id' && SVG_DEF_TAGS.has(tag) && attr.initializer && ts.isStringLiteral(attr.initializer)) {
          staticSvgIdCount++;
          if (!firstStaticSvgIdNode) firstStaticSvgIdNode = attr;
          if (!(label in LEGACY_STATIC_SVG_ID_CAPS)) {
            add(attr, 'no-static-svg-id', `<${tag} id="${attr.initializer.text}"> must use useStableId() instead of a static literal`);
          }
        }
      }
    }

    // 7. String / template literals & JSX text
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      checkTextLiteral(node, node.text);
    } else if (visual && ts.isJsxText(node) && /https?:\/\//i.test(node.text)) {
      add(node, 'no-external-urls', `disallowed external URL in JSX text "${node.text.trim().slice(0, 60)}"`);
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  // Ratchet checks for legacy allowlists
  if (visual && opts.isView && LEGACY_USE_CURRENT_FRAME.has(label) && useCurrentFrameHits === 0) {
    violations.push({file: label, line: 1, rule: 'prune-allowlist', message: `${label}: listed in LEGACY_USE_CURRENT_FRAME but no longer calls useCurrentFrame`});
  }
  if (visual && label in LEGACY_COLOR_LITERAL_CAPS) {
    const cap = LEGACY_COLOR_LITERAL_CAPS[label];
    if (colorLiteralCount === 0) {
      violations.push({file: label, line: 1, rule: 'prune-allowlist', message: `${label}: allowlisted for ${cap} color literal(s) but found 0`});
    } else if (colorLiteralCount > cap) {
      violations.push({file: label, line: firstColorNode ? lineAt(firstColorNode) : 1, rule: 'no-raw-colors', message: `${label}: color literal count grew (${colorLiteralCount} > cap ${cap})`});
    }
  }
  if (visual && label in LEGACY_STATIC_SVG_ID_CAPS) {
    const cap = LEGACY_STATIC_SVG_ID_CAPS[label];
    if (staticSvgIdCount === 0) {
      violations.push({file: label, line: 1, rule: 'prune-allowlist', message: `${label}: allowlisted for ${cap} static SVG id(s) but found 0`});
    } else if (staticSvgIdCount > cap) {
      violations.push({file: label, line: firstStaticSvgIdNode ? lineAt(firstStaticSvgIdNode) : 1, rule: 'no-static-svg-id', message: `${label}: static SVG id count grew (${staticSvgIdCount} > cap ${cap})`});
    }
  }
  if (label in ASYNC_CAPS) {
    const cap = ASYNC_CAPS[label];
    if (legacyAsyncHits === 0) {
      violations.push({file: label, line: 1, rule: 'prune-allowlist', message: `${label}: allowlisted for ${cap} async render call(s) but found 0`});
    } else if (legacyAsyncHits > cap) {
      violations.push({file: label, line: firstLegacyAsyncNode ? lineAt(firstLegacyAsyncNode) : 1, rule: 'forbidden-api', message: `${label}: async render call count grew (${legacyAsyncHits} > cap ${cap})`});
    }
  }

  return violations;
};

const walkTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTsFiles(full));
    else if (ent.isFile() && (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx'))) out.push(full);
  }
  return out.sort();
};

/** Lint all `.ts` and `.tsx` files inside `src/visuals/<slug>/`. */
export const lintVisualDir = (
  visualsDir: string,
  slug: string,
  srcRoot = path.dirname(visualsDir),
): {checkedFiles: number; violations: LintViolation[]; labels: string[]} => {
  const dir = path.join(visualsDir, slug);
  if (!fs.existsSync(dir)) {
    return {checkedFiles: 0, labels: [], violations: [{file: slug, line: 1, rule: 'missing-visual', message: `visual directory not found: ${dir}`}]};
  }
  const files = walkTsFiles(dir);
  const violations: LintViolation[] = [];
  const labels: string[] = [];
  let viewCount = 0;
  for (const full of files) {
    const relInDir = path.relative(dir, full).replace(/\\/g, '/');
    const label = `${slug}/${relInDir}`;
    const isTsx = relInDir.endsWith('.tsx');
    labels.push(label);
    if (relInDir === 'View2D.tsx' || relInDir === 'View3D.tsx') viewCount++;
    violations.push(
      ...lintVisualFile(label, full, {
        isView: isTsx,
        isView2D: isTsx && relInDir !== 'View3D.tsx',
        isPureVisualFile: isPureFile(full),
        srcRoot,
      }),
    );
  }
  if (viewCount === 0) {
    violations.push({file: slug, line: 1, rule: 'missing-view', message: `${slug}: expected at least View2D.tsx or View3D.tsx`});
  }
  return {checkedFiles: files.length, violations, labels};
};

/** Lint every `.ts`/`.tsx` under `srcDir` with the reduced shared rule set (determinism + safety only). */
export const lintSharedSources = (
  srcDir: string,
  {nodeOnly = NODE_ONLY_SOURCES, skip = []}: {nodeOnly?: string[]; skip?: string[]} = {},
): {labels: string[]; violations: LintViolation[]} => {
  const excluded = [...nodeOnly, ...skip];
  const isExcluded = (rel: string) => excluded.some((e) => (e.endsWith('/') ? rel.startsWith(e) : rel === e));
  const labels: string[] = [];
  const violations: LintViolation[] = [];
  for (const full of walkTsFiles(srcDir)) {
    const rel = path.relative(srcDir, full).replace(/\\/g, '/');
    if (rel.startsWith('visuals-local/') || rel.endsWith('.d.ts') || isExcluded(rel)) continue;
    const label = `src/${rel}`;
    labels.push(label);
    violations.push(
      ...lintVisualFile(label, full, {isView: false, isView2D: false, isPureVisualFile: false, scope: 'shared', srcRoot: srcDir}),
    );
  }
  for (const entry of nodeOnly) {
    if (!fs.existsSync(path.join(srcDir, entry))) {
      violations.push({file: `src/${entry}`, line: 1, rule: 'prune-allowlist', message: `src/${entry}: listed in NODE_ONLY_SOURCES but does not exist`});
    }
  }
  return {labels, violations};
};

const VISUAL_HELPERS = ['plot-svg.tsx', 'sdk/pure.ts', 'sdk/view2d.tsx', 'sdk/algo-math.ts', 'sdk/algo-2d.tsx'];

/** Lint every registered visual type, the shared visual helpers, and all other `src/**` sources. */
export const lintAllVisuals = (
  srcDir: string,
): {checkedFiles: number; visualCount: number; sharedFiles: number; checkedLabels: string[]; violations: LintViolation[]} => {
  const visualsDir = path.join(srcDir, 'visuals');
  const visualTypes = Object.keys(BUILTIN_REGISTRY);
  const violations: LintViolation[] = [];
  const checkedLabels: string[] = [];
  let checkedFiles = 0;

  for (const slug of visualTypes) {
    const r = lintVisualDir(visualsDir, slug, srcDir);
    checkedFiles += r.checkedFiles;
    violations.push(...r.violations);
    checkedLabels.push(...r.labels);
  }

  for (const rel of VISUAL_HELPERS) {
    const file = path.join(srcDir, rel);
    const label = `src/${rel}`;
    const isTsx = file.endsWith('.tsx');
    checkedFiles++;
    checkedLabels.push(label);
    violations.push(
      ...lintVisualFile(label, file, {isView: isTsx, isView2D: isTsx, isPureVisualFile: isPureFile(file), srcRoot: srcDir}),
    );
  }

  const shared = lintSharedSources(srcDir, {skip: [...visualTypes.map((s) => `visuals/${s}/`), ...VISUAL_HELPERS]});
  checkedFiles += shared.labels.length;
  checkedLabels.push(...shared.labels);
  violations.push(...shared.violations);

  return {checkedFiles, visualCount: visualTypes.length, sharedFiles: shared.labels.length, checkedLabels, violations};
};
