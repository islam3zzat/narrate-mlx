// Single source of truth for the script JSON a caller writes to <workdir>/scripts/<id>.json.
// - explainer.py check/audio/render validate every script against ScriptSchema (src/cli.ts).
// - `explainer.py schema` prints the JSON Schema generated from it, so callers can see exactly what to send.
// - The shape of each visual type lives in src/visuals/<type>/schema.ts; src/visuals/registry.ts assembles them into VisualSchema.
// - types.ts derives the Remotion prop types from it. Keep descriptions short: they end up in the JSON Schema.
import {resolveLayout, whiteboardBlockers} from './whiteboard/eligible';
import {unsupportedGlyph} from './whiteboard/glyphs';
import {z} from 'zod';
import {text} from './visuals/common';
import {textCharIssues} from './visuals/chars';
import {BuiltinVisualSchema, VisualSchema, describe as describeVisual, focusTargetsOf, speakerRefsOf} from './visuals/registry';
import {BOARD_CONTINUES_TYPES, CAPABILITIES, DIAGRAM_TYPES, DIALOGUE_TYPES, THREE_D_TYPES} from './visuals/capabilities';
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

export const SPEAKER_ID = /^[a-z][a-z0-9]{0,11}$/;
/** Voice names look like af_heart; membership in the speak skill's voices.json is checked by cli.ts (src/voices.ts), since this file is bundled for render. */
export const VOICE_FORMAT = /^[a-z]{2}_[a-z]+$/;
export const SpeakerSchema = z.strictObject({
  name: z.string().trim().min(1).max(24).describe('Display name shown on screen, e.g. "Dana"'),
  role: z.string().trim().min(1).max(48).describe('Role shown under the name, e.g. "Principal Security Engineer"'),
  voice: z.string().regex(VOICE_FORMAT, 'voice must be a Kokoro English voice name such as af_heart or am_michael').describe('Kokoro English voice (the names in skills/speak/voices.json). The two speakers need different voices'),
});

/**
 * Speaker ids a visual names (a `by` on an item, see speakerRefs in the type's semantics.ts) against the script's declared speakers.
 * `refs[i]` is the ids scene `i` names. A video without `speakers` (`declared` null) cannot name anyone.
 */
export const speakerRefIssues = (declared: readonly string[] | null, refs: readonly (readonly string[])[]): {scene: number; message: string}[] =>
  refs.flatMap((ids, scene) => [...new Set(ids)].flatMap((id) => {
    if (!declared) return [{scene, message: `names speaker "${id}" (by), but the script has no "speakers": remove "by" or declare the two speakers at the top of the script`}];
    return declared.includes(id) ? [] : [{scene, message: `names unknown speaker "${id}" (declared: ${declared.join(', ')})`}];
  }));

const buildSceneSchema = <S extends z.ZodTypeAny>(visualSchema: S) =>
  z
    .strictObject({
      id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'id must match [A-Za-z0-9_-]+').describe('Unique within the script, e.g. s01'),
      narration: text('What the voice says: short sentences, 15 to 60 words'),
      cues: z.array(z.string()).optional().describe('Optional, one per revealed item (bullet, step, row, node, message, ...): a word or phrase from the narration at which that item should appear. Use "" to leave an item automatic. Only needed when automatic matching places an item wrongly. In a scene with "continues", only the new items count'),
      focus: z.array(FocusSchema).min(1).max(6).optional().describe('graph, class, sequence, svg, timeline, stat and mermaid only: point at parts already on screen as the narration talks about them (for mermaid: node ids or labels as drawn, or "from->to" for a line between them)'),
      continues: z.literal(true).optional().describe('graph, class and sequence (and, on the whiteboard layout, bullets, steps and flow): this scene carries on the previous scene\'s diagram (same type, shared ids). Shared parts stay on screen and move to their new places, only new ones are revealed. List the full diagram again'),
      chapter: text('Optional chapter card shown via @remotion/transitions before this scene when starting a new part (not allowed with continues)').optional(),
      facts: z.array(z.string().regex(/^[a-z]\d{2,3}$/, 'fact id must be one letter and two or three digits, e.g. e01')).max(20).optional().describe('Styles with a fact ledger (style flag): ids of the ledger.json facts this scene covers; check fails when a required fact is in no scene'),
      speaker: z.string().regex(SPEAKER_ID, 'speaker must be one of the ids in the script\'s "speakers"').optional().describe('Dialogue videos: the id (a key of the script\'s "speakers") of who says this narration. Required on every scene when the script has "speakers", not allowed otherwise'),
      section: z.string().trim().min(1).max(40).optional().describe('Styles: which part of the style\'s structure this scene is (one of the style\'s sections, e.g. "decisions"); optional'),
      visual: visualSchema,
    })
    .superRefine((rawScene, ctx) => {
      const sc = rawScene as {narration: string; focus?: {at: string; on: string[]}[]; visual: ScriptVisual};
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

export const SceneSchema = buildSceneSchema(VisualSchema);

export const LANGUAGES = ['en', 'ar'] as const;
export const MODES = ['2d', '3d'] as const;

const buildScriptSchema = <S extends z.ZodTypeAny>(sceneSchema: S) =>
  z
    .strictObject({
      $schema: z.string().optional(),
      language: z.enum(LANGUAGES).default('en').describe('Narration language: "en" (default, Kokoro voice) or "ar" (Modern Standard Arabic, SILMA voice). "ar" also mirrors every layout right to left. Arabic narration must be fully vowelled (tashkeel), with numbers written as words and no Latin letters'),
      mode: z.enum(MODES).default('2d').describe('"2d" (default) or "3d": every scene is drawn in 3D (WebGL), with depth used for meaning (staircases, terraces, stacks); allows the 3D-only layers3d type. continues is not supported in 3D; graph direction is ignored (3D graphs always recede into depth)'),
      theme: z.enum(THEMES).optional().describe('Visual theme: "cel-sky" (2.5D cel-shaded sky, default) or "paper" (flat neo-brutalist dotted paper)'),
      layout: z.enum(['whiteboard', 'slides']).optional().describe('Layout: absent = automatic (the whiteboard whenever the script allows it, else slides); "whiteboard" = hand-drawn board (strokes, underlines and check marks drawn on in time with the narration; no title bar, counter or slide transitions), an error if the script cannot use it; "slides" = title bar, counter, boxed captions and slide transitions. The board needs English, 2D, the paper theme, no chapter cards, and `continues` only on bullets, steps, flow, stance and notes (the carried part is drawn finished). title, bullets, flow, steps, fanout, compare and callout are drawn by hand, every other 2D type is shown on the board in a sketched, hand-lettered style'),
      style: StyleNameSchema.optional().describe('Audience/purpose style (explainer.py styles lists them;). Sets default speed, scene and length bounds, narration lints and what a fact ledger must cover. Absent = "explainer"'),
      speakers: z.record(z.string(), SpeakerSchema).optional().describe('Two-voice dialogue (podcast style): exactly 2 speakers keyed by id (lowercase letters and digits, starting with a letter, up to 12; e.g. "a", "b"); then every scene needs a `speaker`, one scene per turn. English only; --voice cannot be used'),
      title: text('Video title, shown top-left'),
      scenes: z.array(sceneSchema).min(1).describe('Scenes in play order; one idea each'),
    })
    .superRefine((rawV, ctx) => {
      const v = rawV as {
        mode: '2d' | '3d';
        theme?: string;
        language: 'en' | 'ar';
        layout?: 'whiteboard' | 'slides';
        speakers?: Record<string, {name: string; role: string; voice: string}>;
        scenes: {id: string; speaker?: string; narration: string; continues?: true; chapter?: string; focus?: unknown; visual: ScriptVisual}[];
      };
      if (v.layout === 'whiteboard') for (const b of whiteboardBlockers(v)) ctx.addIssue({code: 'custom', path: b.path, message: b.message});
      const speakerIds = v.speakers ? Object.keys(v.speakers) : null;
      if (v.speakers && speakerIds) {
        if (speakerIds.length !== 2) ctx.addIssue({code: 'custom', path: ['speakers'], message: `speakers needs exactly 2 entries (it has ${speakerIds.length})`});
        // the per-speaker checks below run only for a pair: a script with thousands of keys is rejected by the count alone
        else {
          for (const id of speakerIds) if (!SPEAKER_ID.test(id)) ctx.addIssue({code: 'custom', path: ['speakers', id], message: `speaker id "${id}" must be lowercase letters and digits, start with a letter, and be at most 12 characters`});
          if (v.language !== 'en') ctx.addIssue({code: 'custom', path: ['speakers'], message: 'speakers (two-voice dialogue) is English only'});
          const [x, y] = speakerIds.map((id) => v.speakers![id].voice);
          if (x === y) ctx.addIssue({code: 'custom', path: ['speakers'], message: `the two speakers share the voice "${x}"; give each a different voice`});
          for (const id of speakerIds) {
            const sp = v.speakers[id];
            // name and role are one-line display text: no line breaks, tabs, control, zero-width, format or direction-changing characters
            // (a hidden character could make the pill read differently from the text, or reorder it)
            for (const field of ['name', 'role'] as const) for (const m of textCharIssues(`speakers.${id}.${field}`, sp[field])) ctx.addIssue({code: 'custom', path: ['speakers', id, field], message: m});
            // the name is drawn in the hand font (name pill and the initial on the avatar): a glyph it lacks would be a fallback or a missing-glyph box. The role is set in the theme's mono font, which has its own fallback
            const bad = unsupportedGlyph(sp.name);
            if (bad) ctx.addIssue({code: 'custom', path: ['speakers', id, 'name'], message: `the name "${sp.name}" has "${bad}" (U+${bad.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}), which the hand font cannot draw; use plain letters`});
          }
        }
        const used = new Set(v.scenes.map((s) => s.speaker));
        for (const id of speakerIds) if (!used.has(id)) ctx.addIssue({code: 'custom', path: ['speakers', id], message: `speaker "${id}" has no scene`});
      }
      for (const e of speakerRefIssues(speakerIds, v.scenes.map((s) => speakerRefsOf(s.visual)))) ctx.addIssue({code: 'custom', path: ['scenes', e.scene, 'visual'], message: e.message});
      if (!speakerIds) v.scenes.forEach((s, i) => {
        if (DIALOGUE_TYPES.includes(s.visual.type)) ctx.addIssue({code: 'custom', path: ['scenes', i, 'visual'], message: `"${s.visual.type}" shows the two speakers of a dialogue, but the script has no "speakers": declare the two speakers at the top of the script or use another visual`});
      });
      const seen = new Set<string>();
      v.scenes.forEach((s, i) => {
        if (seen.has(s.id)) ctx.addIssue({code: 'custom', path: ['scenes', i, 'id'], message: `duplicate scene id "${s.id}"`});
        seen.add(s.id);
        if (speakerIds && s.speaker === undefined) ctx.addIssue({code: 'custom', path: ['scenes', i, 'speaker'], message: `needs a "speaker" (${speakerIds.join(' or ')}): the script declares speakers`});
        else if (speakerIds && s.speaker !== undefined && !speakerIds.includes(s.speaker)) ctx.addIssue({code: 'custom', path: ['scenes', i, 'speaker'], message: `unknown speaker "${s.speaker}" (declared: ${speakerIds.join(', ')})`});
        else if (!speakerIds && s.speaker !== undefined) ctx.addIssue({code: 'custom', path: ['scenes', i, 'speaker'], message: 'speaker needs "speakers" at the top of the script'});
        if ((THREE_D_TYPES as readonly string[]).includes(s.visual.type) && v.mode !== '3d') ctx.addIssue({code: 'custom', path: ['scenes', i, 'visual', 'type'], message: `"${s.visual.type}" needs "mode": "3d" at the top of the script`});
        if (!(THREE_D_TYPES as readonly string[]).includes(s.visual.type) && !(CAPABILITIES[s.visual.type].modes as readonly string[]).includes(v.mode)) ctx.addIssue({code: 'custom', path: ['scenes', i, 'visual', 'type'], message: `"${s.visual.type}" cannot be drawn in "${v.mode}" mode (it supports: ${(CAPABILITIES[s.visual.type].modes as readonly string[]).join(', ')}); ${v.mode === '3d' ? 'remove "mode": "3d" from the top of the script or use another visual type' : 'use another visual type'}`});
        if (v.mode === '3d' && ((s.visual.type === 'mermaid' && (s.visual as {build?: boolean}).build) || (s.focus && CAPABILITIES[s.visual.type].focus === '2d'))) {
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
        const prev = (v.scenes[i - 1] as {visual: ScriptVisual} | undefined)?.visual;
        const where = {code: 'custom' as const, path: ['scenes', i, 'continues']};
        const onBoard = !isDiagram(s.visual) && BOARD_CONTINUES_TYPES.includes(s.visual.type);
        if (!isDiagram(s.visual) && !onBoard) ctx.addIssue({...where, message: `continues works on graph, class and sequence scenes, and on the whiteboard layout on ${BOARD_CONTINUES_TYPES.join(', ')}; not on "${s.visual.type}"`});
        else if (!prev) ctx.addIssue({...where, message: 'the first scene has nothing to continue'});
        else if (prev.type !== s.visual.type) ctx.addIssue({...where, message: `the previous scene is a "${prev.type}", this one a "${s.visual.type}"; continues needs the same type`});
        else if (onBoard) {
          // a board type is continued by the board drawing only: the slide view has no carried state for it
          if (resolveLayout(v, v.layout) !== 'whiteboard') ctx.addIssue({...where, message: `continues on "${s.visual.type}" needs the whiteboard layout, which this script cannot use (${v.layout === 'slides' ? 'layout is "slides"' : 'see the other whiteboard issues'}); remove continues or fix the script for the board`});
          else if (!describeVisual(s.visual as never, prev as never).carried.some(Boolean)) ctx.addIssue({...where, message: `shares no leading ${s.visual.type === 'flow' ? 'nodes' : 'items'} with the previous scene; keep the carried ones first, unchanged and in the same order`});
        } else if (!(focusTargetsOf(s.visual)?.ids ?? []).some((id) => (focusTargetsOf(prev)?.ids ?? []).includes(id))) ctx.addIssue({...where, message: 'shares no ids with the previous scene; reuse the ids of the parts that carry over'});
      });
    })
    .describe('One video: <workdir>/scripts/<id>.json');

export const BuiltinScriptSchema = buildScriptSchema(buildSceneSchema(BuiltinVisualSchema));
export const ScriptSchema = buildScriptSchema(SceneSchema);

export type Script = z.infer<typeof ScriptSchema>;
export type ScriptVisual = z.infer<typeof VisualSchema>;
