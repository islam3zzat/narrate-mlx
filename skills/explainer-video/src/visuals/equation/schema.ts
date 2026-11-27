import {z} from 'zod';
import {ID, text} from '../common';
import {displayCells, textCharIssues} from '../chars';
import {EQUATION_LIMITS, parseEquationTerms, validateLatex} from './parse';

export const EquationTermTone = z.enum(['primary', 'accent', 'secondary', 'danger']);

export const EquationEntry = z.strictObject({
  label: text('Optional short equation title/tag').optional(),
  latex: z.string().trim().min(1).max(EQUATION_LIMITS.latex)
    .describe('Sanitized LaTeX expression containing \\term{id}{...} sub-expressions'),
});

export const EquationTerm = z.strictObject({
  id: ID.describe('Term id matching a \\term{id}{...} span in the equation'),
  label: text('Narration-matched slot label (36 display cells max)').describe('Spotlight timing slot matched against narration'),
  gloss: text('Plain-English explanation displayed below while this term is spotlighted').max(EQUATION_LIMITS.gloss),
  tone: EquationTermTone.optional().describe('Spotlight highlight colour token from theme'),
});

export const EquationVisual = z.strictObject({
  type: z.literal('equation'),
  heading: text('Scene heading').max(EQUATION_LIMITS.heading),
  equations: z.array(EquationEntry).min(1).max(EQUATION_LIMITS.maxEquations)
    .describe('1 or 2 load-bearing LaTeX equations with \\term{id}{...} spans'),
  terms: z.array(EquationTerm).min(1).max(EQUATION_LIMITS.maxTerms)
    .describe('Ordered term spotlights and plain-English glosses (1..8)'),
  caption: text('Optional bottom takeaway note').max(EQUATION_LIMITS.caption).optional(),
}).superRefine((v, ctx) => {
  const addErr = (path: (string | number)[], message: string) =>
    ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

  const checkTxt = (path: (string | number)[], name: string, s: string | undefined, max: number) => {
    if (s === undefined) return;
    if (displayCells(s) > max) addErr(path, `${name} must be <= ${max} display cells`);
    for (const msg of textCharIssues(name, s)) addErr(path, msg);
  };

  checkTxt(['heading'], 'heading', v.heading, EQUATION_LIMITS.heading);
  checkTxt(['caption'], 'caption', v.caption, EQUATION_LIMITS.caption);

  const definedIds = new Set<string>();
  v.terms.forEach((t, i) => {
    if (definedIds.has(t.id)) addErr(['terms', i, 'id'], `duplicate term id "${t.id}"`);
    definedIds.add(t.id);
    checkTxt(['terms', i, 'label'], `terms[${i}].label`, t.label, EQUATION_LIMITS.termLabel);
    checkTxt(['terms', i, 'gloss'], `terms[${i}].gloss`, t.gloss, EQUATION_LIMITS.gloss);
  });

  const usedIds = new Set<string>();
  v.equations.forEach((eq, i) => {
    checkTxt(['equations', i, 'label'], `equations[${i}].label`, eq.label, EQUATION_LIMITS.eqLabel);
    for (const msg of validateLatex(eq.latex)) {
      addErr(['equations', i, 'latex'], msg);
    }
    const parsed = parseEquationTerms(eq.latex);
    for (const msg of parsed.errors) {
      addErr(['equations', i, 'latex'], msg);
    }
    for (const id of parsed.termIds) {
      usedIds.add(id);
      if (!definedIds.has(id)) {
        addErr(['equations', i, 'latex'], `\\term{${id}} is not listed in terms[]`);
      }
    }
  });

  v.terms.forEach((t, i) => {
    if (!usedIds.has(t.id)) {
      addErr(['terms', i, 'id'], `term "${t.id}" does not appear as \\term{${t.id}}{...} in any equation`);
    }
  });
});

export type EquationVisualT = z.infer<typeof EquationVisual>;

export {EquationVisual as schema};
