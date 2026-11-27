import {lintOrderedSlots, lintRtlAndBidi, type Meta} from '../../sdk/pure';
import {capabilities} from './capabilities';
import {collectFocusIds} from './compute';

export const meta: Meta<'graph-algo'> = {
  type: 'graph-algo',
  capabilities,
  docs: {
    fields:
      '`heading`, `directed?`, `nodes[{id, label, x?, y?}]` (2 to 10), `edges[{id?, from, to, weight?, directed?}]` (1 to 18), `steps[{id?, label, nodeStates?, nodeBadges?, edgeStates?, aux?, note?}]` (1 to 12), `caption?`',
    use: 'animated step-by-step graph traversal and shortest-path algorithms (BFS, DFS, Dijkstra, topological sort, MST) synced to narration',
    rules: [
      'Provide normalized `[0..1]` `nodes[].x` and `nodes[].y`, or omit both on every node for deterministic BFS/ellipse auto-layout.',
      '`steps[].nodeStates` and `nodeBadges` map node IDs to semantic tones or distance/depth pills (`d=4`, `L1`); `edgeStates` maps edge keys (`edge.id` or `"from->to"`).',
      'Optional `aux` renders a bottom Queue / Priority Queue / Stack tray via `AuxStrip`. Steps advance in listed narration order (or via `cues`). `focus` targets node IDs, explicit edge IDs, or step IDs (2D only).',
    ],
  },
  lint: (v, ctx) => ({
    errors: [],
    warnings: [
      ...lintOrderedSlots(
        ctx.narration,
        v.steps.map((s, i) => ({what: `step ${i + 1}`, label: s.label})),
        {
          missed: (w, l) => `${w} "${l}" shares no word with the narration; say a word from it or add cues`,
          late: (w, l, p) => `${w} "${l}" is spoken before "${p}"; list steps in narration order`,
        },
      ),
      ...lintRtlAndBidi(ctx.lang, {
        prefix: 'graph-algo',
        arWarning: 'graph-algo draws graph coordinates left to right and is not mirrored',
        texts: [
          ['heading', v.heading],
          ...(v.caption ? [['caption', v.caption] as [string, string]] : []),
        ],
      }),
    ],
  }),
  focusTargets: (v) => ({ids: collectFocusIds(v)}),
};
