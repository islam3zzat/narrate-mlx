// Single source of truth for the script JSON a caller writes to <workdir>/scripts/<id>.json.
// - explainer.py check/audio/render validate every script against ScriptSchema (src/cli.ts).
// - `explainer.py schema` prints the JSON Schema generated from it, so callers can see exactly what to send.
// - The shape of each visual type lives in src/visuals/<type>/schema.ts; src/visuals/registry.ts assembles them into VisualSchema.
// - types.ts derives the Remotion prop types from it. Keep descriptions short: they end up in the JSON Schema.
import {z} from 'zod';
import {text} from './visuals/common';
import {VisualSchema, focusTargetsOf} from './visuals/registry';
import {CAPABILITIES, DIAGRAM_TYPES, THREE_D_TYPES} from './visuals/capabilities';
import {normWord, arVariants, sameWord, normName} from './words';
import {StyleNameSchema} from './styles';
import {THEMES} from './themes';

// Which types support `focus`, `continues` and 3D comes from each type's capabilities (src/visuals/<type>/capabilities.ts).
export {DIAGRAM_TYPES, THREE_D_TYPES};
const isDiagram = (v: ScriptVisual): boolean => (DIAGRAM_TYPES as readonly string[]).includes(v.type);

export {normWord, arVariants, sameWord, normName};
/** Index of the first narration word at or after `from` where `phrase` starts (whole words, in sequence), or -1. */
export const findPhrase = (narration: string, phrase: string, from = 0): number => {
  const words = narration.split(/\s+/).map(normWord);
  const parts = phrase.split(/\s+/).map(normWord).filter(Boolean);
  if (!parts.length) return -1;
  for (let i = from; i + parts.length <= words.length; i++) if (parts.every((p, j) => sameWord(words[i + j], p))) return i;
  return -1;
};

export const FocusSchema = z.strictObject({
  at: text('Word or phrase from the narration, spoken when the focus should change; focus entries follow the narration order'),
  on: z.array(z.string()).describe('What to bring forward from then on: node, class, participant, svg part, timeline event or stat ids, or "from->to" for an edge, relation or message. Everything else is dimmed (a crowded diagram also zooms in). [] ends the focus'),
});

export const SceneSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'id must match [A-Za-z0-9_-]+').describe('Unique within the script, e.g. s01'),
  narration: text('What the voice says: short sentences, 15 to 60 words'),
  cues: z.array(z.string()).optional().describe('Optional, one per revealed item (bullet, step, row, node, message, ...): a word or phrase from the narration at which that item should appear. Use "" to leave an item automatic. Only needed when automatic matching places an item wrongly. In a scene with "continues", only the new items count'),
  focus: z.array(FocusSchema).min(1).max(6).optional().describe('graph, class, sequence, svg, timeline, stat and mermaid only: point at parts already on screen as the narration talks about them (for mermaid: node ids or labels as drawn, or "from->to" for a line between them)'),
  continues: z.literal(true).optional().describe('graph, class and sequence only: this scene carries on the previous scene\'s diagram (same type, shared ids). Shared parts stay on screen and move to their new places, only new ones are revealed. List the full diagram again'),
  chapter: text('Optional chapter card shown via @remotion/transitions before this scene when starting a new part (not allowed with continues)').optional(),
  facts: z.array(z.string().regex(/^[a-z]\d{2,3}$/, 'fact id must be one letter and two or three digits, e.g. e01')).max(20).optional().describe('Styles with a fact ledger (style flag): ids of the ledger.json facts this scene covers; check fails when a required fact is in no scene'),
  section: z.string().trim().min(1).max(40).optional().describe('Styles: which part of the style\'s structure this scene is (one of the style\'s sections, e.g. "decisions"); optional'),
  visual: VisualSchema,
}).superRefine((sc, ctx) => {
  const v = sc.visual;
  if (!sc.focus) return;
  if (!CAPABILITIES[v.type].focus) {
    const focusTypes = Object.entries(CAPABILITIES).filter(([, c]) => c.focus).map(([t]) => t).join(', ');
    ctx.addIssue({code: 'custom', path: ['focus'], message: `focus works on ${focusTypes} scenes, not "${v.type}"`});
    return;
  }
  const targets = focusTargetsOf(v);
  const ids = targets ? new Set(targets.ids) : null;
  const links = targets ? new Set((targets.links ?? []).map(([a, b]) => `${a}->${b}`)) : null;
  let pos = 0;
  sc.focus.forEach((f, i) => {
    const hit = findPhrase(sc.narration, f.at, pos);
    if (hit < 0) ctx.addIssue({code: 'custom', path: ['focus', i, 'at'], message: `"${f.at}" is not in the narration${i ? ' after the previous focus phrase' : ''}`});
    else pos = hit + 1;
    if (!ids || !links) return; // dynamic targets (e.g. mermaid) are validated after rendering
    f.on.forEach((t, j) => {
      const ok = t.includes('->') ? links.has(t.replace(/\s+/g, '')) : ids.has(t);
      if (!ok) ctx.addIssue({code: 'custom', path: ['focus', i, 'on', j], message: t.includes('->') ? `no edge, relation or message "${t}"` : `unknown id "${t}"`});
    });
  });
});

export const LANGUAGES = ['en', 'ar'] as const;
export const MODES = ['2d', '3d'] as const;

export const ScriptSchema = z.strictObject({
  $schema: z.string().optional(),
  language: z.enum(LANGUAGES).default('en').describe('Narration language: "en" (default, Kokoro voice) or "ar" (Modern Standard Arabic, SILMA voice). "ar" also mirrors every layout right to left. Arabic narration must be fully vowelled (tashkeel), with numbers written as words and no Latin letters'),
  mode: z.enum(MODES).default('2d').describe('"2d" (default) or "3d": every scene is drawn in 3D (WebGL), with depth used for meaning (staircases, terraces, stacks); allows the 3D-only layers3d type. continues is not supported in 3D; graph direction is ignored (3D graphs always recede into depth)'),
  theme: z.enum(THEMES).optional().describe('Visual theme: "cel-sky" (2.5D cel-shaded sky, default) or "paper" (flat neo-brutalist dotted paper)'),
  style: StyleNameSchema.optional().describe('Audience/purpose style (explainer.py styles lists them;). Sets default speed, scene and length bounds, narration lints and what a fact ledger must cover. Absent = "explainer"'),
  title: text('Video title, shown top-left'),
  scenes: z.array(SceneSchema).min(1).describe('Scenes in play order; one idea each'),
}).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.scenes.forEach((s, i) => {
    if (seen.has(s.id)) ctx.addIssue({code: 'custom', path: ['scenes', i, 'id'], message: `duplicate scene id "${s.id}"`});
    seen.add(s.id);
    if ((THREE_D_TYPES as readonly string[]).includes(s.visual.type) && v.mode !== '3d') ctx.addIssue({code: 'custom', path: ['scenes', i, 'visual', 'type'], message: `"${s.visual.type}" needs "mode": "3d" at the top of the script`});
    if (!(THREE_D_TYPES as readonly string[]).includes(s.visual.type) && !(CAPABILITIES[s.visual.type].modes as readonly string[]).includes(v.mode)) ctx.addIssue({code: 'custom', path: ['scenes', i, 'visual', 'type'], message: `"${s.visual.type}" cannot be drawn in "${v.mode}" mode (it supports: ${(CAPABILITIES[s.visual.type].modes as readonly string[]).join(', ')}); ${v.mode === '3d' ? 'remove "mode": "3d" from the top of the script or use another visual type' : 'use another visual type'}`});
    if (v.mode === '3d' && ((s.visual.type === 'mermaid' && s.visual.build) || (s.focus && CAPABILITIES[s.visual.type].focus === '2d'))) {
      const msg = s.visual.type === 'mermaid'
        ? 'build and focus on mermaid scenes are 2D only; remove them in 3D mode'
        : `focus on "${s.visual.type}" scenes is 2D only; remove it in 3D mode`;
      ctx.addIssue({code: 'custom', path: ['scenes', i, 'visual'], message: msg});
    }
    if (!s.continues) return;
    if (s.chapter) ctx.addIssue({code: 'custom', path: ['scenes', i, 'chapter'], message: 'chapter cannot be combined with continues (a continuation keeps the previous diagram on screen across the cut)'});
    if (v.mode === '3d') {
      ctx.addIssue({code: 'custom', path: ['scenes', i, 'continues'], message: 'continues is not supported in 3D mode yet; remove it (the next scene then draws the diagram again)'});
      return;
    }
    const prev = v.scenes[i - 1]?.visual;
    const where = {code: 'custom' as const, path: ['scenes', i, 'continues']};
    if (!isDiagram(s.visual)) ctx.addIssue({...where, message: `continues works on graph, class and sequence scenes, not "${s.visual.type}"`});
    else if (!prev) ctx.addIssue({...where, message: 'the first scene has nothing to continue'});
    else if (prev.type !== s.visual.type) ctx.addIssue({...where, message: `the previous scene is a "${prev.type}", this one a "${s.visual.type}"; continues needs the same type`});
    else if (!(focusTargetsOf(s.visual)?.ids ?? []).some((id) => (focusTargetsOf(prev)?.ids ?? []).includes(id))) ctx.addIssue({...where, message: 'shares no ids with the previous scene; reuse the ids of the parts that carry over'});
  });
}).describe('One video: <workdir>/scripts/<id>.json');

export type Script = z.infer<typeof ScriptSchema>;
export type ScriptVisual = z.infer<typeof VisualSchema>;
