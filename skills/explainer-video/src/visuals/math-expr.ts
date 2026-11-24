// Safe, bounded, zero-dependency mathematical expression parser and evaluator.
// Pure TS leaf: no React, Remotion, Three, or eval/Function. Protects against prototype lookup and DoS.

export const EXPR_LIMITS = {
  maxLen: 160,
  maxTokens: 80,
  maxNodes: 64,
  maxDepth: 12,
  maxLiteral: 1e9,
} as const;

export type ExprNode =
  | {kind: 'num'; value: number}
  | {kind: 'var'; name: string}
  | {kind: 'unary'; op: '+' | '-'; arg: ExprNode}
  | {kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: ExprNode; right: ExprNode}
  | {kind: 'call'; fn: string; args: ExprNode[]};

type Token =
  | {kind: 'num'; value: number; pos: number}
  | {kind: 'ident'; name: string; pos: number}
  | {kind: 'op'; op: '+' | '-' | '*' | '/' | '^'; pos: number}
  | {kind: 'lparen'; pos: number}
  | {kind: 'rparen'; pos: number}
  | {kind: 'comma'; pos: number};

const CONSTANTS = new Map<string, number>([
  ['pi', Math.PI],
  ['e', Math.E],
]);

type FnSpec = {arity: number; fn: (...args: number[]) => number};
const FUNCTIONS = new Map<string, FnSpec>([
  ['sin', {arity: 1, fn: Math.sin}],
  ['cos', {arity: 1, fn: Math.cos}],
  ['tan', {arity: 1, fn: Math.tan}],
  ['asin', {arity: 1, fn: Math.asin}],
  ['acos', {arity: 1, fn: Math.acos}],
  ['atan', {arity: 1, fn: Math.atan}],
  ['sinh', {arity: 1, fn: Math.sinh}],
  ['cosh', {arity: 1, fn: Math.cosh}],
  ['tanh', {arity: 1, fn: Math.tanh}],
  ['exp', {arity: 1, fn: Math.exp}],
  ['ln', {arity: 1, fn: Math.log}],
  ['log10', {arity: 1, fn: Math.log10}],
  ['log2', {arity: 1, fn: Math.log2}],
  ['sqrt', {arity: 1, fn: Math.sqrt}],
  ['cbrt', {arity: 1, fn: Math.cbrt}],
  ['abs', {arity: 1, fn: Math.abs}],
  ['floor', {arity: 1, fn: Math.floor}],
  ['ceil', {arity: 1, fn: Math.ceil}],
  ['sign', {arity: 1, fn: Math.sign}],
  ['round', {arity: 1, fn: Math.round}],
  ['min', {arity: 2, fn: Math.min}],
  ['max', {arity: 2, fn: Math.max}],
  ['pow', {arity: 2, fn: Math.pow}],
  ['atan2', {arity: 2, fn: Math.atan2}],
  ['hypot', {arity: 2, fn: Math.hypot}],
  ['clamp', {arity: 3, fn: (v, lo, hi) => (lo <= hi ? Math.min(hi, Math.max(lo, v)) : NaN)}],
]);

const isDigit = (c: string) => c >= '0' && c <= '9';
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';

function tokenize(src: string): {ok: true; tokens: Token[]} | {ok: false; error: string} {
  if (src.length > EXPR_LIMITS.maxLen) {
    return {ok: false, error: `expression is ${src.length} characters (limit ${EXPR_LIMITS.maxLen})`};
  }
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\u2212') {
      return {ok: false, error: `use ASCII '-' instead of Unicode minus (U+2212) at position ${i}`};
    }
    if (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) > 0x7e) {
      return {ok: false, error: `unsupported character "${ch}" at position ${i}: use ASCII math syntax`};
    }
    if (isDigit(ch) || (ch === '.' && i + 1 < src.length && isDigit(src[i + 1]))) {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (i < src.length && src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      // Scientific notation ONLY when digits follow [eE] or [eE][+-], so 2e^x -> 2, e, ^, x and 2e-x -> 2, e, -, x.
      if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
        const expStart = i + 1;
        let k = expStart;
        if (k < src.length && (src[k] === '+' || src[k] === '-')) k++;
        if (k < src.length && isDigit(src[k])) {
          while (k < src.length && isDigit(src[k])) k++;
          i = k;
        }
      }
      const raw = src.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value) || Math.abs(value) > EXPR_LIMITS.maxLiteral) {
        return {ok: false, error: `number "${raw}" is out of range (limit ${EXPR_LIMITS.maxLiteral})`};
      }
      tokens.push({kind: 'num', value, pos: start});
    } else if (isAlpha(ch)) {
      const start = i;
      while (i < src.length && (isAlpha(src[i]) || isDigit(src[i]))) i++;
      tokens.push({kind: 'ident', name: src.slice(start, i), pos: start});
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      if (ch === '*' && i + 1 < src.length && src[i + 1] === '*') {
        return {ok: false, error: `use '^' instead of '**' for exponentiation at position ${i}`};
      }
      tokens.push({kind: 'op', op: ch, pos: i});
      i++;
    } else if (ch === '(') {
      tokens.push({kind: 'lparen', pos: i});
      i++;
    } else if (ch === ')') {
      tokens.push({kind: 'rparen', pos: i});
      i++;
    } else if (ch === ',') {
      tokens.push({kind: 'comma', pos: i});
      i++;
    } else {
      return {ok: false, error: `unexpected character "${ch}" at position ${i}`};
    }
    if (tokens.length > EXPR_LIMITS.maxTokens) {
      return {ok: false, error: `expression has more than ${EXPR_LIMITS.maxTokens} tokens`};
    }
  }
  if (!tokens.length) return {ok: false, error: 'expression is empty'};
  return {ok: true, tokens};
}

export function parseExpr(src: string, allowedVars: readonly string[]): {ok: true; ast: ExprNode} | {ok: false; error: string} {
  if (typeof src !== 'string') return {ok: false, error: 'expression must be a string'};
  const lex = tokenize(src);
  if (!lex.ok) return lex;
  const tokens = lex.tokens;
  const varSet = new Set(allowedVars);
  let idx = 0;
  let nodes = 0;

  const peek = (): Token | undefined => tokens[idx];
  const countNode = (node: ExprNode): ExprNode => {
    nodes++;
    if (nodes > EXPR_LIMITS.maxNodes) {
      throw new Error(`expression exceeds ${EXPR_LIMITS.maxNodes} AST nodes`);
    }
    return node;
  };

  function parseAdd(depth: number): ExprNode {
    if (depth > EXPR_LIMITS.maxDepth) throw new Error(`expression nesting exceeds depth ${EXPR_LIMITS.maxDepth}`);
    let left = parseMul(depth);
    while (true) {
      const t = peek();
      if (t && t.kind === 'op' && (t.op === '+' || t.op === '-')) {
        idx++;
        const right = parseMul(depth);
        left = countNode({kind: 'binary', op: t.op, left, right});
      } else {
        break;
      }
    }
    return left;
  }

  function parseMul(depth: number): ExprNode {
    if (depth > EXPR_LIMITS.maxDepth) throw new Error(`expression nesting exceeds depth ${EXPR_LIMITS.maxDepth}`);
    let left = parseUnary(depth);
    while (true) {
      const prev = tokens[idx - 1];
      const t = peek();
      if (!t) break;
      if (t.kind === 'op' && (t.op === '*' || t.op === '/')) {
        idx++;
        const right = parseUnary(depth);
        left = countNode({kind: 'binary', op: t.op, left, right});
      } else if (
        // Controlled implicit multiplication: `2x`, `2(x+1)`, `2sin(x)`, `(x+1)(x-1)`, `(x+1)x`, `(x+1)2`
        (prev && (prev.kind === 'num' && (t.kind === 'ident' || t.kind === 'lparen'))) ||
        (prev && prev.kind === 'rparen' && (t.kind === 'lparen' || t.kind === 'ident' || t.kind === 'num'))
      ) {
        const right = parseUnary(depth);
        left = countNode({kind: 'binary', op: '*', left, right});
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary(depth: number): ExprNode {
    if (depth > EXPR_LIMITS.maxDepth) throw new Error(`expression nesting exceeds depth ${EXPR_LIMITS.maxDepth}`);
    const t = peek();
    if (t && t.kind === 'op' && (t.op === '+' || t.op === '-')) {
      idx++;
      return countNode({kind: 'unary', op: t.op, arg: parseUnary(depth + 1)});
    }
    return parsePower(depth);
  }

  function parsePower(depth: number): ExprNode {
    if (depth > EXPR_LIMITS.maxDepth) throw new Error(`expression nesting exceeds depth ${EXPR_LIMITS.maxDepth}`);
    const base = parsePrimary(depth);
    const t = peek();
    if (t && t.kind === 'op' && t.op === '^') {
      idx++;
      // Right-associative; exponent parses unary so e^-x^2 and 2^-3 work naturally while -x^2 = -(x^2).
      const exp = parseUnary(depth + 1);
      return countNode({kind: 'binary', op: '^', left: base, right: exp});
    }
    return base;
  }

  function parsePrimary(depth: number): ExprNode {
    if (depth > EXPR_LIMITS.maxDepth) throw new Error(`expression nesting exceeds depth ${EXPR_LIMITS.maxDepth}`);
    const t = peek();
    if (!t) throw new Error('unexpected end of expression');
    if (t.kind === 'num') {
      idx++;
      return countNode({kind: 'num', value: t.value});
    }
    if (t.kind === 'lparen') {
      idx++;
      const inner = parseAdd(depth + 1);
      const close = peek();
      if (!close || close.kind !== 'rparen') throw new Error(`missing closing ')' for '(' at position ${t.pos}`);
      idx++;
      return inner;
    }
    if (t.kind === 'ident') {
      idx++;
      const next = peek();
      if (next && next.kind === 'lparen') {
        if (t.name === 'log') {
          throw new Error("use 'ln' (natural log), 'log10', or 'log2' instead of ambiguous 'log'");
        }
        const spec = FUNCTIONS.get(t.name);
        if (!spec) throw new Error(`unknown function "${t.name}" at position ${t.pos}`);
        idx++; // consume '('
        const args: ExprNode[] = [];
        if (peek()?.kind !== 'rparen') {
          args.push(parseAdd(depth + 1));
          while (peek()?.kind === 'comma') {
            idx++;
            args.push(parseAdd(depth + 1));
          }
        }
        const close = peek();
        if (!close || close.kind !== 'rparen') throw new Error(`missing ')' in call to ${t.name}()`);
        idx++;
        if (args.length !== spec.arity) {
          throw new Error(`function ${t.name}() expects ${spec.arity} argument${spec.arity === 1 ? '' : 's'}, got ${args.length}`);
        }
        return countNode({kind: 'call', fn: t.name, args});
      }
      const cval = CONSTANTS.get(t.name);
      if (cval !== undefined) return countNode({kind: 'num', value: cval});
      if (varSet.has(t.name)) return countNode({kind: 'var', name: t.name});
      if (FUNCTIONS.has(t.name)) {
        throw new Error(`function "${t.name}" must be followed by '()' at position ${t.pos}`);
      }
      throw new Error(`unknown identifier "${t.name}" (allowed variables: ${allowedVars.join(', ') || 'none'})`);
    }
    throw new Error(`unexpected token at position ${t.pos}`);
  }

  try {
    const ast = parseAdd(0);
    if (idx < tokens.length) {
      return {ok: false, error: `unexpected token at position ${tokens[idx].pos}`};
    }
    return {ok: true, ast};
  } catch (err) {
    return {ok: false, error: err instanceof Error ? err.message : String(err)};
  }
}

export function evalExpr(node: ExprNode, vars: ReadonlyMap<string, number> | Readonly<Record<string, number>>): number {
  let out: number;
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var': {
      const v = vars instanceof Map
        ? (vars as ReadonlyMap<string, number>).get(node.name)
        : Object.prototype.hasOwnProperty.call(vars, node.name)
          ? (vars as Readonly<Record<string, number>>)[node.name]
          : NaN;
      return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
    }
    case 'unary': {
      const v = evalExpr(node.arg, vars);
      out = node.op === '-' ? -v : v;
      break;
    }
    case 'binary': {
      const l = evalExpr(node.left, vars);
      const r = evalExpr(node.right, vars);
      if (!Number.isFinite(l) || !Number.isFinite(r)) return NaN;
      switch (node.op) {
        case '+': out = l + r; break;
        case '-': out = l - r; break;
        case '*': out = l * r; break;
        case '/': out = r === 0 ? NaN : l / r; break;
        case '^': out = Math.pow(l, r); break;
      }
      break;
    }
    case 'call': {
      const spec = FUNCTIONS.get(node.fn);
      if (!spec) return NaN;
      const a0 = evalExpr(node.args[0], vars);
      if (spec.arity === 1) {
        out = Number.isFinite(a0) ? spec.fn(a0) : NaN;
      } else if (spec.arity === 2) {
        const a1 = evalExpr(node.args[1], vars);
        out = Number.isFinite(a0) && Number.isFinite(a1) ? spec.fn(a0, a1) : NaN;
      } else {
        const a1 = evalExpr(node.args[1], vars);
        const a2 = evalExpr(node.args[2], vars);
        out = Number.isFinite(a0) && Number.isFinite(a1) && Number.isFinite(a2) ? spec.fn(a0, a1, a2) : NaN;
      }
      break;
    }
  }
  return Number.isFinite(out) ? out : NaN;
}

export function compile1D(src: string): ((x: number) => number) | null {
  const r = parseExpr(src, ['x']);
  if (!r.ok) return null;
  const ast = r.ast;
  const vars = new Map<string, number>([['x', 0]]);
  return (x: number) => {
    vars.set('x', x);
    return evalExpr(ast, vars);
  };
}

export function compile2D(src: string): ((x: number, y: number) => number) | null {
  const r = parseExpr(src, ['x', 'y']);
  if (!r.ok) return null;
  const ast = r.ast;
  const vars = new Map<string, number>([['x', 0], ['y', 0]]);
  return (x: number, y: number) => {
    vars.set('x', x);
    vars.set('y', y);
    return evalExpr(ast, vars);
  };
}

/** Central numerical derivative with domain-scaled step. */
export function numDeriv(fn: (x: number) => number, x: number, span = 10): number {
  const h = Math.max(Math.abs(span) * 1e-4, Math.abs(x) * 1e-5, 1e-6);
  const fp = fn(x + h);
  const fm = fn(x - h);
  if (!Number.isFinite(fp) || !Number.isFinite(fm)) return NaN;
  const d = (fp - fm) / (2 * h);
  return Number.isFinite(d) ? d : NaN;
}

export function leftDeriv(fn: (x: number) => number, x: number, h: number): number {
  const f0 = fn(x), fm = fn(x - h);
  if (!Number.isFinite(f0) || !Number.isFinite(fm)) return NaN;
  const d = (f0 - fm) / h;
  return Number.isFinite(d) ? d : NaN;
}

export function rightDeriv(fn: (x: number) => number, x: number, h: number): number {
  const f0 = fn(x), fp = fn(x + h);
  if (!Number.isFinite(f0) || !Number.isFinite(fp)) return NaN;
  const d = (fp - f0) / h;
  return Number.isFinite(d) ? d : NaN;
}

/** Detect a non-differentiable corner by checking normalized slope angle jump across two step scales (h and h/4). */
export function detectCorner(
  fn: (x: number) => number,
  x: number,
  xSpan: number,
  ySpan: number,
): {isCorner: boolean; leftSlope: number; rightSlope: number} {
  const h1 = Math.max(Math.abs(xSpan) * 2e-3, 1e-4);
  const h2 = h1 * 0.25;
  const aspect = Math.max(Math.abs(xSpan), 1e-6) / Math.max(Math.abs(ySpan), 1e-6);
  const angle = (m: number) => Math.atan(m * aspect);

  const l1 = leftDeriv(fn, x, h1);
  const r1 = rightDeriv(fn, x, h1);
  const l2 = leftDeriv(fn, x, h2);
  const r2 = rightDeriv(fn, x, h2);
  if (![l1, r1, l2, r2].every(Number.isFinite)) {
    return {isCorner: false, leftSlope: NaN, rightSlope: NaN};
  }
  const d1 = Math.abs(angle(r1) - angle(l1));
  const d2 = Math.abs(angle(r2) - angle(l2));
  const thresh = (12 * Math.PI) / 180;
  // On a true corner (like |x|), angle difference stays large as h shrinks; on smooth curves (even 100*x^2), d2 ~= d1/4.
  const isCorner = d1 > thresh && d2 > thresh && d2 > d1 * 0.55;
  return {isCorner, leftSlope: l2, rightSlope: r2};
}

/** Composite Simpson integration on [a, b], skipping non-finite samples cleanly. */
export function simpsonIntegrate(fn: (x: number) => number, a: number, b: number, steps = 64): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 0;
  const sign = b < a ? -1 : 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const n = Math.max(2, steps % 2 === 0 ? steps : steps + 1);
  const h = (hi - lo) / n;
  let total = 0;
  for (let i = 0; i < n; i += 2) {
    const x0 = lo + i * h;
    const x1 = x0 + h;
    const x2 = x0 + 2 * h;
    const y0 = fn(x0), y1 = fn(x1), y2 = fn(x2);
    if (Number.isFinite(y0) && Number.isFinite(y1) && Number.isFinite(y2)) {
      total += ((y0 + 4 * y1 + y2) * h) / 3;
    }
  }
  return sign * total;
}

/** O(N) cumulative integral F(xs[i]) = int_{xs[0]}^{xs[i]} fn(t) dt via composite Simpson / midpoint refinement. */
export function cumulativeSimpson(fn: (x: number) => number, xs: readonly number[]): number[] {
  if (!xs.length) return [];
  const out = new Array<number>(xs.length);
  out[0] = 0;
  let acc = 0;
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1], b = xs[i];
    const h = b - a;
    const ya = fn(a), ym = fn((a + b) * 0.5), yb = fn(b);
    if (Number.isFinite(ya) && Number.isFinite(ym) && Number.isFinite(yb)) {
      acc += (h / 6) * (ya + 4 * ym + yb);
    }
    out[i] = acc;
  }
  return out;
}
