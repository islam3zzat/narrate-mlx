// Run by explainer.py (not part of the Remotion bundle):
//   tsx src/cli.ts schema                 -> JSON Schema of a script on stdout
//   tsx src/cli.ts validate               -> stdin: {"<videoId>": <script json>, ...}
//                                            stdout: {"<videoId>": {"errors": [...], "warnings": [...]}}, each message
//                                            "<video>/<scene id>: ..." (schema errors first; empty errors = valid).
//                                            Optional key "$context": {ledger, source, strict, all} (explainer.py adds it when a script has a
//                                            style or facts): the workdir's ledger.json (parsed JSON or null), the source text (or null), --strict,
//                                            and every script of the workdir; the ledger's own messages come back under the key "$ledger".
//   tsx src/cli.ts docs [--write|--check] -> the visual-types block of SKILL.md (stdout); --write splices it into SKILL.md,
//                                            --check exits 1 when SKILL.md is stale
//   tsx src/cli.ts describe [--no-validate]             -> stdin: [{"visual": <visual>, "prev": <visual>|null}, ...]
//                                            stdout: [{"slots": [...], "carried": [...]}, ...] (see src/semantics)
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {parseEquationTerms, buildStyledLatex} from './visuals/equation/parse';
import {BuiltinScriptSchema, ScriptSchema} from './schema';
import {VisualSchema, REGISTRY, describe, lintScene, type VisualType} from './visuals/registry';
import {CAPABILITIES} from './visuals/capabilities';
import {CATALOG} from './visuals/catalog';
import type {CatalogVariant} from './visuals/catalog-types';
import constants from './constants.json';
import {lintVisualDir} from './visual-lint';
import {splice, visualsSection} from './docs';
import {lintNarration} from './lint-narration';
import {MermaidLayout} from './visuals/mermaid/schema';
import {checkMermaidAnimation, type MermaidCheckResult, type MermaidCheckScene} from './visuals/mermaid/focus';
import {LedgerSchema, ledgerIssues, type Ledger} from './ledger';
import {computeFrameSchedule} from './frame-schedule';
import {checkVisualFiles, writeVisualFiles} from './gen-visuals';
import {styleIssues, BuiltinStyleSchema, StyleSchema, DEFAULT_STYLE, type StyleDef} from './styles';
import {loadStyle} from './style-files';
import type {Visual, VideoData} from './types';
import type {Script as ScriptData} from './schema';

const [cmd, ...flags] = process.argv.slice(2);

type LedgerContext = {ledger: unknown | null; source: string | null; strict?: boolean; workdir?: string; all: Record<string, unknown>};

/** The workdir's ledger against all of its scripts, for the style they use (one ledger per workdir). */
const ledgerMessages = (ctx: LedgerContext): {errors: string[]; warnings: string[]} => {
  const errors: string[] = [], warnings: string[] = [];
  const scripts: {id: string; language?: string; scenes: {id: string; narration: string; facts?: string[]; section?: string; type?: string}[]; style?: string}[] = [];
  for (const [id, raw] of Object.entries(ctx.all)) {
    const r = ScriptSchema.safeParse(raw);
    if (r.success) scripts.push({id, language: r.data.language, scenes: r.data.scenes.map((sc) => ({id: sc.id, narration: sc.narration, facts: sc.facts, section: sc.section, type: sc.visual.type})), style: r.data.style});
  }
  const used = [...new Set(scripts.map((s) => s.style).filter((x): x is NonNullable<typeof x> => !!x))];
  const defs = new Map<string, StyleDef>();
  for (const n of used) {
    try { defs.set(n, loadStyle(n, ctx.workdir)); }
    catch (e) { errors.push(`style: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (errors.length) return {errors, warnings};
  const required = used.filter((n) => defs.get(n)!.ledger.required);
  const others = used.filter((n) => n !== DEFAULT_STYLE);
  let name: string = DEFAULT_STYLE;
  if (required.length > 1) errors.push(`ledger: styles ${required.join(' and ')} both need a ledger, but a workdir has one ledger.json: use a workdir per style`);
  else if (required.length === 1) name = required[0];
  else if (others.length === 1) name = others[0];
  else if (others.length > 1 && ctx.ledger) errors.push(`ledger: styles ${others.join(' and ')} are mixed in one workdir with one ledger.json: use a workdir per style`);
  if (errors.length) return {errors, warnings};
  let ledger: Ledger | null = null;
  if (ctx.ledger !== null && ctx.ledger !== undefined) {
    const r = LedgerSchema.safeParse(ctx.ledger);
    if (!r.success) {
      return {errors: r.error.issues.map((i) => `ledger: ${i.path.map((x) => (typeof x === 'number' ? `[${x}]` : `.${String(x)}`)).join('').replace(/^\./, '') || '(root)'}: ${i.message}`), warnings};
    }
    ledger = r.data;
  }
  return ledgerIssues(scripts, ledger, defs.get(name) ?? loadStyle(name, ctx.workdir), ctx.source ?? null, {strict: ctx.strict});
};

if (cmd === 'schema') {
  const targetSchema = flags.includes('--builtin') ? BuiltinScriptSchema : ScriptSchema;
  console.log(JSON.stringify(z.toJSONSchema(targetSchema, {io: 'input'}), null, 2));
} else if (cmd === 'style-schema') {
  const targetStyle = flags.includes('--builtin') ? BuiltinStyleSchema : StyleSchema;
  console.log(JSON.stringify(z.toJSONSchema(targetStyle, {io: 'input'}), null, 2));
} else if (cmd === 'validate') {
  let raw = '';
  let renderKatex: ((latex: string, opts: object) => string) | null = null;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    void (async () => {
    const scripts = JSON.parse(raw) as Record<string, any>;
    const ctx = scripts['$context'] as LedgerContext | undefined;
    delete scripts['$context'];
    const out: Record<string, {errors: string[]; warnings: string[]}> = {};
    const parsed: Record<string, ScriptData> = {};
    for (const [id, script] of Object.entries(scripts)) {
      const r = ScriptSchema.safeParse(script);
      if (!r.success) {
        // A path inside a scene becomes "<video>/<scene id>: <path>: <message>"; anything else "<video>: <path>: <message>".
        const errors = r.error.issues.map((i) => {
          const p = i.path.map((x) => (typeof x === 'number' ? `[${x}]` : `.${String(x)}`)).join('').replace(/^\./, '');
          const m = /^scenes\[(\d+)\]\.?(.*)$/.exec(p);
          const scene = m && Array.isArray(script?.scenes) ? script.scenes[Number(m[1])] : undefined;
          if (m && scene && typeof scene === 'object' && !Array.isArray(scene)) {
            const sid = 'id' in scene ? scene.id : `#${Number(m[1]) + 1}`;
            return `${id}/${sid}: ${m[2] || '(scene)'}: ${i.message}`;
          }
          return `${id}: ${p || '(root)'}: ${i.message}`;
        });
        out[id] = {errors, warnings: []};
        continue;
      }
      const errors: string[] = [], warnings: string[] = [];
      let style: StyleDef | null = null;
      if (r.data.style) {
        try { style = loadStyle(r.data.style, ctx?.workdir); }
        catch (e) { errors.push(`${id}: style: ${e instanceof Error ? e.message : String(e)}`); }
      }
      for (const sc of r.data.scenes) {
        const l = lintScene(sc, {lang: r.data.language, mode: r.data.mode});
        errors.push(...l.errors.map((e) => `${id}/${sc.id}: ${e}`));
        warnings.push(...l.warnings.map((w) => `${id}/${sc.id}: ${w}`));
        if (sc.visual.type === 'equation') {
          if (!renderKatex) {
            const {default: katexMod} = await import('katex');
            renderKatex = katexMod.renderToString.bind(katexMod);
          }
          const active = new Set(sc.visual.terms.slice(0, 1).map((t) => t.id));
          sc.visual.equations.forEach((eq, ei) => {
            const parsedEq = parseEquationTerms(eq.latex);
            const styled = buildStyledLatex(parsedEq.segments, active, active.size > 0, {
              ink: '#111111',
              dim: '#666666',
              defaultBorder: '#111111',
              defaultBg: '#fff3bf',
              termColors: {},
            });
            try {
              renderKatex!(styled, {displayMode: true, trust: false, maxExpand: 64, strict: 'warn', throwOnError: true});
            } catch (e) {
              errors.push(`${id}/${sc.id}: equations[${ei}].latex: ${e instanceof Error ? e.message : String(e)}`);
            }
          });
        }
      }
      // narration style (English only; the blameless lint is off until the script's style turns it on)
      warnings.push(...lintNarration(r.data.scenes, {lang: r.data.language, blameless: style?.lint.blameless}).map((w) => `${id}/${w.scene}: ${w.message}`));
      out[id] = {errors, warnings};
      if (style || !r.data.style) parsed[id] = r.data;
    }
    // style checks (bounds, sections, preferred visuals), once per style over the scripts that use it
    const byStyle = new Map<string, string[]>();
    for (const [id, d] of Object.entries(parsed)) if (d.style) byStyle.set(d.style, [...(byStyle.get(d.style) ?? []), id]);
    for (const [name, ids] of byStyle) {
      const res = styleIssues(ids.map((id) => ({id, language: parsed[id].language, scenes: parsed[id].scenes})), loadStyle(name, ctx?.workdir));
      for (const [kind, msgs] of [['errors', res.errors], ['warnings', res.warnings]] as const) {
        for (const m of msgs) {
          const home = ids.find((id) => m.startsWith(`${id}/`) || m.startsWith(`${id}:`)) ?? ids[0];
          out[home][kind].push(m);
        }
      }
    }
    if (ctx) out['$ledger'] = ledgerMessages(ctx);
    console.log(JSON.stringify(out));
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  });
} else if (cmd === 'lint-visual') {
  const slug = flags[0];
  if (!slug) {
    console.error('usage: cli.ts lint-visual <slug>');
    process.exit(2);
  }
  const builtinDir = path.join(__dirname, 'visuals');
  const localDir = path.join(__dirname, 'visuals-local');
  const useLocal = !fs.existsSync(path.join(builtinDir, slug)) && fs.existsSync(path.join(localDir, slug));
  const lintRes = lintVisualDir(useLocal ? localDir : builtinDir, slug, __dirname);
  const catalogErrors: string[] = [];
  let catalogChecks = 0;
  if (!(slug in REGISTRY)) {
    catalogErrors.push(`${slug}: not registered in REGISTRY (run \`make docs\` / \`gen-visuals\`)`);
  } else {
    const t = slug as VisualType;
    const entry = CATALOG[t];
    const variants = [entry.default, ...(entry.variants ?? [])] as CatalogVariant<typeof t>[];
    for (const v of variants) {
      catalogChecks++;
      const parsed = REGISTRY[t].schema.safeParse(v.visual);
      if (!parsed.success) {
        catalogErrors.push(`${slug}/${v.id}: schema error: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      const desc = describe(parsed.data as Visual, v.prev as Visual | undefined, v.mermaidRendered);
      if (!Array.isArray(desc.slots) || desc.slots.length !== desc.carried.length) {
        catalogErrors.push(`${slug}/${v.id}: invalid describe() output`);
      }
      const mode = v.mode ?? CAPABILITIES[t].modes[0];
      if (!(CAPABILITIES[t].modes as readonly string[]).includes(mode)) {
        catalogErrors.push(`${slug}/${v.id}: unsupported mode "${mode}"`);
      }
      const lint = lintScene(
        {
          visual: parsed.data as ScriptData['scenes'][number]['visual'],
          narration: v.narration,
        },
        {lang: v.dir === 'rtl' ? 'ar' : 'en', mode},
      );
      for (const e of lint.errors) catalogErrors.push(`${slug}/${v.id}: ${e}`);
      if (v.focus?.length) {
        const ft = REGISTRY[t].meta.focusTargets?.(parsed.data as never);
        if (ft) {
          const known = new Set(ft.ids);
          for (const f of v.focus) {
            for (const target of f.on) {
              if (!known.has(target) && !target.includes('->')) {
                catalogErrors.push(`${slug}/${v.id}: unknown focus target "${target}"`);
              }
            }
          }
        }
      }
    }
  }
  const out = {slug, checkedFiles: lintRes.checkedFiles, violations: lintRes.violations, catalogChecks, catalogErrors};
  console.log(JSON.stringify(out, null, 2));
  if (lintRes.violations.length > 0 || catalogErrors.length > 0) process.exit(1);
} else if (cmd === 'catalog-props') {
  const slug = flags[0];
  if (!slug || !(slug in CATALOG)) {
    console.error(`unknown visual "${slug ?? ''}"`);
    process.exit(1);
  }
  const t = slug as VisualType;
  const entry = CATALOG[t];
  const caps = CAPABILITIES[t];
  const toProps = (v: any) => ({
    type: t,
    variantLabel: v.label,
    theme: v.theme ?? 'cel-sky',
    mode: v.mode ?? caps.modes[0],
    dir: v.dir ?? 'ltr',
    visual: v.visual,
    narration: v.narration,
    ...(v.focus ? {focus: v.focus} : {}),
    ...(v.mermaidRendered ? {mermaidRendered: v.mermaidRendered} : {}),
    ...(v.figureAsset ? {figureAsset: v.figureAsset} : {}),
    ...(v.prev ? {prev: v.prev} : {}),
  });
  const durOf = (v: {durationSec?: number}) => Math.round((v.durationSec ?? 8) * constants.fps);
  console.log(
    JSON.stringify({
      type: t,
      rtl: caps.rtl,
      modes: caps.modes,
      leadFrames: Math.round(constants.leadSec * constants.fps),
      durationInFrames: durOf(entry.default),
      defaultProps: toProps(entry.default),
      variants: (entry.variants ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        durationInFrames: durOf(v),
        props: toProps(v),
      })),
    }),
  );
} else if (cmd === 'gen-visuals') {
  const visualsDir = path.join(__dirname, 'visuals');
  if (flags.includes('--check')) {
    const stale = checkVisualFiles(visualsDir);
    if (stale.length) {
      console.error(`${stale.join(', ')} is stale: run \`make docs\``);
      process.exit(1);
    }
  } else {
    const {updated} = writeVisualFiles(visualsDir);
    console.log(updated.length ? `updated ${updated.join(', ')}` : 'visual registries are up to date');
  }
} else if (cmd === 'docs') {
  const skillMd = path.join(__dirname, '..', 'SKILL.md');
  const cur = fs.readFileSync(skillMd, 'utf8'), next = splice(cur);
  if (flags.includes('--write')) {
    if (next !== cur) fs.writeFileSync(skillMd, next);
    console.log(next === cur ? 'SKILL.md is up to date' : 'SKILL.md updated');
  } else if (flags.includes('--check')) {
    if (next !== cur) {
      console.error('SKILL.md visual-types section is stale: run `make docs`');
      process.exit(1);
    }
  } else console.log(visualsSection());
} else if (cmd === 'check-generated') {
  const skillMd = path.join(__dirname, '..', 'SKILL.md');
  const curMd = fs.readFileSync(skillMd, 'utf8');
  const staleVisuals = checkVisualFiles(path.join(__dirname, 'visuals'));
  const checks: [string, boolean][] = [
    ...staleVisuals.map((f): [string, boolean] => [f, false]),
    ['SKILL.md visual-types section', splice(curMd) === curMd],
    [
      'schema/script.schema.json',
      `${JSON.stringify(z.toJSONSchema(BuiltinScriptSchema, {io: 'input'}), null, 2)}\n` ===
        fs.readFileSync(path.join(__dirname, '..', 'schema/script.schema.json'), 'utf8'),
    ],
    [
      'schema/style.schema.json',
      `${JSON.stringify(z.toJSONSchema(BuiltinStyleSchema, {io: 'input'}), null, 2)}\n` ===
        fs.readFileSync(path.join(__dirname, '..', 'schema/style.schema.json'), 'utf8'),
    ],
  ];
  const stale = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (stale.length) {
    console.error(`${stale.join(', ')} is stale: run \`make docs\``);
    process.exit(1);
  }
} else if (cmd === 'describe') {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    const fail = (msg: string): never => {
      console.error(`describe: ${msg}`);
      process.exit(1);
    };
    let items: {visual: Visual; prev?: Visual | null; rendered?: {svg?: string; layout?: unknown}}[];
    try {
      items = JSON.parse(raw);
    } catch (e) {
      return fail(`input is not JSON (${(e as Error).message})`);
    }
    if (!Array.isArray(items)) return fail('input must be an array of {visual, prev}');
    const check = (v: unknown, where: string) => {
      if (!v || typeof v !== 'object') return fail(`${where} is not an object`);
      const r = VisualSchema.safeParse(v);
      if (!r.success) fail(`${where}: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
    };
    // --no-validate: only for tests/semantics_cases.jsonl, whose generated variants are deliberately malformed (dangling edges).
    if (!flags.includes('--no-validate')) items.forEach((x, i) => {
      if (!x || typeof x !== 'object') fail(`item ${i} is not an object`);
      check(x.visual, `item ${i} visual`);
      if (x.prev) check(x.prev, `item ${i} prev`);
      if (x.rendered?.layout !== undefined) {
        const l = MermaidLayout.safeParse(x.rendered.layout);
        if (!l.success) fail(`item ${i} rendered.layout: ${l.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
      }
    });
    console.log(JSON.stringify(items.map((x) => describe(x.visual, x.prev ?? undefined, x.rendered))));
  });
} else if (cmd === 'validate-mermaid') {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    const {scripts, results} = JSON.parse(raw) as {
      scripts: Record<string, {scenes: MermaidCheckScene[]}>;
      results: Record<string, MermaidCheckResult>;
    };
    console.log(JSON.stringify(checkMermaidAnimation(scripts, results)));
  });
} else if (cmd === 'schedule') {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    const video = JSON.parse(raw) as VideoData;
    console.log(JSON.stringify(computeFrameSchedule(video)));
  });
} else {
  console.error('usage: cli.ts schema | validate | validate-mermaid | describe | schedule | gen-visuals | lint-visual | catalog-props | docs | check-generated');
  process.exit(2);
}
