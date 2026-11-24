import type {MermaidLayoutT} from './schema';
import {fresh, none, type Semantics} from '../../semantics/types';

/** The parts the narration reveals, in order. */
export const revealOrder = (l: MermaidLayoutT) => l.parts.filter((p) => p.slot);

// Only an animated diagram (`build`, with the layout explainer.py adds) reveals in steps.
export const describe: Semantics<'mermaid'> = (v, _prev, rendered) => {
  const layout = (rendered?.layout ?? (v as {layout?: MermaidLayoutT}).layout) as MermaidLayoutT | undefined;
  if (!v.build || !layout || !Array.isArray(layout.parts)) return none();
  return fresh(revealOrder(layout).map((p) => p.label));
};
