import {z} from 'zod';
import {text, ID} from '../common';
import {parseSvg, checkTree, LIMITS, TAGS, type SvgNode, type SvgDoc} from './parse';

export const SvgPart = z.strictObject({
  id: ID.describe('Id of one top-level <g id="..."> in the markup; the group is that part'),
  label: text('What the part shows, in words the narration says: the part appears when they are spoken'),
});

export const SvgVisual = z.strictObject({
  type: z.literal('svg'),
  heading: text('Scene heading'),
  parts: z.array(SvgPart).min(1).max(LIMITS.parts).describe('The parts, in the order the narration reaches them; each is a top-level <g id> of the svg and appears when its label is spoken. Everything outside these groups is drawn from the first frame'),
  svg: z.string().describe(`Markup of one <svg viewBox="0 0 1700 560"> in a strict subset: ${TAGS.join(' ')}; colours, fonts and sizes are names (see SKILL.md); anything else is rejected, not stripped. At most ${LIMITS.bytes / 1024} KB`),
  caption: z.string().optional().describe('Line under the drawing'),
}).describe('A drawing the model writes as SVG (strict subset), revealed part by part as the narration names them; 2D only').superRefine((v, ctx) => {
  const r = parseSvg(v.svg);
  if (!r.ok) {
    r.errors.forEach((message) => ctx.addIssue({code: 'custom', path: ['svg'], message}));
    return;
  }
  const listed = new Set<string>();
  v.parts.forEach((p, i) => {
    if (listed.has(p.id)) ctx.addIssue({code: 'custom', path: ['parts', i, 'id'], message: `duplicate part id "${p.id}"`});
    listed.add(p.id);
    if (!r.doc.parts.includes(p.id)) ctx.addIssue({code: 'custom', path: ['parts', i, 'id'], message: `no top-level <g id="${p.id}"> in the svg (top-level groups with an id: ${r.doc.parts.join(', ') || 'none'})`});
  });
  for (const id of r.doc.parts) if (!listed.has(id)) ctx.addIssue({code: 'custom', path: ['svg'], message: `<g id="${id}"> is not listed in parts; list it, or remove its id to draw it from the first frame`});
});

export type SvgVisualInput = z.infer<typeof SvgVisual>;

// ---- the parsed tree, as a zod schema: the view re-parses what the parser returned before drawing it ----
export const SvgNodeSchema: z.ZodType<SvgNode> = z.lazy(() => z.strictObject({
  tag: z.enum([...TAGS, '#text'] as [string, ...string[]]) as z.ZodType<SvgNode['tag']>,
  attrs: z.record(z.string(), z.union([z.string().max(LIMITS.pathChars), z.number().finite()])),
  tf: z.array(z.strictObject({fn: z.enum(['translate', 'scale', 'rotate']), args: z.array(z.number().finite()).min(1).max(3)})).max(4).optional(),
  text: z.string().max(LIMITS.textChars).optional(),
  children: z.array(SvgNodeSchema),
}));
export const SvgDocSchema: z.ZodType<SvgDoc> = z.strictObject({
  viewBox: z.strictObject({x: z.number().finite(), y: z.number().finite(), w: z.number().min(LIMITS.viewBoxMin).max(LIMITS.viewBoxMax), h: z.number().min(LIMITS.viewBoxMin).max(LIMITS.viewBoxMax)}),
  children: z.array(SvgNodeSchema).max(LIMITS.elements),
  parts: z.array(ID).max(LIMITS.parts),
}).superRefine((d, ctx) => checkTree(d.children).forEach((message) => ctx.addIssue({code: 'custom', path: ['children'], message})));

/** Markup to a drawable tree: the parser, then the zod re-check. Never throws. */
export const readDrawing = (markup: string): {ok: true; doc: SvgDoc} | {ok: false; errors: string[]} => {
  try {
    const r = parseSvg(markup);
    if (!r.ok) return r;
    const z2 = SvgDocSchema.safeParse(r.doc);
    return z2.success ? {ok: true, doc: z2.data} : {ok: false, errors: z2.error.issues.map((i) => i.message)};
  } catch (e) {
    return {ok: false, errors: [(e as Error).message]};
  }
};

export {SvgVisual as schema};
