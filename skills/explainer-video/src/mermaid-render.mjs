// Pre-renders mermaid diagrams to static SVG (run by explainer.py; not part of the Remotion bundle).
// Usage: node mermaid-render.mjs --out-dir <dir> [--browser <exe>]
// stdin:  [{key, hash, code}]
// stdout: [{key, ok:true, svg:"mermaid/<hash>.svg", nodes, w, h, layout?} | {key, ok:false, error}]
// Exit 0 if the browser worked (even if some diagrams failed), 2 + {"fatal": msg} if it could not launch.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openBrowser} from '@remotion/renderer';
import {readLayout, sanitizeLayout} from './mermaid-layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const paperTheme = JSON.parse(fs.readFileSync(path.join(here, 'theme.json'), 'utf8'));
const celSkyTheme = JSON.parse(fs.readFileSync(path.join(here, 'cel-sky.json'), 'utf8'));
const PALETTES = {paper: paperTheme.C, 'cel-sky': celSkyTheme.C};
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const outDir = opt('--out-dir');
const browserExe = opt('--browser');
if (!outDir) { console.log(JSON.stringify({fatal: 'missing --out-dir'})); process.exit(2); }

const noWidth = {useMaxWidth: false};
const themeConfigFor = (name) => {
  const C = PALETTES[name] || PALETTES['cel-sky'];
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: paperTheme.FONT,
    flowchart: {htmlLabels: false, curve: 'basis', padding: 16, useMaxWidth: false},
    sequence: {useMaxWidth: false},
    state: noWidth, er: noWidth, class: noWidth, journey: noWidth, timeline: noWidth,
    mindmap: noWidth, gantt: noWidth, pie: noWidth,
    themeVariables: {
      darkMode: false,
      background: 'transparent',
      fontSize: '28px',
      primaryColor: C.primary, primaryBorderColor: C.ink, primaryTextColor: C.ink,
      lineColor: C.ink,
      secondaryColor: C.accent, tertiaryColor: C.panel, clusterBkg: C.muted, noteBkgColor: C.primary, noteTextColor: C.ink,
      clusterBorder: C.ink, edgeLabelBackground: C.bg,
      actorBkg: C.primary, actorBorder: C.ink, actorTextColor: C.ink,
      signalColor: C.ink, signalTextColor: C.ink,
      attributeBackgroundColorOdd: C.panel, attributeBackgroundColorEven: C.muted,
    },
  };
};

const readStdin = async () => { let s = ''; for await (const c of process.stdin) s += c; return s; };

// Global watchdog: the parent also enforces a timeout, but never let this process outlive its budget.
const BUDGET_MS = Number(opt('--budget-ms')) || 60000;
const PER_DIAGRAM_MS = 15000;
let browser;
const watchdog = setTimeout(() => {
  console.log(JSON.stringify({fatal: 'render timed out (watchdog)'}));
  try { browser && browser.close({silent: true}).catch(() => {}); } catch {}
  setTimeout(() => process.exit(2), 1500).unref();
}, BUDGET_MS);
watchdog.unref();
// On SIGTERM from the parent's timeout, close the browser first (Chrome runs in its own process group, so killing us alone would orphan it).
process.on('SIGTERM', async () => {
  try { if (browser) await browser.close({silent: true}); } catch {}
  process.exit(2);
});

const items = JSON.parse(await readStdin() || '[]');
fs.mkdirSync(outDir, {recursive: true});

try {
  browser = await openBrowser('chrome', {browserExecutable: browserExe || null});
} catch (e) {
  console.log(JSON.stringify({fatal: String(e && e.message || e)}));
  process.exit(2);
}

const results = [];
try {
  const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null});
  await page.goto({url: 'about:blank', timeout: 30000});
  // Block ALL network access from the page (mermaid input is untrusted): fail every request via CDP Fetch.
  const cdp = typeof page._client === 'function' ? page._client() : null;
  if (!cdp || typeof cdp.send !== 'function' || typeof cdp.on !== 'function') {
    throw new Error('Puppeteer CDP client (page._client) unavailable; cannot enforce offline isolation for Mermaid');
  }
  cdp.on('Fetch.requestPaused', (ev) => {
    cdp.send('Fetch.failRequest', {requestId: ev.requestId, errorReason: 'BlockedByClient'}).catch(() => {});
  });
  await cdp.send('Fetch.enable', {patterns: [{urlPattern: '*'}]});
  const lib = fs.readFileSync(path.join(here, '../node_modules/mermaid/dist/mermaid.min.js'), 'utf8');
  await page.evaluate(lib);
  await page.evaluate(`window.readLayout = ${readLayout.toString()};`);
  let activeTheme = null;
  let stuck = false;
  for (const {key, hash, code, theme: itemTheme} of items) {
    if (stuck) { results.push({key, ok: false, error: 'skipped: renderer was stuck on an earlier diagram'}); continue; }
    const wantedTheme = itemTheme || 'cel-sky';
    if (wantedTheme !== activeTheme) {
      await page.evaluate((cfg) => { window.mermaid.initialize(cfg); }, themeConfigFor(wantedTheme));
      activeTheme = wantedTheme;
    }
    try {
      let timer;
      const res = await Promise.race([page.evaluate(async (id, src) => {
        try {
          await window.mermaid.parse(src);
        } catch (e) {
          return {error: String((e && e.message) || e)};
        }
        const cleanup = () => { for (const n of document.querySelectorAll('#d' + id + ', #' + id)) n.remove(); };
        try {
          const rendered = await window.mermaid.render(id, src);
          // mermaid emits HTML void tags (<br>) inside foreignObject; make them well-formed XML so <Img> can load the SVG
          const svg = rendered.svg.replace(/<br\s*>/gi, '<br/>');
          // inert parse: DOMParser never loads resources or runs scripts
          const holder = new DOMParser().parseFromString(svg, 'image/svg+xml');
          if (holder.querySelector('parsererror')) return {error: 'rendered SVG is not well-formed XML (often HTML such as <br/> in a label; use plain text labels)'};
          const el = holder.querySelector('svg');
          // sequence actors are drawn top and bottom (and as box + label): count the top boxes once
          const tops = holder.querySelectorAll('rect.actor-top').length;
          const actors = tops || holder.querySelectorAll('.actor').length;
          const nodes = actors + holder.querySelectorAll('.node, .entityBox, .stateGroup, g[id^=state-]').length;
          const vb = (el && el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
          cleanup();   // the layout reader inserts its own copy: ids must not clash
          // layers for animated scenes; any failure only means the diagram stays a static picture
          const layered = await window.readLayout(src, svg).catch(() => null);
          return {svg, nodes, w: vb[2] || 0, h: vb[3] || 0, ...(layered || {})};
        } catch (e) {
          return {error: String((e && e.message) || e)};
        } finally {
          cleanup();
        }
      }, 'm' + hash.slice(0, 8), code),
        new Promise((resolve) => { timer = setTimeout(() => resolve({error: 'render timed out'}), PER_DIAGRAM_MS); }),
      ]).finally(() => clearTimeout(timer));
      if (res.error === 'render timed out') stuck = true;  // the page's JS is wedged; later evaluates would just queue
      if (res.error) { results.push({key, ok: false, error: res.error}); continue; }
      const dest = path.join(outDir, `${hash}.svg`);
      // meta first, svg last: a cached svg never exists without its meta
      const meta = path.join(outDir, `${hash}.json`);
      let layout = sanitizeLayout(res.layout);
      const LAYER_BYTES = 30e6;   // every layer is a full copy of the SVG: cap the total
      if (layout && Array.isArray(res.layers) && res.layers.reduce((s, x) => s + (typeof x === 'string' ? x.length : 0), 0) <= LAYER_BYTES && res.layers.length === layout.parts.length + 1 && res.layers.every((x) => typeof x === 'string')) {
        // layers before meta and svg: a cached diagram never points at missing layers
        // written to a temp dir and swapped in, so a crash never leaves a half-written layer set behind a cache hit
        const dir = path.join(outDir, hash), tmp = dir + '.tmp';
        fs.rmSync(tmp, {recursive: true, force: true});
        fs.mkdirSync(tmp);
        res.layers.forEach((x, i) => fs.writeFileSync(path.join(tmp, i === 0 ? 'base.svg' : `p${i - 1}.svg`), x));
        fs.rmSync(meta, {force: true});
        fs.rmSync(dir, {recursive: true, force: true});
        fs.renameSync(tmp, dir);
        layout = {...layout, dir: `mermaid/${hash}`};
      } else layout = null;
      fs.writeFileSync(meta + '.tmp', JSON.stringify({nodes: res.nodes, w: res.w, h: res.h, ...(layout ? {layout} : {})}));
      fs.renameSync(meta + '.tmp', meta);
      fs.writeFileSync(dest + '.tmp', res.svg);
      fs.renameSync(dest + '.tmp', dest);
      results.push({key, ok: true, svg: `mermaid/${hash}.svg`, nodes: res.nodes, w: res.w, h: res.h, ...(layout ? {layout} : {})});
    } catch (e) {
      results.push({key, ok: false, error: String(e && e.message || e)});
    }
  }
} catch (e) {
  console.log(JSON.stringify({fatal: String(e && e.message || e)}));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close({silent: true}).catch(() => {});
}
if (process.exitCode !== 2) console.log(JSON.stringify(results));
process.exit(process.exitCode || 0);
