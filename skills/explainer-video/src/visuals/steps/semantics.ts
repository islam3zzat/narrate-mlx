import {carriedLeading, sameType} from '../../semantics/carry';
import type {Semantics} from '../../semantics/types';
// Only the whiteboard layout continues a list (capabilities.boardContinues): the leading steps shared with the previous scene stay drawn.
export const describe: Semantics<'steps'> = (v, prev) => ({slots: [...v.items], carried: carriedLeading(sameType(v, prev)?.items, v.items)});
