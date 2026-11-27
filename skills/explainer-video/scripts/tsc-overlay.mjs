// Type-check the app's tsconfig program with an in-memory overlay of extra files.
// stdin: JSON {"<absolute path>": "<content>"}; nothing is written to disk.
// Overlay files shadow/extend the filesystem and become extra roots; anything under /visuals-local/
// that is NOT in the overlay is excluded, so a developer's own local visuals never affect the result.
// Output: `file:line message` per diagnostic. Exit 1 if any diagnostics, else 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlay = new Map(
  Object.entries(JSON.parse(fs.readFileSync(0, 'utf8'))).map(([p, c]) => [path.resolve(p), String(c)]),
);
const overlayDirs = new Set();
for (const p of overlay.keys()) {
  for (let d = path.dirname(p); d !== path.dirname(d); d = path.dirname(d)) overlayDirs.add(d);
}

const cfgPath = path.join(root, 'tsconfig.json');
const cfgFile = ts.readConfigFile(cfgPath, ts.sys.readFile);
if (cfgFile.error) {
  console.error(ts.flattenDiagnosticMessageText(cfgFile.error.messageText, '\n'));
  process.exit(2);
}
const parsed = ts.parseJsonConfigFileContent(cfgFile.config, ts.sys, root);
const host = ts.createCompilerHost(parsed.options);
const { fileExists, readFile, getSourceFile, directoryExists } = host;
host.fileExists = (f) => overlay.has(path.resolve(f)) || fileExists.call(host, f);
host.readFile = (f) => overlay.get(path.resolve(f)) ?? readFile.call(host, f);
host.directoryExists = (d) => overlayDirs.has(path.resolve(d)) || (directoryExists?.call(host, d) ?? ts.sys.directoryExists(d));
host.getSourceFile = (f, lang, onErr, shouldCreate) => {
  const text = overlay.get(path.resolve(f));
  return text !== undefined
    ? ts.createSourceFile(f, text, lang, false)
    : getSourceFile.call(host, f, lang, onErr, shouldCreate);
};

const rootNames = [
  ...parsed.fileNames.filter((f) => !f.includes('/visuals-local/') || overlay.has(path.resolve(f))),
  ...overlay.keys(),
].filter((f, i, a) => /\.(tsx?|mts|cts)$/.test(f) && a.indexOf(f) === i);

const program = ts.createProgram({ rootNames, options: parsed.options, host });
const diags = ts.getPreEmitDiagnostics(program);
for (const d of diags) {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  if (d.file) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    console.log(`${path.relative(root, d.file.fileName)}:${line + 1} ${msg}`);
  } else console.log(msg);
}
process.exit(diags.length ? 1 : 0);
