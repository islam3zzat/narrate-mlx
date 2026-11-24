// Loads style definitions (<name>.json) from disk (used by cli.ts and the tests; not part of the Remotion bundle, so it may use fs).
// Search order: <workdir>/styles/, ~/.config/explainer-video/styles/, <skill>/styles/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StyleSchema, type StyleDef, type StyleName} from './styles';

export const STYLES_DIR = path.join(__dirname, '..', 'styles');
export const USER_STYLES_DIR = path.join(os.homedir(), '.config', 'explainer-video', 'styles');

export const styleDirs = (workdir?: string): string[] => [
  ...(workdir ? [path.join(workdir, 'styles')] : []),
  USER_STYLES_DIR,
  STYLES_DIR,
];

const findStyleFile = (name: string, workdir?: string): string | null => {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  for (const dir of styleDirs(workdir)) {
    const file = path.join(dir, `${name}.json`);
    if (fs.existsSync(file)) return file;
  }
  return null;
};

/** The style definition of `name`; throws with the file name and the zod issues when the file is missing or wrong. */
export const loadStyle = (name: StyleName, workdir?: string): StyleDef => {
  const file = findStyleFile(name, workdir);
  if (!file) throw new Error(`unknown style "${name}" (checked: ${styleDirs(workdir).join(', ')})`);
  const r = StyleSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!r.success) throw new Error(`${file}: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  if (r.data.name !== name) throw new Error(`${file}: "name" is "${r.data.name}", the file name says "${name}"`);
  return r.data;
};

/** Names of the style files across the search directories, sorted and deduplicated. */
export const styleFileNames = (workdir?: string): string[] => {
  const names = new Set<string>();
  for (const dir of styleDirs(workdir)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) names.add(f.slice(0, -5));
  }
  return [...names].sort();
};
