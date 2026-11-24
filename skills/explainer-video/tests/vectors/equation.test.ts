import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import katex from 'katex';
import {buildStyledLatex, parseEquationTerms, validateLatex} from '../../src/visuals/equation/parse';
import {EquationVisual} from '../../src/visuals/equation/schema';
import {describe} from '../../src/visuals/equation/semantics';

// 1. Valid math including inequalities and balanced \term{id}{...}
{
  const tex = String.raw`\term{lhs}{f(x)} = \sum_{i < N} \term{frac}{\frac{w_i}{\sqrt{d_k}}}`;
  assert.deepEqual(validateLatex(tex), []);
  const parsed = parseEquationTerms(tex);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.termIds, ['lhs', 'frac']);

  const styled = buildStyledLatex(parsed.segments, new Set(['frac']), true, {
    ink: '#111111',
    dim: '#888888',
    defaultBorder: '#111111',
    defaultBg: '#fff3bf',
    termColors: {frac: {border: '#111111', bg: '#fff3bf'}},
  });
  const html = katex.renderToString(styled, {displayMode: true, trust: false, maxExpand: 64, strict: 'error'});
  assert.ok(html.includes('katex-display'));

  // Render every corpus equation under strict throwOnError: true for every active term spotlight
  const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/corpus/scripts/equation.json'), 'utf8'));
  for (const sc of corpus.scenes) {
    const v = EquationVisual.parse(sc.visual);
    for (const term of v.terms) {
      for (const eq of v.equations) {
        const p = parseEquationTerms(eq.latex);
        const s = buildStyledLatex(p.segments, new Set([term.id]), true, {
          ink: '#111111',
          dim: '#888888',
          defaultBorder: '#111111',
          defaultBg: '#fff3bf',
          termColors: {[term.id]: {border: '#111111', bg: '#fff3bf'}},
        });
        const out = katex.renderToString(s, {displayMode: true, trust: false, maxExpand: 64, strict: 'warn', throwOnError: true});
        assert.ok(out.includes('katex-display'));
      }
    }
  }
}

// 2. Hostile LaTeX & HTML injection payloads must all fail validateLatex / parseEquationTerms
{
  const hostile = [
    String.raw`\href{https://evil.example}{click}`,
    String.raw`\url{javascript:alert(1)}`,
    String.raw`\htmlClass{xss}{x}`,
    String.raw`\htmlData{foo=bar}{x}`,
    String.raw`\def\boom{\boom}\boom`,
    String.raw`\newcommand{\bad}{1}`,
    String.raw`\catcode64=11`,
    String.raw`\input{/etc/passwd}`,
    String.raw`x + <script>alert(1)</script>`,
    String.raw`a + \text{javascript:alert(1)}`,
    String.raw`\fcolorbox{#000}{#fff}{x}`,
    String.raw`x + {unclosed`,
  ];
  for (const h of hostile) {
    const errs = validateLatex(h);
    assert.ok(errs.length > 0, `Expected validation rejection for hostile payload: ${h}`);
  }

  // Nested \term and unbalanced \term fail
  assert.ok(parseEquationTerms(String.raw`\term{a}{\term{b}{x}}`).errors.length > 0);
  assert.ok(parseEquationTerms(String.raw`\term{bad!id}{x}`).errors.length > 0);
  assert.ok(parseEquationTerms(String.raw`\term{empty}{   }`).errors.length > 0);
}

// 3. Schema + semantics check
{
  const vis = EquationVisual.parse({
    type: 'equation',
    heading: 'Cross Entropy',
    equations: [{latex: String.raw`H(p, q) = -\sum_x \term{true}{p(x)} \term{logp}{\log q(x)}`}],
    terms: [
      {id: 'true', label: 'True distribution', gloss: 'Ground-truth target probability per outcome.'},
      {id: 'logp', label: 'Model surprise', gloss: 'Log probability assigned by our learned model.'},
    ],
  });
  assert.deepEqual(describe(vis, undefined).slots, ['True distribution', 'Model surprise']);
}

console.log('equation vector tests ok');
