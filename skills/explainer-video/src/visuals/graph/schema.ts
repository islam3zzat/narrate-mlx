import {z} from 'zod';
import {text, GRAPH_TONES} from '../common';

export const GraphNode = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'node id must match [A-Za-z0-9_-]+').describe('Unique id used by edges'),
  label: text('Node title, three words or fewer'),
  sub: z.string().trim().min(1).optional().describe('Small text under the title'),
  tone: z.enum(GRAPH_TONES).optional().describe('Colour: neutral (default), primary (yellow), secondary (pink), accent (green), danger (red)'),
});

export const GraphEdge = z.strictObject({
  from: z.string().describe('Id of the source node'),
  to: z.string().describe('Id of the target node'),
  label: z.string().trim().min(1).optional().describe('Short text on the edge'),
  dashed: z.boolean().optional().describe('Dashed line, for optional or indirect links'),
  tone: z.enum(GRAPH_TONES).optional().describe('Colours the edge label and its travelling dots, e.g. accent for the valid path and danger for the failure path; defaults to the source node colour'),
});

export const GraphVisual = z.strictObject({
  type: z.literal('graph'),
  heading: text('Scene heading'),
  direction: z.enum(['LR', 'TB']).default('LR').describe('Layout direction: LR left to right (default), TB top to bottom'),
  nodes: z.array(GraphNode).min(2).max(12).describe('Revealed in this order, spread over the narration; list them in the order you speak them'),
  edges: z.array(GraphEdge).min(1).describe('Directed edges; the graph must be acyclic (no loops back). An edge appears once both of its nodes are visible'),
  animate: z.boolean().default(true).describe('Dots travel along the edges once they appear (default true); false for static lines'),
  caption: z.string().optional().describe('Line under the graph'),
}).describe('A node-and-edge diagram drawn with React Flow and laid out automatically').superRefine((v, ctx) => {
  const ids = new Set<string>();
  v.nodes.forEach((n, i) => {
    if (ids.has(n.id)) ctx.addIssue({code: 'custom', path: ['nodes', i, 'id'], message: `duplicate node id "${n.id}"`});
    ids.add(n.id);
  });
  v.edges.forEach((e, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!ids.has(e[end])) ctx.addIssue({code: 'custom', path: ['edges', i, end], message: `unknown node id "${e[end]}"`});
    }
  });
  // Cycles cannot be laid out cleanly (the return edge cuts through the boxes). Back-and-forth belongs in a mermaid sequenceDiagram.
  const out = new Map<string, string[]>();
  v.edges.forEach((e) => out.set(e.from, [...(out.get(e.from) ?? []), e.to]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    const cyc = (out.get(id) ?? []).some(visit);
    state.set(id, 2);
    return cyc;
  };
  if (ids.size && [...ids].some(visit)) {
    ctx.addIssue({code: 'custom', path: ['edges'], message: 'edges form a cycle; a graph must be acyclic. Remove the return edge, or use a "sequence" scene for back-and-forth messages'});
  }
});

export type GraphVisualInput = z.infer<typeof GraphVisual>;
