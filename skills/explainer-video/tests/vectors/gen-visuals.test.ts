import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkVisualFiles,
  discoverVisuals,
  generateVisualFiles,
  propKey,
  toIdent,
  toPascal,
  writeVisualFiles,
} from '../../src/gen-visuals';

let checks = 0;

// 1. Live src/visuals directory matches generated output with zero stale files
const liveVisualsDir = path.resolve(process.cwd(), 'src/visuals');
assert.deepEqual(checkVisualFiles(liveVisualsDir), [], 'src/visuals generated files are stale; run make docs');
checks++;

// 2. Identifier helpers handle reserved words and hyphenated slugs cleanly
assert.equal(toIdent('class'), 'class_');
assert.equal(toIdent('linked-plot'), 'linkedPlot');
assert.equal(toPascal('linked-plot'), 'LinkedPlot');
assert.equal(propKey('class'), 'class');
assert.equal(propKey('linked-plot'), "'linked-plot'");
checks++;

const makeVisualStub = (dir: string, slug: string, opts: {has2D?: boolean; has3D?: boolean} = {has2D: true}) => {
  const vdir = path.join(dir, slug);
  fs.mkdirSync(vdir, {recursive: true});
  fs.writeFileSync(path.join(vdir, 'capabilities.ts'), "export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'yes'} as const;\n");
  fs.writeFileSync(path.join(vdir, 'schema.ts'), "import {z} from 'zod';\nexport const schema = z.strictObject({type: z.literal('" + slug + "')});\n");
  fs.writeFileSync(path.join(vdir, 'semantics.ts'), 'export const describe = () => ({slots: [], carried: []});\n');
  fs.writeFileSync(path.join(vdir, 'meta.ts'), 'export const meta = {};\n');
  fs.writeFileSync(path.join(vdir, 'catalog.ts'), 'export const catalog = {};\n');
  if (opts.has2D !== false) fs.writeFileSync(path.join(vdir, 'View2D.tsx'), 'export const View2D = () => null;\n');
  if (opts.has3D) fs.writeFileSync(path.join(vdir, 'View3D.tsx'), 'export const View3D = () => null;\n');
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-visuals-test-'));
try {
  // 3. Temp fixture: reserved slug in order.json + brand-new unlisted 2D visual
  const fixture = path.join(tmp, 'ok');
  fs.mkdirSync(fixture, {recursive: true});
  makeVisualStub(fixture, 'class', {has2D: true, has3D: true});
  makeVisualStub(fixture, 'my-algo', {has2D: true, has3D: false});
  fs.writeFileSync(
    path.join(fixture, 'order.json'),
    JSON.stringify({registry: ['class'], schema: ['class'], docs: ['class'], eager2d: ['class']}),
  );

  const discovered = discoverVisuals(fixture);
  assert.deepEqual(discovered.map((d) => d.slug), ['class', 'my-algo']);

  const gen = generateVisualFiles(fixture);
  assert.match(gen['capabilities.ts'], /import \{capabilities as class_\} from '\.\/class\/capabilities';/);
  assert.match(gen['capabilities.ts'], /import \{capabilities as myAlgo\} from '\.\/my-algo\/capabilities';/);
  assert.match(gen['capabilities.ts'], /class: class_,/);
  assert.match(gen['capabilities.ts'], /'my-algo': myAlgo,/);

  assert.match(gen['registry.ts'], /'my-algo': myAlgoSchema,/);
  assert.match(gen['registry.ts'], /'my-algo': \{schema: SCHEMAS\['my-algo'\], semantics: myAlgoSem, meta: myAlgoMeta\},/);
  assert.match(gen['registry.ts'], /export const DOCS_ORDER = \['class', 'my-algo'\] as const/);

  // Built-in in eager2d stays eager; unlisted new 2D visual defaults to lazyView
  assert.match(gen['views.tsx'], /import \{View2D as Class2D\} from '\.\/class\/View2D';/);
  assert.match(gen['views.tsx'], /const MyAlgo2D = lazyView<View2DProps<'my-algo'>>\(\(\) => import\('\.\/my-algo\/View2D'\)/);
  assert.match(gen['views.tsx'], /'my-algo': \{View2D: MyAlgo2D, View3D: null\},/);
  assert.match(gen['catalog.ts'], /'my-algo': myAlgo,/);

  // a folder with board.ts joins the whiteboard dispatch and WHITEBOARD_DRAWN_TYPES; one without does not
  assert.match(gen['capabilities.ts'], /WHITEBOARD_DRAWN_TYPES = \[\] as const/);
  assert.doesNotMatch(gen['boards.ts'], /my-algo/);
  fs.writeFileSync(path.join(fixture, 'my-algo', 'board.ts'), 'export const board = () => true;\n');
  const drawn = generateVisualFiles(fixture);
  assert.match(drawn['capabilities.ts'], /WHITEBOARD_DRAWN_TYPES = \['my-algo'\] as const/);
  assert.match(drawn['boards.ts'], /import \{board as myAlgo\} from '\.\/my-algo\/board';/);
  assert.match(drawn['boards.ts'], /'my-algo': myAlgo,/);
  fs.unlinkSync(path.join(fixture, 'my-algo', 'board.ts'));

  // a semantics.ts that exports speakerRefs is collected into the registry; one without is not
  assert.doesNotMatch(gen['registry.ts'], /myAlgoRefs/);
  assert.match(gen['registry.ts'], /const SPEAKER_REFS: \{\[T in BuiltinVisualType\]\?: SpeakerRefs<T>\} = \{\};/);
  fs.writeFileSync(path.join(fixture, 'my-algo', 'semantics.ts'), "export const describe = () => ({slots: [], carried: []});\nexport const speakerRefs = () => ['a'];\n");
  const refs = generateVisualFiles(fixture);
  assert.match(refs['registry.ts'], /import \{describe as myAlgoSem, speakerRefs as myAlgoRefs\} from '\.\/my-algo\/semantics';/);
  assert.match(refs['registry.ts'], /\{\n  'my-algo': myAlgoRefs,\n\};/);
  assert.match(refs['registry.ts'], /import \{describe as class_Sem\} from '\.\/class\/semantics';/);
  fs.writeFileSync(path.join(fixture, 'my-algo', 'semantics.ts'), 'export const describe = () => ({slots: [], carried: []});\n');

  const wr = writeVisualFiles(fixture);
  assert.equal(wr.updated.length, 5);
  assert.deepEqual(checkVisualFiles(fixture), []);
  checks++;

  // 4. Unknown/stale slug in order.json throws descriptive error
  const badOrder = path.join(tmp, 'bad-order');
  fs.mkdirSync(badOrder, {recursive: true});
  makeVisualStub(badOrder, 'alpha');
  fs.writeFileSync(path.join(badOrder, 'order.json'), JSON.stringify({registry: ['ghost'], schema: [], docs: [], eager2d: []}));
  assert.throws(() => generateVisualFiles(badOrder), /unknown visual "ghost"/);
  checks++;

  // 5. Missing required file throws descriptive error
  const missingFile = path.join(tmp, 'missing');
  fs.mkdirSync(missingFile, {recursive: true});
  makeVisualStub(missingFile, 'beta');
  fs.unlinkSync(path.join(missingFile, 'beta', 'catalog.ts'));
  assert.throws(() => discoverVisuals(missingFile), /missing required file\(s\): catalog\.ts/);
  checks++;

  // 6. Missing both View2D and View3D throws descriptive error
  const noViews = path.join(tmp, 'noviews');
  fs.mkdirSync(noViews, {recursive: true});
  makeVisualStub(noViews, 'gamma', {has2D: false, has3D: false});
  assert.throws(() => discoverVisuals(noViews), /must provide at least View2D\.tsx or View3D\.tsx/);
  checks++;
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}

console.log(`gen-visuals checks: ${checks}/${checks} passed`);
