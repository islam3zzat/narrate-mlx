/**
 * Warm @remotion/renderer worker for `explainer.py render`.
 * Uses a content-hashed Webpack bundle cache + zero-copy local static server, renders
 * contiguous or deduplicated `runs` chunks via `renderFrames` -> `image2pipe` -> 90 kHz MPEG-TS,
 * and relies on the caller to losslessly concatenate chunks and mux audio in a single FFmpeg pass.
 * Reads JSON config from stdin; exits non-zero on any error.
 */
import { openBrowser, renderFrames, selectComposition } from '@remotion/renderer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureCachedBundle, startBundleServer } from './bundle-cache.mjs';

const cfg = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!cfg.videos || cfg.videos.length === 0) {
  process.exit(0);
}

const bundleInfo = await ensureCachedBundle({ entryPoint: cfg.entryPoint });
if (bundleInfo.hash) {
  process.stderr.write(`[bundle-cache] ${bundleInfo.hit ? 'hit' : 'miss'} ${bundleInfo.hash}\n`);
}
const bundleServer = await startBundleServer({
  bundleDir: bundleInfo.bundleDir,
  publicDir: cfg.publicDir,
});
const serveUrl = bundleServer.serveUrl;

const openBrowsers = new Set();
const activeFfmpegs = new Set();
let cleaned = false;

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const ff of activeFfmpegs) {
    try { ff.kill('SIGKILL'); } catch {}
  }
  activeFfmpegs.clear();
  await Promise.allSettled(
    [...openBrowsers].map(async (b) => {
      try {
        await b.close({ silent: true });
      } catch {}
    }),
  );
  openBrowsers.clear();
  try {
    await bundleServer.close();
  } catch {}
  if (bundleInfo.ephemeral) {
    try {
      fs.rmSync(bundleInfo.bundleDir, { recursive: true, force: true });
    } catch {}
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await cleanup();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}

async function renderChunkToTs({ chunk, v, browser, browserExecutable, chromiumOptions, conc }) {
  const deduped = Array.isArray(chunk.runs);
  const frameMap = deduped ? chunk.runs.map((r) => r.frame) : null;
  const inputProps = frameMap ? { videoId: v.vid, frameMap } : { videoId: v.vid };
  const startIdx = deduped ? 0 : chunk.start;
  const expectedCount = deduped ? chunk.runs.length : (chunk.end - chunk.start + 1);
  const frameRange = [startIdx, startIdx + expectedCount - 1];
  const repeatFor = deduped ? (idx) => chunk.runs[idx].count : () => 1;

  const fps = v.fps || 30;
  const preset = v.x264Preset || 'veryfast';
  const scale = typeof v.scale === 'number' && v.scale > 0 ? v.scale : 1;

  const ff = spawn(
    'ffmpeg',
    [
      '-v', 'error', '-y',
      '-framerate', String(fps),
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', preset,
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      ...(chunk.output.endsWith('.ts') ? ['-f', 'mpegts'] : []),
      chunk.output,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  activeFfmpegs.add(ff);

  let ffStderr = '';
  ff.stderr.on('data', (d) => { ffStderr += d.toString(); });
  const ffDone = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => {
      activeFfmpegs.delete(ff);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg pipe failed (exit ${code}): ${ffStderr.trim()}`));
    });
  });
  ffDone.catch(() => {});

  const writeBuf = (buf) => new Promise((resolve, reject) => {
    if (ff.stdin.destroyed) return reject(new Error('ffmpeg stdin closed early'));
    if (ff.stdin.write(buf)) return resolve();
    const onDrain = () => { off(); resolve(); };
    const onErr = (e) => { off(); reject(e); };
    const off = () => {
      ff.stdin.off('drain', onDrain);
      ff.stdin.off('error', onErr);
    };
    ff.stdin.once('drain', onDrain);
    ff.stdin.once('error', onErr);
  });

  const pending = new Map();
  let nextIdx = startIdx;
  let writeErr = null;
  let writeChain = Promise.resolve();

  const composition = await selectComposition({
    serveUrl,
    id: 'Explainer',
    inputProps,
    puppeteerInstance: browser,
    browserExecutable,
    chromiumOptions,
    logLevel: 'error',
  });

  try {
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      puppeteerInstance: browser,
      browserExecutable,
      chromiumOptions,
      concurrency: conc,
      scale,
      frameRange,
      imageFormat: 'jpeg',
      jpegQuality: 80,
      muted: true,
      outputDir: null,
      onFrameBuffer: (buf, idx) => {
        pending.set(idx, buf);
        while (pending.has(nextIdx)) {
          const b = pending.get(nextIdx);
          pending.delete(nextIdx);
          const count = repeatFor(nextIdx);
          nextIdx += 1;
          writeChain = writeChain.then(async () => {
            if (writeErr) return;
            for (let k = 0; k < count; k++) {
              await writeBuf(b);
            }
          }).catch((e) => {
            writeErr = writeErr || e;
          });
        }
      },
      onFrameUpdate: () => {},
      logLevel: 'error',
    });

    await writeChain;
    if (writeErr) throw writeErr;
    if (nextIdx - startIdx !== expectedCount) {
      throw new Error(`renderFrames missed frames: wrote ${nextIdx - startIdx}/${expectedCount}`);
    }
    ff.stdin.end();
    await ffDone;
  } catch (err) {
    try { ff.kill('SIGKILL'); } catch {}
    activeFfmpegs.delete(ff);
    throw err;
  }
}

try {
  const browserExecutable = cfg.browserExecutable || undefined;

  for (const v of cfg.videos) {
    if (!v.chunks || v.chunks.length === 0) continue;
    const chromiumOptions = v.gl ? { gl: v.gl } : {};
    const conc = Math.max(1, v.concurrency || 1);
    const deduped = Array.isArray(v.chunks[0]?.runs);
    const preset = v.x264Preset || 'veryfast';
    const scale = typeof v.scale === 'number' && v.scale > 0 ? v.scale : 1;
    process.stderr.write(
      `[render-worker] ${v.vid}: ${v.chunks.length} chunk(s) x ${conc} tab(s)` +
      `${deduped ? ' (dedup)' : ''}` +
      ` preset=${preset}` +
      `${scale !== 1 ? ` scale=${scale.toFixed(3)}` : ''}` +
      `${v.gl ? ` (--gl=${v.gl})` : ''}\n`,
    );

    await Promise.all(
      v.chunks.map(async (chunk) => {
        fs.mkdirSync(path.dirname(chunk.output), { recursive: true });
        const browser = await openBrowser('chrome', {
          browserExecutable,
          chromiumOptions,
          logLevel: 'error',
        });
        openBrowsers.add(browser);
        try {
          await renderChunkToTs({ chunk, v, browser, browserExecutable, chromiumOptions, conc });
        } finally {
          openBrowsers.delete(browser);
          try {
            await browser.close({ silent: true });
          } catch {}
        }
      }),
    );
  }
} finally {
  await cleanup();
}
