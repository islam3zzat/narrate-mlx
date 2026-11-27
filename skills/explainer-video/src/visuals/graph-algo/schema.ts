import {ID, displayCells, text, textCharIssues, z} from '../../sdk/pure';
import {ALGO_STATE_TONES} from '../../sdk/algo-math';

export const GRAPH_ALGO_LIMITS = {
  heading: 60,
  caption: 160,
  label: 48,
  note: 48,
  nodeLabel: 12,
  badge: 12,
  weight: 8,
  auxLabel: 24,
  auxItem: 24,
  minNodes: 2,
  maxNodes: 10,
  minEdges: 1,
  maxEdges: 18,
  maxSteps: 12,
  maxAuxItems: 8,
  maxAbs: 1e9,
} as const;

export const GraphAlgoNode = z.strictObject({
  id: ID.describe('Unique node ID referenced by edges and step state maps'),
  label: text('Short node label (e.g. A, S, v0, 42)'),
  x: z.number().min(0).max(1).optional().describe('Optional normalized horizontal position [0..1]'),
  y: z.number().min(0).max(1).optional().describe('Optional normalized vertical position [0..1]'),
});

export const GraphAlgoEdge = z.strictObject({
  id: ID.optional().describe('Optional explicit edge ID for edgeStates and focus'),
  from: ID.describe('Source node ID'),
  to: ID.describe('Target node ID'),
  weight: z.union([z.number(), text('Short edge weight or capacity label')]).optional(),
  directed: z.boolean().optional().describe('Per-edge directedness override (defaults to visual.directed)'),
});

export const GraphAlgoAux = z.strictObject({
  label: text('Auxiliary strip title (e.g. Queue, Priority Q, Stack)'),
  items: z
    .array(
      z.strictObject({
        text: text('Auxiliary state chip'),
        tone: z.enum(ALGO_STATE_TONES).optional(),
      }),
    )
    .min(1)
    .max(GRAPH_ALGO_LIMITS.maxAuxItems),
  note: text('Optional short invariant or complexity note').optional(),
});

export const GraphAlgoStep = z.strictObject({
  id: ID.optional().describe('Optional step ID for `focus`'),
  label: text('Step label spoken in narration (aligns reveal timing)'),
  nodeStates: z.record(z.string(), z.enum(ALGO_STATE_TONES)).optional().describe('Map of node ID -> semantic state tone'),
  nodeBadges: z.record(z.string(), text('Short badge pill above node (e.g. d=4, L1)')).optional(),
  edgeStates: z.record(z.string(), z.enum(ALGO_STATE_TONES)).optional().describe('Map of edge key (`edge.id` or `"from->to"`) -> semantic tone'),
  aux: GraphAlgoAux.optional(),
  note: text('Optional short step annotation').optional(),
});

export const GraphAlgoVisual = z
  .strictObject({
    type: z.literal('graph-algo'),
    heading: text('Scene heading').max(GRAPH_ALGO_LIMITS.heading),
    directed: z.boolean().optional().describe('Whether edges draw arrowheads by default (default false)'),
    nodes: z.array(GraphAlgoNode).min(GRAPH_ALGO_LIMITS.minNodes).max(GRAPH_ALGO_LIMITS.maxNodes),
    edges: z.array(GraphAlgoEdge).min(GRAPH_ALGO_LIMITS.minEdges).max(GRAPH_ALGO_LIMITS.maxEdges),
    steps: z.array(GraphAlgoStep).min(1).max(GRAPH_ALGO_LIMITS.maxSteps),
    caption: text('Optional bottom takeaway caption').max(GRAPH_ALGO_LIMITS.caption).optional(),
  })
  .superRefine((v, ctx) => {
    const addErr = (path: (string | number)[], message: string) =>
      ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

    const checkTxt = (path: (string | number)[], name: string, s: string | undefined, max: number) => {
      if (s === undefined) return;
      if (displayCells(s) > max) addErr(path, `${name} must be <= ${max} display cells`);
      for (const msg of textCharIssues(name, s)) addErr(path, msg);
    };

    checkTxt(['heading'], 'heading', v.heading, GRAPH_ALGO_LIMITS.heading);
    checkTxt(['caption'], 'caption', v.caption, GRAPH_ALGO_LIMITS.caption);

    const nodeIds = new Set<string>();
    v.nodes.forEach((n, ni) => {
      if (nodeIds.has(n.id)) addErr(['nodes', ni, 'id'], `duplicate node id "${n.id}"`);
      nodeIds.add(n.id);
      checkTxt(['nodes', ni, 'label'], `nodes[${ni}].label`, n.label, GRAPH_ALGO_LIMITS.nodeLabel);
      if ((n.x === undefined) !== (n.y === undefined)) {
        addErr(['nodes', ni], `node "${n.id}" must specify both x and y or omit both for auto-layout`);
      }
    });

    const edgeKeys = new Set<string>();
    v.edges.forEach((e, ei) => {
      if (!nodeIds.has(e.from)) addErr(['edges', ei, 'from'], `unknown source node "${e.from}"`);
      if (!nodeIds.has(e.to)) addErr(['edges', ei, 'to'], `unknown target node "${e.to}"`);
      if (e.from === e.to) addErr(['edges', ei], `self-loop edge "${e.from}" -> "${e.to}" is not allowed`);
      const key = e.id ?? `${e.from}->${e.to}`;
      if (edgeKeys.has(key)) addErr(['edges', ei], `duplicate edge key "${key}"`);
      edgeKeys.add(key);

      if (e.weight !== undefined) {
        if (typeof e.weight === 'number') {
          if (!Number.isFinite(e.weight) || Math.abs(e.weight) > GRAPH_ALGO_LIMITS.maxAbs) {
            addErr(['edges', ei, 'weight'], 'edge weight must be finite and within bounds');
          }
        } else {
          checkTxt(['edges', ei, 'weight'], `edges[${ei}].weight`, e.weight, GRAPH_ALGO_LIMITS.weight);
        }
      }
    });

    const stepIds = new Set<string>();
    v.steps.forEach((st, si) => {
      if (st.id) {
        if (stepIds.has(st.id)) addErr(['steps', si, 'id'], `duplicate step id "${st.id}"`);
        stepIds.add(st.id);
      }
      checkTxt(['steps', si, 'label'], `steps[${si}].label`, st.label, GRAPH_ALGO_LIMITS.label);
      checkTxt(['steps', si, 'note'], `steps[${si}].note`, st.note, GRAPH_ALGO_LIMITS.note);

      for (const nid of Object.keys(st.nodeStates ?? {})) {
        if (!nodeIds.has(nid)) {
          addErr(['steps', si, 'nodeStates', nid], `unknown node id "${nid}" in nodeStates`);
        }
      }
      for (const [nid, badge] of Object.entries(st.nodeBadges ?? {})) {
        if (!nodeIds.has(nid)) {
          addErr(['steps', si, 'nodeBadges', nid], `unknown node id "${nid}" in nodeBadges`);
        }
        checkTxt(['steps', si, 'nodeBadges', nid], `steps[${si}].nodeBadges.${nid}`, badge, GRAPH_ALGO_LIMITS.badge);
      }
      for (const ek of Object.keys(st.edgeStates ?? {})) {
        if (!edgeKeys.has(ek)) {
          addErr(['steps', si, 'edgeStates', ek], `unknown edge key "${ek}" in edgeStates`);
        }
      }
      if (st.aux) {
        checkTxt(['steps', si, 'aux', 'label'], `steps[${si}].aux.label`, st.aux.label, GRAPH_ALGO_LIMITS.auxLabel);
        checkTxt(['steps', si, 'aux', 'note'], `steps[${si}].aux.note`, st.aux.note, GRAPH_ALGO_LIMITS.note);
        st.aux.items.forEach((ax, ai) => {
          checkTxt(['steps', si, 'aux', 'items', ai, 'text'], `steps[${si}].aux.items[${ai}].text`, ax.text, GRAPH_ALGO_LIMITS.auxItem);
        });
      }
    });
  });

export {GraphAlgoVisual as schema};
export type GraphAlgoVisualT = z.infer<typeof GraphAlgoVisual>;
export type GraphAlgoNodeT = z.infer<typeof GraphAlgoNode>;
export type GraphAlgoEdgeT = z.infer<typeof GraphAlgoEdge>;
export type GraphAlgoStepT = z.infer<typeof GraphAlgoStep>;
