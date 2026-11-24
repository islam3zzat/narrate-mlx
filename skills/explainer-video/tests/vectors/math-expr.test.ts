// Unit tests for src/visuals/math-expr.ts (safe parser, evaluator, calculus helpers, DoS & prototype bounds).
import {
  compile1D,
  compile2D,
  cumulativeSimpson,
  detectCorner,
  evalExpr,
  EXPR_LIMITS,
  numDeriv,
  parseExpr,
  simpsonIntegrate,
} from '../../src/visuals/math-expr';

let bad = 0, total = 0;
const T = (cond: boolean, msg: string) => { total++; if (!cond) { bad++; console.error('FAIL ' + msg); } };
const close = (a: number, b: number, eps = 1e-4) => Number.isFinite(a) && Math.abs(a - b) <= eps;

// Precedence and unary-vs-power edge cases
{
  const f1 = compile1D('-x^2')!;
  T(close(f1(3), -9) && close(f1(-3), -9), '-x^2 evaluates as -(x^2)');

  const f2 = compile1D('2^3^2')!;
  T(close(f2(0), 512), '2^3^2 is right-associative (2^(3^2) = 512)');

  const f3 = compile1D('e^-x^2')!;
  T(close(f3(1), Math.exp(-1)) && close(f3(2), Math.exp(-4)), 'e^-x^2 parses unary minus in exponent');

  const f4 = compile1D('2^-3')!;
  T(close(f4(0), 0.125), '2^-3 = 0.125');

  const f5 = compile1D('1e-5 + 2e^x - 2e-x');
  T(f5 !== null, 'scientific notation 1e-5 coexists with 2e^x and 2e-x');
  if (f5) T(close(f5(1), 1e-5 + 2 * Math.E - 2 * Math.E - 1), '2e^x and 2e-x evaluate accurately');

  const f6 = compile2D('exp(-((x - 1.2)^2 + y^2)) + 0.65 * exp(-((x + 1.4)^2 + y^2))');
  T(f6 !== null && close(f6(1.2, 0), 1 + 0.65 * Math.exp(-2.6 * 2.6)), 'nested Gaussian expression parses well within depth limit');
}

// Implicit multiplication & multi-arg functions
{
  const f = compile1D('2x + 3(x + 1) + clamp(x, 0, 2) + hypot(3, 4)')!;
  T(close(f(1), 2 + 6 + 1 + 5), 'implicit mult + clamp + hypot');

  const g = compile2D('atan2(y, x) + min(x, y) + max(x, y) + pow(2, 3)')!;
  T(close(g(1, 0), 0 + 0 + 1 + 8), '2D compile + 2-arg functions');
}

// Constants & unary math functions
{
  const f = compile1D('sin(pi / 2) + cos(0) + ln(e) + log10(100) + log2(8) + cbrt(27) + abs(-4)')!;
  T(close(f(0), 1 + 1 + 1 + 2 + 3 + 3 + 4), 'constants and transcendental functions');
}

// Non-finite inputs return NaN safely without throwing
{
  const f = compile1D('1 / x + sqrt(x)')!;
  T(Number.isNaN(f(0)) && Number.isNaN(f(-1)) && close(f(4), 2.25), 'division by zero and sqrt(-1) return NaN');
}

// Actionable error messages & security / prototype / DoS guards
{
  T(!parseExpr('x ** 2', ['x']).ok, 'rejects ** with hint');
  const unicodeMinus = parseExpr('x \u2212 1', ['x']);
  T(!unicodeMinus.ok && unicodeMinus.error.includes('ASCII'), 'rejects Unicode minus with ASCII hint');
  const ambigLog = parseExpr('log(x)', ['x']);
  T(!ambigLog.ok && ambigLog.error.includes('ln'), 'rejects ambiguous log() with hint');
  T(!parseExpr('__proto__', ['x']).ok, 'rejects __proto__');
  T(!parseExpr('constructor', ['x']).ok, 'rejects constructor');
  T(!parseExpr('toString', ['x']).ok, 'rejects toString');
  T(!parseExpr('window', ['x']).ok, 'rejects unknown ident');
  T(!parseExpr('y + 1', ['x']).ok, 'rejects y when only x allowed');
  T(!parseExpr('alert(1)', ['x']).ok, 'rejects unknown function');
  T(!parseExpr('sin(1, 2)', ['x']).ok, 'rejects wrong arity');
  T(!parseExpr('x'.repeat(EXPR_LIMITS.maxLen + 1), ['x']).ok, 'rejects over-long expression');
  T(!parseExpr('('.repeat(20) + 'x' + ')'.repeat(20), ['x']).ok, 'rejects excessive nesting depth');
  T(!parseExpr(Array(40).fill('x').join('+'), ['x']).ok, 'rejects excessive AST node count');
  T(!parseExpr('1e12', ['x']).ok, 'rejects giant literal');

  // Even when evaluating a raw AST with Object.prototype keys, evalExpr checks own properties only
  const r = parseExpr('x', ['x']);
  T(r.ok && Number.isNaN(evalExpr({kind: 'var', name: 'toString'}, {x: 1})), 'evalExpr uses own property check');
}

// Derivatives, corner detection, Simpson integration
{
  const quad = (x: number) => 0.5 * x * x;
  T(close(numDeriv(quad, 2, 10), 2, 1e-3), 'numDeriv of 0.5*x^2 at 2 is 2');

  const corner = detectCorner((x) => Math.abs(x), 0, 4, 4);
  T(corner.isCorner && close(corner.leftSlope, -1, 1e-3) && close(corner.rightSlope, 1, 1e-3), 'detectCorner finds |x| at 0');

  const smoothSteep = detectCorner((x) => 100 * x * x, 0, 4, 400);
  T(!smoothSteep.isCorner, 'detectCorner does NOT falsely flag smooth 100*x^2');

  const area = simpsonIntegrate((x) => Math.sin(x), 0, Math.PI, 64);
  T(close(area, 2, 1e-4), 'simpsonIntegrate sin(x) over [0, pi] = 2');

  const xs = [0, 0.5, 1.0, 1.5, 2.0];
  const cum = cumulativeSimpson((x) => 2 * x, xs);
  T(cum.length === 5 && close(cum[0], 0) && close(cum[4], 4, 1e-4), 'cumulativeSimpson O(N) integral of 2x');
}

console.log(`${total - bad}/${total} checks passed`);
if (bad) throw new Error(`${bad} check(s) failed`);
