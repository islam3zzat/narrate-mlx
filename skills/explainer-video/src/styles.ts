// Styles: audience/purpose profiles (<name>.json + <name>.md). Pure leaf (no fs, React, remotion or three):
// the schema of a style definition, the fact kinds a ledger uses, and the name format a script's `style` may take.
// Style definitions are discovered dynamically from <workdir>/styles/, ~/.config/explainer-video/styles/, and styles/.
import {z} from 'zod';
import constants from './constants.json';
import {BUILTIN_CAPABILITIES, CAPABILITIES} from './visuals/capabilities';

/** The default style: what a script without `style` is. Needs no feature flag. */
export const DEFAULT_STYLE = 'explainer';
export const StyleNameSchema = z.string().min(1).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, 'style name must match [a-z0-9][a-z0-9-]*');
export type StyleName = string;

export const FACT_KINDS = [
  'event', 'decision', 'action', 'owner', 'number', 'system', 'root_cause', 'factor', 'mitigation', 'open_question', 'contradiction', 'ambiguity',
] as const;
export type FactKind = (typeof FACT_KINDS)[number];
export const FactKindSchema = z.enum(FACT_KINDS);

/** Built-in visual type names vs built-in + user-local visual type names. */
export const BUILTIN_VISUAL_TYPES = Object.keys(BUILTIN_CAPABILITIES) as [
  keyof typeof BUILTIN_CAPABILITIES,
  ...(keyof typeof BUILTIN_CAPABILITIES)[],
];
export const VISUAL_TYPES = Object.keys(CAPABILITIES) as [keyof typeof CAPABILITIES, ...(keyof typeof CAPABILITIES)[]];

const range = (what: string) =>
  z.tuple([z.number().int().min(0), z.number().int().min(1)]).refine(([lo, hi]) => lo <= hi, `${what}: min must not exceed max`);

const buildStyleSchema = (visualTypes: readonly [string, ...string[]]) =>
  z.strictObject({
    name: StyleNameSchema,
    description: z.string().min(1).max(300),
    audience: z.string().min(1).max(200),
    defaults: z.strictObject({
      speed: z.number().min(0.75).max(1.5).describe('Speaking speed used when --speed is not given (cache key includes it)'),
      voice: z.string().min(1).optional().describe('Voice used when --voice is not given'),
    }),
    bounds: z.strictObject({
      scenes: range('scenes'),
      seconds: range('seconds'),
      wordsPerScene: range('wordsPerScene'),
    }).describe('Per video; outside these, `check` warns (never an error)'),
    preferredVisuals: z.array(z.enum(visualTypes as [string, ...string[]])).min(1),
    ledger: z.strictObject({
      required: z.boolean().describe('The workdir must have ledger.json'),
      kinds: z.array(FactKindSchema).describe('Fact kinds this style uses (others only warn)'),
      mustCover: z.array(FactKindSchema).describe('Every fact of these kinds must be referenced by a scene (or deferred, when allowed)'),
      coverHigh: z.boolean().describe('Every importance:high fact must be referenced by a scene (never deferrable)'),
      quoteKinds: z.array(FactKindSchema).default([]).describe('Every fact of these kinds must carry a `quote` and an `at` (error otherwise)'),
      allowDeferred: z.boolean().describe('A low fact may carry deferred:"report" instead of a scene'),
    }),
    sections: z.array(z.string().min(1).max(40)).optional().describe('Scene `section` tags this style expects, in order; one never used warns'),
    lint: z.strictObject({blameless: z.boolean().describe('Turn on the blame-phrase lint')}),
    dialogue: z.strictObject({
      speakers: z.literal(2).describe('The script must declare this many speakers (two voices in conversation)'),
      maxConsecutive: z.number().int().min(1).max(10).describe('Warn when one speaker has more than this many scenes in a row'),
      minShare: z.number().min(0).max(0.5).describe('Warn when a speaker says less than this share of the words'),
      maxDuo: z.number().int().min(0).max(20).optional().describe('Warn when the script has more `duo` scenes than this, or two in a row (a talking-heads picture teaches nothing new)'),
      stanceFrom: z.number().int().min(1).max(200).optional().describe('Warn when a script of this many scenes or more has no `stance` scene (the disagreements should be drawn)'),
    }).optional().describe('Podcast-style two-voice dialogue: the script needs `speakers` and a `speaker` on every scene'),
  });

export const BuiltinStyleSchema = buildStyleSchema(BUILTIN_VISUAL_TYPES);
export const StyleSchema = buildStyleSchema(VISUAL_TYPES);
export type StyleDef = z.infer<typeof StyleSchema>;

// ---------------------------------------------------------------- what a style checks in a script (pure)

/** Spoken words per second and the silence a scene adds (lead + tail), shared with Python via constants.json. */
const WPS: Record<string, number> = constants.wps;
const SCENE_PAD_SEC = constants.leadSec + constants.tailSec;

export type StyleScene = {id: string; narration: string; section?: string; speaker?: string; visual: {type: string}};
export type StyleScript = {id: string; language?: string; speakers?: Readonly<Record<string, unknown>>; scenes: readonly StyleScene[]};

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Bounds (scene count, estimated length, words per scene), section tags and the share of preferred visuals, for the scripts
 * that use `style`. Errors: a `section` the style does not list. Everything else is a warning. Messages are "<video>/<scene>: ..." or "<video>: ...".
 * Sections are looked at across all the scripts given (a series: each part need not hold every section).
 */
export const styleIssues = (scripts: readonly StyleScript[], style: StyleDef, speed: number = style.defaults.speed): {errors: string[]; warnings: string[]} => {
  const errors: string[] = [], warnings: string[] = [];
  const [sMin, sMax] = style.bounds.scenes, [tMin, tMax] = style.bounds.seconds, [wMin, wMax] = style.bounds.wordsPerScene;
  for (const s of scripts) {
    const n = s.scenes.length;
    if (n < sMin || n > sMax) warnings.push(`${s.id}: ${n} scene(s); style "${style.name}" wants ${sMin} to ${sMax}${n > sMax ? ' (split it into parts)' : ''}`);
    const total = s.scenes.reduce((a, sc) => a + words(sc.narration), 0);
    const sec = Math.round(total / ((WPS[s.language ?? 'en'] ?? 2.6) * speed) + SCENE_PAD_SEC * n);
    if (sec < tMin || sec > tMax) warnings.push(`${s.id}: about ${sec} s of video; style "${style.name}" wants ${tMin} to ${tMax} s`);
    for (const sc of s.scenes) {
      const w = words(sc.narration);
      if (w < wMin || w > wMax) warnings.push(`${s.id}/${sc.id}: ${w} words; style "${style.name}" wants ${wMin} to ${wMax} per scene`);
    }
    const pref = s.scenes.filter((sc) => (style.preferredVisuals as string[]).includes(sc.visual.type)).length;
    if (n && pref / n < 0.5) warnings.push(`${s.id}: only ${pref} of ${n} scenes use the visuals this style prefers (${style.preferredVisuals.join(', ')})`);
  }
  const dlg = style.dialogue;
  if (dlg) for (const s of scripts) {
    const ids = Object.keys(s.speakers ?? {});
    if (ids.length !== dlg.speakers) {
      errors.push(`${s.id}: style "${style.name}" is a ${dlg.speakers}-voice dialogue; the script needs "speakers" with ${dlg.speakers} entries (it has ${ids.length})`);
      continue;
    }
    let run = 0, prev: string | undefined, flagged = false;
    for (const sc of s.scenes) {
      run = sc.speaker === prev ? run + 1 : 1;
      prev = sc.speaker;
      if (run > dlg.maxConsecutive && !flagged) {
        flagged = true;
        warnings.push(`${s.id}/${sc.id}: "${sc.speaker}" speaks ${run} scenes in a row; style "${style.name}" wants at most ${dlg.maxConsecutive} (hand the floor over)`);
      }
    }
    if (dlg.maxDuo !== undefined) {
      const duos = s.scenes.filter((sc) => sc.visual.type === 'duo').length;
      if (duos > dlg.maxDuo) warnings.push(`${s.id}: ${duos} "duo" scenes; style "${style.name}" wants at most ${dlg.maxDuo} (use it for the opening question, a pivotal claim and the close)`);
      const at = s.scenes.findIndex((sc, i) => i > 0 && sc.visual.type === 'duo' && s.scenes[i - 1].visual.type === 'duo');
      if (at > 0) warnings.push(`${s.id}/${s.scenes[at].id}: "duo" twice in a row; alternate it with a picture that teaches`);
    }
    if (dlg.stanceFrom !== undefined && s.scenes.length >= dlg.stanceFrom && !s.scenes.some((sc) => sc.visual.type === 'stance')) {
      warnings.push(`${s.id}: ${s.scenes.length} scenes and no "stance" scene; style "${style.name}" wants the disagreements drawn (a stance arc built with continues)`);
    }
    const share = new Map(ids.map((id) => [id, 0]));
    let total = 0;
    for (const sc of s.scenes) if (sc.speaker !== undefined && share.has(sc.speaker)) { const w = words(sc.narration); share.set(sc.speaker, share.get(sc.speaker)! + w); total += w; }
    if (total) for (const [id, w] of share) if (w / total < dlg.minShare) warnings.push(`${s.id}: "${id}" says only ${Math.round((100 * w) / total)}% of the words; style "${style.name}" wants at least ${Math.round(dlg.minShare * 100)}%`);
  }
  if (style.sections) {
    const used = new Set<string>();
    for (const s of scripts) for (const sc of s.scenes) {
      if (!sc.section) continue;
      if (!style.sections.includes(sc.section)) errors.push(`${s.id}/${sc.id}: section "${sc.section}" is not a section of style "${style.name}" (${style.sections.join(', ')})`);
      else used.add(sc.section);
    }
    // tagging is optional: only when some scene is tagged does a missing section mean something
    if (used.size) for (const sec of style.sections) if (!used.has(sec)) warnings.push(`${scripts[0].id}: no scene${scripts.length > 1 ? ` of ${scripts.map((s) => s.id).join(', ')}` : ''} is tagged with section "${sec}" of style "${style.name}"`);
  }
  return {errors, warnings};
};
