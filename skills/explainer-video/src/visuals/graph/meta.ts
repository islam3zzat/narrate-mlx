import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'graph'> = {
  type: 'graph',
  capabilities,
  docs: {
    fields: "`heading`, `nodes[{id, label, sub?, tone?}]`, `edges[{from, to, label?, dashed?, tone?}]`, `direction?: \"LR\"\\|\"TB\"`, `animate?`, `caption?`",
    use: "branching or multi-path structure, drawn with React Flow and laid out automatically (2 to 12 nodes, no cycles)",
    rules: [
      "2 to 12 nodes, labels of three words or fewer, node `id` matches `[A-Za-z0-9_-]+`, every edge `from`/`to` names an existing node.",
      "No cycles: the check rejects them. Request/response and back-and-forth belong in a `sequence` scene.",
      "`tone` picks the colour: `neutral` (default), `primary` (yellow), `secondary` (pink), `accent` (green), `danger` (red). Use it to mark the happy path or a failure, not for decoration. An edge's `tone` colours its label and travelling dots: use `accent` for the valid branch and `danger` for the failure branch.",
      "Dots travel along the edges once they appear (`\"animate\": false` turns that off). Labels sit next to the target end of an edge.",
      "`direction` is `LR` (default) or `TB`; prefer `TB` for decisions with a yes/no branch.",
    ],
  },
  lint: (v) => ({
    errors: [],
    warnings: v.nodes.some((n) => n.label.split(/\s+/).filter(Boolean).length > 3) ? ['graph labels longer than three words wrap and crowd the layout'] : [],
  }),
  focusTargets: (v) => ({ids: v.nodes.map((n) => n.id), links: v.edges.map((e) => [e.from, e.to])}),
};
