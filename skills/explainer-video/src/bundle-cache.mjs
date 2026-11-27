/**
 * Persistent Webpack bundle cache and zero-copy local static asset server.
 * Avoids rebuilding `src/index.ts` and copying `<workdir>/public/` (often tens of MB)
 * on every `render-worker` / `still-worker` invocation.
 */
import { bundle } from '@remotion/bundler';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const MAX_CACHED_BUNDLES = 3;

function walkSortedFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out = [];
  for (const ent of entries) {
    if (ent.name === '.DS_Store') continue;
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkSortedFiles(full, rel));
    } else if (ent.isFile()) {
      out.push({ rel, full });
    }
  }
  return out;
}

/**
 * Compute a deterministic 16-hex-char hash over `src/`, `package-lock.json`,
 * `remotion.config.ts`, and `tsconfig.json`.
 */
export function computeBundleHash(skillRoot, entryPoint) {
  const h = crypto.createHash('sha256');
  if (entryPoint) {
    const relEntry = path.relative(skillRoot, path.resolve(entryPoint)).replace(/\\/g, '/');
    if (relEntry && relEntry !== 'src/index.ts') {
      h.update('entry\0');
      h.update(relEntry);
      h.update('\0');
    }
  }
  for (const { rel, full } of walkSortedFiles(path.join(skillRoot, 'src'), 'src')) {
    h.update(rel);
    h.update('\0');
    h.update(fs.readFileSync(full));
  }
  for (const name of ['package-lock.json', 'remotion.config.ts', 'tsconfig.json']) {
    const p = path.join(skillRoot, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      h.update(name);
      h.update('\0');
      h.update(fs.readFileSync(p));
    }
  }
  return h.digest('hex').slice(0, 16);
}

function pruneOldBundles(cacheRoot, keepDir) {
  try {
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^[0-9a-f]{16}$/.test(e.name))
      .map((e) => {
        const full = path.join(cacheRoot, e.name);
        const ready = path.join(full, '.ready');
        const st = fs.existsSync(ready) ? fs.statSync(ready) : fs.statSync(full);
        return { full, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const item of entries.slice(MAX_CACHED_BUNDLES)) {
      if (item.full !== keepDir) {
        fs.rmSync(item.full, { recursive: true, force: true });
      }
    }
  } catch {}
}

/**
 * Return a built bundle directory containing JS/HTML without `public/` copied in.
 * Set `EXPLAINER_BUNDLE_CACHE=0` to disable persistent caching.
 */
export async function ensureCachedBundle({
  entryPoint,
  skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
}) {
  const disableCache = (process.env.EXPLAINER_BUNDLE_CACHE || '').trim() === '0';
  if (disableCache) {
    const emptyPub = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-empty-pub-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-bundle-'));
    try {
      await bundle({
        entryPoint,
        publicDir: emptyPub,
        outDir,
        enableCaching: true,
      });
      return { bundleDir: outDir, hash: null, hit: false, ephemeral: true };
    } finally {
      fs.rmSync(emptyPub, { recursive: true, force: true });
    }
  }

  const hash = computeBundleHash(skillRoot, entryPoint);
  const cacheRoot = path.join(skillRoot, 'node_modules', '.cache', 'explainer-bundle');
  fs.mkdirSync(cacheRoot, { recursive: true });
  const targetDir = path.join(cacheRoot, hash);
  const readyFile = path.join(targetDir, '.ready');
  const bundleJs = path.join(targetDir, 'bundle.js');

  if (fs.existsSync(readyFile) && fs.existsSync(bundleJs)) {
    try {
      const now = new Date();
      fs.utimesSync(readyFile, now, now);
    } catch {}
    return { bundleDir: targetDir, hash, hit: true, ephemeral: false };
  }

  const emptyPub = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-empty-pub-'));
  const tmpBuild = fs.mkdtempSync(path.join(cacheRoot, `.tmp-${hash}-`));
  try {
    await bundle({
      entryPoint,
      publicDir: emptyPub,
      outDir: tmpBuild,
      enableCaching: true,
    });
    fs.writeFileSync(path.join(tmpBuild, '.ready'), `${hash}\n`);
    try {
      fs.renameSync(tmpBuild, targetDir);
    } catch (err) {
      if (['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(err?.code) && fs.existsSync(readyFile)) {
        fs.rmSync(tmpBuild, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
    pruneOldBundles(cacheRoot, targetDir);
    return { bundleDir: targetDir, hash, hit: false, ephemeral: false };
  } catch (err) {
    fs.rmSync(tmpBuild, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(emptyPub, { recursive: true, force: true });
  }
}

function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Serve `bundleDir` at `/` and `publicDir` live at `/public/` over loopback HTTP
 * with strict canonical path confinement.
 */
export async function startBundleServer({ bundleDir, publicDir }) {
  const bundleRoot = fs.realpathSync(bundleDir);
  const publicRoot = publicDir && fs.existsSync(publicDir) ? fs.realpathSync(publicDir) : null;
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    let pathname;
    try {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1');
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (pathname.includes('\0')) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    let baseRoot;
    let relPath;
    if (pathname === '/public' || pathname.startsWith('/public/')) {
      if (!publicRoot) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      baseRoot = publicRoot;
      relPath = pathname.slice('/public'.length).replace(/^\/+/, '');
    } else {
      baseRoot = bundleRoot;
      relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    }

    if (!relPath) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const candidate = path.resolve(baseRoot, relPath);
    if (!isInside(baseRoot, candidate)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let realPath;
    let stat;
    try {
      realPath = fs.realpathSync(candidate);
      if (!isInside(baseRoot, realPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      stat = fs.statSync(realPath);
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    } catch (err) {
      if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }

    const ext = path.extname(realPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    const rangeHeader = req.headers.range;
    if (rangeHeader && stat.size > 0) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (m && (m[1] !== '' || m[2] !== '')) {
        const start = m[1] === '' ? Math.max(0, stat.size - Number(m[2])) : Number(m[1]);
        const end = m[2] === '' || m[1] === '' ? stat.size - 1 : Math.min(stat.size - 1, Number(m[2]));
        if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start <= end && end < stat.size) {
          headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
          headers['Content-Length'] = String(end - start + 1);
          res.writeHead(206, headers);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          fs.createReadStream(realPath, { start, end }).pipe(res);
          return;
        }
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
    }

    headers['Content-Length'] = String(stat.size);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(realPath).pipe(res);
  });

  server.on('connection', (sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const serveUrl = `http://127.0.0.1:${addr.port}`;

  async function close() {
    for (const sock of sockets) {
      try { sock.destroy(); } catch {}
    }
    sockets.clear();
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  return { serveUrl, close };
}
