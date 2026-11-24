import {fresh, type Semantics} from '../../semantics/types';

// Multi-series bar & line charts reveal series-by-series; single-series bar charts reveal category-by-category; scatter reveals point-by-point.
export const describe: Semantics<'chart'> = (v) => {
  if (v.kind === 'scatter') return fresh((v.points ?? []).map((p) => p.label));
  if (v.kind === 'bar' && (v.series?.length ?? 0) <= 1) return fresh(v.categories ?? []);
  return fresh((v.series ?? []).map((s) => s.label));
};
