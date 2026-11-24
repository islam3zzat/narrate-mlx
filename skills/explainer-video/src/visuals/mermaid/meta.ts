import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'mermaid'> = {
  type: 'mermaid',
  capabilities,
  docs: {
    fields: "`heading`, `code`, `caption?`",
    use: "what the native visuals don't cover: state, ER, gantt, mindmap, pie, or anything that loops back (max ~10-12 nodes; use `timeline` for dated event rails)",
    rules: [
      "At most 10 to 12 nodes and labels of three words or fewer. Split a big diagram across scenes.",
      "The narration walks the diagram in reading order.",
      "Use valid mermaid syntax from the supported list: flowchart, graph, sequenceDiagram, stateDiagram(-v2), erDiagram, classDiagram, journey, timeline, mindmap, gantt, pie.",
      "No `%%{init}`, styling or `click` lines: the theme is fixed. Newlines in `code` are `\\n` in JSON.",
      "Always run `check`: it renders every diagram and reports parse errors with the scene id. Look at one mermaid scene with `still`.",
      "**Any mermaid diagram can move** (2D only). `\"build\": true` in the visual builds it up as the narration names its parts: nodes, states, entities and classes pop in, lines draw themselves in once both ends are there (arrowheads and crow's feet included), gantt bars grow, timeline periods and events, journey tasks, mindmap branches, pie slices and sequence messages appear in turn. Parts are matched by their label as drawn (`cues` pin the ones the narration misses). `focus` works as under \"Pointing and building up\" below: `on` takes a part's id or its label as drawn (`\"Cached?\"`, `\"CUSTOMER\"`, `\"Web\"`), or `\"a->b\"` for the line between two parts (a token then travels along it); a group or subgraph brings its members. Focus may name a part before `build` shows it: it then appears for the focus. Without either field the diagram appears whole, as a static picture. `check` lists the valid names when one is wrong. Still prefer `graph`, `sequence` and `class` when they fit: they also support `continues` and camera zoom.",
      "**Keep the whole diagram visible unless `build` is clearly timed.** Only set `\"build\": true` when the narration walks through every part in order (with `cues` if needed) and leaves time at the end to read the full graph; if you are unsure the viewer will get enough time to see each part, omit `build` (use `focus` alone or keep the full diagram visible from frame 0). Prefer `graph`, `sequence`, `class`, and `timeline` when they fit.",
    ],
  },
  lint: (_v, ctx) => ({
    errors: [],
    warnings: ctx.lang === 'ar' ? ['mermaid scenes are not mirrored and their font is fixed (labels fall back to a system ' +
      'font); write the diagram right to left yourself (flowchart RL) and check it with `still`. Prefer graph, ' +
      'sequence, class or timeline scenes in Arabic videos'] : [],
  }),
  focusTargets: () => null,
};
