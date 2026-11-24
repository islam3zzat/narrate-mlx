// Syntax colouring for the `code` visual. Pure (no React, remotion or three): Shiki's synchronous core with the JavaScript
// regex engine (no WASM), only the grammars of CODE_LANGUAGES, and one theme per active ThemeSpec palette.
import {createHighlighterCoreSync, type ThemeRegistration, type HighlighterCore} from 'shiki/core';
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript';
import typescript from '@shikijs/langs/typescript';
import tsx from '@shikijs/langs/tsx';
import javascript from '@shikijs/langs/javascript';
import jsx from '@shikijs/langs/jsx';
import python from '@shikijs/langs/python';
import go from '@shikijs/langs/go';
import rust from '@shikijs/langs/rust';
import java from '@shikijs/langs/java';
import sql from '@shikijs/langs/sql';
import bash from '@shikijs/langs/bash';
import json from '@shikijs/langs/json';
import yaml from '@shikijs/langs/yaml';
import diff from '@shikijs/langs/diff';
import {THEME_SPECS, mixHex, type Palette, type ThemeName} from '../../themes';
import {CODE_LIMITS, type CODE_LANGUAGES} from './schema';

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
export type Token = {content: string; color: string};

export const mix = mixHex;

/** Every colour the code panel uses, derived from the given palette. */
export const codeColorsFor = (C: Palette) => ({
  bg: C.ink,
  text: C.panel,
  keyword: C.secondary,
  string: C.accent,
  number: C.primary,
  comment: mixHex(C.dim, C.panel, 0.45), // the palette's grey, lightened to read on black
  inserted: C.accent,
  deleted: C.danger,
} as const);

export const CODE_COLORS = codeColorsFor(THEME_SPECS.paper.C);

export const codeThemeFor = (name: string, C: Palette): ThemeRegistration => {
  const K = codeColorsFor(C);
  return {
    name,
    type: 'dark',
    colors: {'editor.background': K.bg, 'editor.foreground': K.text},
    settings: [
      {settings: {foreground: K.text}},
      {scope: ['comment', 'punctuation.definition.comment'], settings: {foreground: K.comment}},
      {scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.new', 'keyword.operator.expression', 'entity.name.tag', 'support.type.property-name.json'], settings: {foreground: K.keyword}},
      {scope: ['string', 'string.quoted', 'punctuation.definition.string', 'markup.inline.raw'], settings: {foreground: K.string}},
      {scope: ['constant', 'constant.numeric', 'constant.language', 'support.constant', 'variable.language', 'entity.name.type', 'support.type', 'support.class'], settings: {foreground: K.number}},
      {scope: ['markup.inserted', 'meta.diff.header.to-file'], settings: {foreground: K.inserted}},
      {scope: ['markup.deleted', 'meta.diff.header.from-file'], settings: {foreground: K.deleted}},
      {scope: ['meta.diff.range', 'meta.diff.header'], settings: {foreground: K.comment}},
    ],
  };
};

export const CODE_THEME: ThemeRegistration = codeThemeFor('explainer-code', THEME_SPECS.paper.C);

const GRAMMAR: Record<Exclude<CodeLanguage, 'text'>, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', python: 'python', go: 'go', rust: 'rust', java: 'java', sql: 'sql', bash: 'shellscript', json: 'json', yaml: 'yaml', diff: 'diff',
};

let highlighter: HighlighterCore | undefined;
const get = (): HighlighterCore =>
  (highlighter ??= createHighlighterCoreSync({
    themes: [
      CODE_THEME,
      ...Object.entries(THEME_SPECS).map(([name, spec]) => codeThemeFor(`explainer-code-${name}`, spec.C)),
    ],
    langs: [typescript, tsx, javascript, jsx, python, go, rust, java, sql, bash, json, yaml, diff],
    engine: createJavaScriptRegexEngine(),
  }));

/** The code as one plain (uncoloured) token per line: what `tokenize` falls back to. */
export const plainTokens = (code: string, themeName: ThemeName = 'paper'): Token[][] => {
  const textCol = codeColorsFor(THEME_SPECS[themeName].C).text.toLowerCase();
  return code.split('\n').map((l) => [{content: l, color: textCol}]);
};

/** Shiki limits that make the colours a pure function of the text: Shiki's own default stops a line after 500 ms (so colours would
 *  depend on machine load), so the time limit is made practically unlimited (the schema's line cap bounds the work: a hostile
 *  line is tested in code.test.ts), and a line is skipped only above the longest an accepted line can be (the schema caps a line at
 *  CODE_LIMITS.lineUnits UTF-16 units, combining marks included; the view is never given more). */
export const TOKENIZE_OPTIONS = {tokenizeTimeLimit: 1e9, tokenizeMaxLineLength: CODE_LIMITS.lineUnits + 1} as const;

type Tokenizer = Pick<HighlighterCore, 'codeToTokensBase'>;
/** The code split into lines of coloured tokens. Lossless (the tokens of a line join to the line) and deterministic; `text` is one plain token per line.
 *  Any failure of the highlighter, or tokens that do not rebuild the code, gives the plain tokens instead of an error. */
export const tokenize = (code: string, lang: CodeLanguage, hl?: Tokenizer, themeName: ThemeName = 'paper'): Token[][] => {
  if (lang === 'text') return plainTokens(code, themeName);
  const textCol = codeColorsFor(THEME_SPECS[themeName].C).text.toLowerCase();
  const regName = hl ? CODE_THEME.name! : `explainer-code-${themeName}`;
  try {
    const out = (hl ?? get()).codeToTokensBase(code, {lang: GRAMMAR[lang], theme: regName, ...TOKENIZE_OPTIONS});
    const toks = out.map((line) => line.map((t) => ({content: t.content, color: (t.color || textCol).toLowerCase()})));
    return toks.length === code.split('\n').length && toks.every((l, i) => l.map((t) => t.content).join('') === code.split('\n')[i]) ? toks : plainTokens(code, themeName);
  } catch {
    return plainTokens(code, themeName);
  }
};
