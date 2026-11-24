// Mermaid animation and focus-target validation (pure: no React, Remotion, Three, or fs).
import {normName} from '../../words';
import type {MermaidLayoutT} from './schema';

export type MermaidCheckScene = {
  id: string;
  focus?: {at: string; on: string[]}[];
  visual: {type: string; build?: boolean};
};

export type MermaidCheckResult = {
  layout?: MermaidLayoutT;
  error?: string;
};

/** build/focus need the diagram's part layers, and focus may only name its parts (by id or label) and lines. */
export const checkMermaidAnimation = (
  scripts: Record<string, {scenes: MermaidCheckScene[]}>,
  results: Record<string, MermaidCheckResult>,
): string[] => {
  const errs: string[] = [];
  for (const [vid, s] of Object.entries(scripts)) {
    for (const sc of s.scenes) {
      const v = sc.visual;
      const key = `${vid}/${sc.id}`;
      const res = results[key];
      if (v.type !== 'mermaid' || !(v.build || sc.focus) || !res || res.error) continue;
      const lay = res.layout;
      if (!lay) {
        errs.push(
          `${key}: this diagram cannot be animated (a construct the animation does not know, or over ` +
            `80 parts); remove build/focus or simplify the diagram`,
        );
        continue;
      }
      const parts = lay.parts;
      const names = new Map<string, Set<string>>(
        parts.map((p) => [p.name, new Set([normName(p.name), ...(p.label ? [normName(p.label)] : [])])]),
      );
      const answers = (n: string, k: string) => (names.get(n) ?? new Set([normName(n)])).has(k);
      const nodes = parts.filter((p) => p.from === undefined);
      const lines = parts.filter((p) => p.from !== undefined);
      const shown = [...new Set(nodes.filter((p) => p.slot || p.label).map((p) => p.label || p.name))].sort();
      (sc.focus ?? []).forEach((f, i) => {
        for (const t of f.on) {
          const k = normName(t);
          if ((k.match(/->/g) ?? []).length > 1) {
            errs.push(`${key}: focus[${i}]: "${t}" names more than one line; use one "a->b" per entry`);
          } else if (k.includes('->')) {
            const [a, b] = k.split('->');
            if (!lines.some((p) => answers(p.from!, a) && answers(p.to!, b))) {
              const have = [
                ...new Set(
                  lines
                    .filter((p) => names.has(p.from!) && names.has(p.to!))
                    .map((p) => {
                      const fromBest = [...names.get(p.from!)!].sort((x, y) => x.length - y.length)[0];
                      const toBest = [...names.get(p.to!)!].sort((x, y) => x.length - y.length)[0];
                      return `${fromBest}->${toBest}`;
                    }),
                ),
              ].sort();
              errs.push(`${key}: focus[${i}]: no line "${t}" (have: ${have.join(', ') || 'none'})`);
            }
          } else if (!nodes.some((p) => answers(p.name, k))) {
            errs.push(`${key}: focus[${i}]: nothing called "${t}" (have: ${shown.join(', ')})`);
          }
        }
      });
    }
  }
  return errs;
};
