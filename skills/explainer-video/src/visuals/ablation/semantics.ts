import {fresh, type Semantics} from '../../semantics/types';

// Baseline bar reveals first, then each component delta in order, then optional final total bar.
export const describe: Semantics<'ablation'> = (v) => {
  const slots = [v.baseline.label, ...v.steps.map((s) => s.label)];
  if (v.showTotal !== false) slots.push(v.totalLabel ?? 'Full System');
  return fresh(slots);
};
