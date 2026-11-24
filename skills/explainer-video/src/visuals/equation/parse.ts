// Pure LaTeX sanitization, `\term{id}{...}` AST parsing, and KaTeX highlight rewriting.
// Pure TS leaf (no React, Remotion, KaTeX, or Three).

export const EQUATION_LIMITS = {
  heading: 60,
  caption: 160,
  latex: 400,
  eqLabel: 36,
  termLabel: 36,
  gloss: 140,
  maxEquations: 2,
  maxTerms: 8,
} as const;

export const FORBIDDEN_TEX_COMMANDS = new Set<string>([
  'htmlclass',
  'htmlid',
  'htmlstyle',
  'htmldata',
  'href',
  'url',
  'includegraphics',
  'def',
  'gdef',
  'edef',
  'xdef',
  'let',
  'futurelet',
  'newcommand',
  'renewcommand',
  'providecommand',
  'newenvironment',
  'renewenvironment',
  'catcode',
  'input',
  'include',
  'write',
  'openin',
  'openout',
  'read',
  'closein',
  'closeout',
  'csname',
  'endcsname',
  'expandafter',
  'noexpand',
  'relax',
  'special',
  'pdfliteral',
  'classname',
  'mathchoice',
  'char',
  'fcolorbox', // reserved for renderer spotlighting
]);

export type EqSegment =
  | {kind: 'raw'; text: string}
  | {kind: 'term'; id: string; tex: string};

const TERM_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** Strictly validate LaTeX formula string against unsafe macros, HTML injection, and unbalanced braces. */
export function validateLatex(tex: string): string[] {
  const errors: string[] = [];
  if (!tex || !tex.trim()) {
    errors.push('latex must not be empty');
    return errors;
  }
  if (tex.length > EQUATION_LIMITS.latex) {
    errors.push(`latex length (${tex.length}) exceeds max ${EQUATION_LIMITS.latex}`);
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(tex)) {
    errors.push('latex contains disallowed control characters');
  }
  if (/<[a-zA-Z!?/]/.test(tex)) {
    errors.push('latex must not contain raw HTML tags');
  }
  if (/(?:javascript|vbscript|data)\s*:/i.test(tex)) {
    errors.push('latex must not contain URI schemes');
  }

  // Reject unescaped `$` math delimiters (breaks `\fcolorbox{...}{...}{$\displaystyle ...$}` math mode)
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] === '\\') {
      i++;
      continue;
    }
    if (tex[i] === '$') {
      errors.push('latex must not contain unescaped "$" delimiters');
      break;
    }
  }

  // Scan TeX control words (`\foo`), skipping escaped symbols like `\{`, `\\`, `\%`
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] === '\\') {
      if (i + 1 >= tex.length) {
        errors.push('latex ends with trailing backslash');
        break;
      }
      const next = tex[i + 1];
      if (/[a-zA-Z]/.test(next)) {
        let j = i + 1;
        while (j < tex.length && /[a-zA-Z]/.test(tex[j])) j++;
        const cmd = tex.slice(i + 1, j).toLowerCase();
        if (FORBIDDEN_TEX_COMMANDS.has(cmd)) {
          errors.push(`disallowed LaTeX command "\\${tex.slice(i + 1, j)}"`);
        }
        i = j - 1;
      } else {
        i++; // skip escaped punctuation (`\\`, `\{`, `\}`)
      }
    }
  }

  // Verify balanced curly braces outside escaped `\{` / `\}`
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) {
        errors.push('unbalanced closing brace "}" in latex');
        break;
      }
    }
  }
  if (depth > 0) errors.push('unclosed brace "{" in latex');

  return errors;
}

function readBalancedGroup(s: string, openBraceIdx: number): {body: string; endIdx: number} | null {
  if (s[openBraceIdx] !== '{') return null;
  let depth = 0;
  for (let i = openBraceIdx; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        return {body: s.slice(openBraceIdx + 1, i), endIdx: i};
      }
    }
  }
  return null;
}

/** Extract `\term{id}{expr}` spans cleanly using balanced brace scanning (no nested `\term`). */
export function parseEquationTerms(tex: string): {
  segments: EqSegment[];
  termIds: string[];
  errors: string[];
} {
  const segments: EqSegment[] = [];
  const termIds: string[] = [];
  const errors: string[] = [];
  let rawStart = 0;
  let i = 0;

  while (i < tex.length) {
    if (tex[i] === '\\') {
      if (tex.startsWith('\\term', i) && (i + 5 >= tex.length || !/[a-zA-Z]/.test(tex[i + 5]))) {
        if (i > rawStart) segments.push({kind: 'raw', text: tex.slice(rawStart, i)});
        let p = i + 5;
        while (p < tex.length && /\s/.test(tex[p])) p++;
        const idGroup = readBalancedGroup(tex, p);
        if (!idGroup) {
          errors.push('\\term requires {id}{math} arguments');
          return {segments, termIds, errors};
        }
        const id = idGroup.body.trim();
        if (!TERM_ID_RE.test(id)) {
          errors.push(`invalid \\term id "${id}" (expected 1..32 alphanumeric, "_", or "-" characters)`);
        }
        let q = idGroup.endIdx + 1;
        while (q < tex.length && /\s/.test(tex[q])) q++;
        const bodyGroup = readBalancedGroup(tex, q);
        if (!bodyGroup) {
          errors.push(`\\term{${id}} is missing its {math} argument`);
          return {segments, termIds, errors};
        }
        if (/\\term(?![a-zA-Z])/.test(bodyGroup.body)) {
          errors.push(`nested \\term inside \\term{${id}} is not allowed`);
        }
        if (!bodyGroup.body.trim()) {
          errors.push(`\\term{${id}} must not have an empty expression`);
        }
        termIds.push(id);
        segments.push({kind: 'term', id, tex: bodyGroup.body});
        i = bodyGroup.endIdx + 1;
        rawStart = i;
        continue;
      }
      i += 2;
      continue;
    }
    i++;
  }

  if (rawStart < tex.length) {
    segments.push({kind: 'raw', text: tex.slice(rawStart)});
  }
  return {segments, termIds, errors};
}

export type HighlightColors = {
  ink: string;
  dim: string;
  defaultBorder: string;
  defaultBg: string;
  termColors: Record<string, {border: string; bg: string}>;
};

/**
 * Rewrite parsed segments into sanitized KaTeX LaTeX where active term IDs are highlighted
 * via `\fcolorbox{border}{bg}{$\displaystyle ...$}` and inactive terms are dimmed via `\textcolor`.
 */
export function buildStyledLatex(
  segments: readonly EqSegment[],
  activeIds: ReadonlySet<string>,
  hasSpotlight: boolean,
  colors: HighlightColors,
): string {
  return segments
    .map((seg) => {
      if (seg.kind === 'raw') return seg.text;
      if (!hasSpotlight) return `\\textcolor{${colors.ink}}{${seg.tex}}`;
      if (activeIds.has(seg.id)) {
        const pal = colors.termColors[seg.id] ?? {border: colors.defaultBorder, bg: colors.defaultBg};
        return `\\fcolorbox{${pal.border}}{${pal.bg}}{$\\displaystyle ${seg.tex}$}`;
      }
      return `\\textcolor{${colors.dim}}{${seg.tex}}`;
    })
    .join('');
}
