// Pure placement of a stance map, shared by the slides view and the whiteboard drawing: which column and which row each entry sits in.
// A column is a speaker, a row is the entry's rank within that speaker's entries, so an entry's place never depends on the entries
// after it (a continued scene adds rows below, nothing moves).
import type {Visual} from '../../types';

export type Stance = Extract<Visual, {type: 'stance'}>;
export type Placed = {col: 0 | 1; row: number};

/** Left to right: the video's speakers in script order, else the ids the visual names, first seen first. */
export const columnIds = (list: readonly {id: string}[] | undefined, named: readonly string[]): string[] =>
  list && list.length > 0 ? list.map((s) => s.id) : [...new Set(named)];

export const placeEntries = (entries: Stance['entries'], columns: readonly string[]): Placed[] => {
  const rows = [0, 0];
  return entries.map((e) => {
    const col = Math.min(1, Math.max(0, columns.indexOf(e.by))) as 0 | 1;
    return {col, row: rows[col]++};
  });
};

export const KIND_LABEL: Record<Stance['entries'][number]['kind'], string> = {claim: 'CLAIM', agree: 'AGREES', disagree: 'DISAGREES', resolve: 'RESOLVES'};
