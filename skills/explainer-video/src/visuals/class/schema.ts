import {z} from 'zod';
import {text, GRAPH_TONES, ID} from '../common';

export const CLASS_RELATIONS = ['inherits', 'implements', 'composes', 'aggregates', 'associates', 'depends'] as const;

export const ClassVisual = z.strictObject({
  type: z.literal('class'),
  heading: text('Scene heading'),
  direction: z.enum(['LR', 'TB']).default('TB').describe('Layout direction; TB (default) puts parents on top'),
  classes: z.array(z.strictObject({
    id: ID.describe('Unique id used by relations'),
    name: text('Class name'),
    stereotype: z.string().trim().min(1).optional().describe('Shown above the name, e.g. interface or record'),
    attributes: z.array(z.string().max(34)).max(8).default([]).describe('Attribute lines, 34 characters or fewer each, e.g. "code_challenge: string"'),
    methods: z.array(z.string().max(34)).max(8).default([]).describe('Method lines, 34 characters or fewer each, e.g. "verify(verifier)"'),
    tone: z.enum(GRAPH_TONES).optional().describe('Header colour'),
  })).min(2).max(6).describe('Classes, revealed in this order over the narration'),
  relations: z.array(z.strictObject({
    from: z.string().describe('Id of the source class. For inherits/implements this is the child; for composes/aggregates the whole'),
    to: z.string().describe('Id of the target class. For inherits/implements this is the parent; for composes/aggregates the part'),
    type: z.enum(CLASS_RELATIONS).describe('inherits (solid, hollow triangle), implements (dashed, hollow triangle), composes (filled diamond), aggregates (hollow diamond), associates (arrow), depends (dashed arrow)'),
    label: z.string().trim().min(1).optional().describe('Short text on the line, e.g. "creates"'),
  })).min(1).describe('UML relations between the classes'),
  caption: z.string().optional().describe('Line under the diagram'),
}).describe('A UML class diagram drawn with React Flow: classes with attributes and methods, and relations').superRefine((v, ctx) => {
  const ids = new Set<string>();
  v.classes.forEach((c, i) => {
    if (ids.has(c.id)) ctx.addIssue({code: 'custom', path: ['classes', i, 'id'], message: `duplicate class id "${c.id}"`});
    ids.add(c.id);
  });
  v.relations.forEach((r, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!ids.has(r[end])) ctx.addIssue({code: 'custom', path: ['relations', i, end], message: `unknown class id "${r[end]}"`});
    }
    if (r.from === r.to) ctx.addIssue({code: 'custom', path: ['relations', i], message: 'a class cannot relate to itself here'});
  });
});

export type ClassVisualInput = z.infer<typeof ClassVisual>;
