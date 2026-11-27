import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src', 'visuals-local');
fs.mkdirSync(dir, { recursive: true });

const STUBS = {
  'capabilities.ts':
    "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_CAPABILITIES = {} as const;\n",
  'registry.ts':
    "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_SCHEMAS = {};\nexport const LOCAL_REGISTRY = {};\n",
  'views.tsx':
    "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_VIEWS = {};\n",
  'catalog.ts':
    "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_CATALOG = {};\n",
};

for (const [name, content] of Object.entries(STUBS)) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8');
}
