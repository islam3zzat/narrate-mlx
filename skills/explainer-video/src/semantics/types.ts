import type {Visual} from '../types';

/** What explainer.py needs to know about a scene's visual: the text of each reveal slot (in reveal order) and, per slot, whether it carries over from the previous scene. */
export type Described = {slots: string[]; carried: boolean[]};
export type Semantics<T extends Visual['type']> = (visual: Extract<Visual, {type: T}>, prev?: Visual, rendered?: {layout?: unknown}) => Described;

/** A visual with no reveal slots. */
export const none = (): Described => ({slots: [], carried: []});
/** Slots that never carry over. */
export const fresh = (slots: string[]): Described => ({slots, carried: slots.map(() => false)});
