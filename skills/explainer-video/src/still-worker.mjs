/**
 * Warm @remotion/renderer worker for tests/golden.py and cmd_review/cmd_verify.
 * Uses cached bundle + zero-copy loopback server (or `cfg.serveUrl` / `keepBundle` when specified),
 * opens at most one headless Chrome per OpenGL mode (2D vs 3D), selects each composition once,
 * and renders all target frames. Reads JSON config from stdin; exits non-zero on any error.
 */
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import { ensureCachedBundle, startBundleServer } from './bundle-cache.mjs';

const cfg = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!cfg.videos || cfg.videos.length === 0) {
  process.exit(0);
}

let serveUrl = cfg.serveUrl || null;
let ownEphemeralBundle = null;
let bundleServer = null;

if (!serveUrl) {
  if (cfg.keepBundle) {
    serveUrl = await bundle({
      entryPoint: cfg.entryPoint,
      publicDir: cfg.publicDir,
      enableCaching: true,
    });
    ownEphemeralBundle = serveUrl;
  } else {
    const info = await ensureCachedBundle({ entryPoint: cfg.entryPoint });
    if (info.ephemeral) ownEphemeralBundle = info.bundleDir;
    bundleServer = await startBundleServer({
      bundleDir: info.bundleDir,
      publicDir: cfg.publicDir,
    });
    serveUrl = bundleServer.serveUrl;
  }
}

let activeBrowser = null;
let cleaned = false;
async function cleanup(forceRemoveBundle = false) {
  if (cleaned) return;
  cleaned = true;
  if (activeBrowser) {
    try { await activeBrowser.close({ silent: true }); } catch {}
    activeBrowser = null;
  }
  if (bundleServer) {
    try { await bundleServer.close(); } catch {}
    bundleServer = null;
  }
  if (ownEphemeralBundle && (forceRemoveBundle || !cfg.keepBundle)) {
    fs.rmSync(ownEphemeralBundle, { recursive: true, force: true });
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await cleanup(true);
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}

try {
  // Group videos by OpenGL mode (null for 2D, 'angle' etc. for 3D) so each mode shares one browser.
  const groups = new Map();
  for (const v of cfg.videos) {
    const key = v.gl ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }

  for (const [glKey, vids] of groups) {
    const chromiumOptions = glKey ? { gl: glKey } : {};
    const browserExecutable = cfg.browserExecutable || undefined;
    const browser = await openBrowser('chrome', {
      browserExecutable,
      chromiumOptions,
      logLevel: 'error',
    });
    activeBrowser = browser;
    try {
      for (const v of vids) {
        if (!v.frames || v.frames.length === 0) continue;
        const composition = await selectComposition({
          serveUrl,
          id: 'Explainer',
          inputProps: { videoId: v.vid },
          puppeteerInstance: browser,
          browserExecutable,
          chromiumOptions,
          logLevel: 'error',
        });
        let idx = 0;
        const conc = Math.max(1, Math.min(v.concurrency || 1, v.frames.length));
        async function worker() {
          while (idx < v.frames.length) {
            const item = v.frames[idx++];
            fs.mkdirSync(path.dirname(item.output), { recursive: true });
            await renderStill({
              composition,
              serveUrl,
              output: item.output,
              frame: item.frame,
              inputProps: { videoId: v.vid },
              puppeteerInstance: browser,
              browserExecutable,
              chromiumOptions,
              overwrite: true,
              timeoutInMilliseconds: cfg.timeoutMs ?? 60000,
              logLevel: 'error',
            });
          }
        }
        await Promise.all(Array.from({ length: conc }, worker));
      }
    } finally {
      activeBrowser = null;
      await browser.close({ silent: true });
    }
  }
  if (cfg.keepBundle && ownEphemeralBundle) {
    process.stdout.write(JSON.stringify({ serveUrl }) + '\n');
  }
} finally {
  await cleanup(false);
}
