import {z} from 'zod';
import {text} from '../common';

export const MermaidVisual = z.strictObject({
  type: z.literal('mermaid'),
  heading: text('Scene heading'),
  code: text('Mermaid source (newlines as \\n). Use for sequence, state, ER, class and similar diagrams; use "graph" for plain node-and-edge diagrams'),
  caption: z.string().optional().describe('Line under the diagram'),
  build: z.literal(true).optional().describe('Draw the diagram up as the narration names its parts (nodes, states, entities, tasks, events, slices, messages); lines follow once both ends are there. Without it the whole diagram appears at once'),
}).describe('A mermaid diagram, pre-rendered to SVG');

/**
 * Layered layout of a rendered mermaid diagram (mermaid-layout.mjs; explainer.py puts it into the data file). Each part
 * is its own SVG file in `dir` (base.svg holds what belongs to no part). It comes from untrusted input, so the renderer
 * parses it with this schema and shows the static SVG when it does not fit. Units are the SVG's own (`vb` = viewBox).
 * Keep in step with sanitizeLayout in mermaid-layout.mjs.
 */
const Num = z.number().finite();
const Name = z.string().max(160);
export const MermaidLayout = z.strictObject({
  vb: z.tuple([Num, Num, Num.positive(), Num.positive()]),
  dir: z.string().regex(/^mermaid\/[0-9a-f]{8,64}$/),
  parts: z.array(z.strictObject({
    name: Name, label: z.string().max(200), anim: z.enum(['pop', 'draw', 'wipe', 'fade']), slot: z.boolean(),
    file: z.string().regex(/^p\d{1,3}\.svg$/),
    x: Num, y: Num, w: Num.nonnegative(), h: Num.nonnegative(),
    from: Name.optional(), to: Name.optional(), parent: Name.optional(),
    with: z.array(Name).optional(), after: z.array(Name).optional(),
    ox: Num.optional(), oy: Num.optional(),
    d: z.string().max(20000).regex(/^[MLCQSTHVAZmlcqsthvaz0-9.,\s+\-eE]+$/).optional(), dx: Num.optional(), dy: Num.optional(),
  })).min(1).max(80),
});
export type MermaidLayoutT = z.infer<typeof MermaidLayout>;

export {MermaidVisual as schema};
