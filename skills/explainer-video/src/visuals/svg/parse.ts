// Strict SVG subset for the `svg` visual: a hand-written parser that REJECTS anything outside the vocabulary (it never
// strips, so the model that wrote the markup sees what to fix). Pure: no DOM, no dependencies, no React (the registry
// imports this, and must stay free of rendering code).
//
// The result is a normalised tree: every paint, width, font and size is already resolved to a token, so a renderer
// only maps tokens to the theme. Nothing the markup says can reach the page as markup: the view builds React elements
// from this tree (never <Img>, never dangerouslySetInnerHTML).

export const TAGS = ['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'] as const;
export type Tag = (typeof TAGS)[number];

/** Colour names the markup may use: the keys of theme.json's C (a test keeps them equal), plus `none`. */
export const COLOR_TOKENS = ['ink', 'panel', 'bg', 'muted', 'dim', 'primary', 'secondary', 'accent', 'danger'] as const;
export const PAINTS = [...COLOR_TOKENS, 'none'] as const;
export const FONT_TOKENS = ['sans', 'mono'] as const;
export const SIZE_TOKENS = ['small', 'body', 'label', 'title'] as const;
export const ANCHORS = ['start', 'middle', 'end'] as const;
export const ARROWS = ['end', 'both'] as const;
export const STROKE_WIDTHS = [2, 4] as const;
export const DEFAULT_STROKE_WIDTH = 4;

export const LIMITS = {bytes: 24 * 1024, elements: 300, depth: 6, parts: 16, pathChars: 4000, pointsChars: 2000, textChars: 80, viewBoxMin: 100, viewBoxMax: 4000, coord: 100000, errors: 12} as const;

export type Transform = {fn: 'translate' | 'scale' | 'rotate'; args: number[]};
/** A parsed element, or (tag '#text') a run of character data inside <text>/<tspan>. */
export type SvgNode = {tag: Tag | '#text'; attrs: Record<string, string | number>; tf?: Transform[]; children: SvgNode[]; text?: string};
export type SvgDoc = {viewBox: {x: number; y: number; w: number; h: number}; children: SvgNode[]; parts: string[]};
export type ParseResult = {ok: true; doc: SvgDoc} | {ok: false; errors: string[]};

type Kind = 'num' | 'len' | 'paint' | 'width' | 'font' | 'size' | 'anchor' | 'arrow' | 'points' | 'd' | 'transform' | 'id';
const PAINT_ATTRS: Record<string, Kind> = {fill: 'paint', stroke: 'paint', 'stroke-width': 'width'};
const SPEC: Record<Exclude<Tag, 'svg'>, Record<string, Kind>> = {
  g: {id: 'id', transform: 'transform'},
  rect: {x: 'num', y: 'num', width: 'len', height: 'len', ...PAINT_ATTRS, transform: 'transform'},
  circle: {cx: 'num', cy: 'num', r: 'len', ...PAINT_ATTRS, transform: 'transform'},
  ellipse: {cx: 'num', cy: 'num', rx: 'len', ry: 'len', ...PAINT_ATTRS, transform: 'transform'},
  line: {x1: 'num', y1: 'num', x2: 'num', y2: 'num', stroke: 'paint', 'stroke-width': 'width', arrow: 'arrow', transform: 'transform'},
  polyline: {points: 'points', ...PAINT_ATTRS, arrow: 'arrow', transform: 'transform'},
  polygon: {points: 'points', ...PAINT_ATTRS, transform: 'transform'},
  path: {d: 'd', ...PAINT_ATTRS, arrow: 'arrow', transform: 'transform'},
  text: {x: 'num', y: 'num', fill: 'paint', font: 'font', size: 'size', 'text-anchor': 'anchor', transform: 'transform'},
  tspan: {x: 'num', y: 'num', dx: 'num', dy: 'num', fill: 'paint', font: 'font', size: 'size'},
};
const REQUIRED: Partial<Record<Tag, string[]>> = {
  rect: ['width', 'height'], circle: ['r'], ellipse: ['rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'], path: ['d'],
};
/** Attributes each element may carry (also read by the zod re-check in schema.ts and by the docs). */
export const ALLOWED_ATTRS: Record<Tag, string[]> = {svg: ['viewBox', 'xmlns'], ...Object.fromEntries(Object.entries(SPEC).map(([t, s]) => [t, Object.keys(s)])) as Record<Exclude<Tag, 'svg'>, string[]>};
const CLOSED = new Set<Tag>(['rect', 'circle', 'ellipse', 'polygon']);
const STROKE_ONLY = new Set<Tag>(['line', 'polyline', 'path']);
export const isShape = (t: string): boolean => CLOSED.has(t as Tag) || STROKE_ONLY.has(t as Tag);

const XMLNS = 'http://www.w3.org/2000/svg';
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const NUM_G = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const D_CHARS = /^[MLCQSTHVAZmlcqsthvaz0-9.,\s+\-eE]+$/;
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const ATTR_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;
const ENTITY = /^&(amp|lt|gt|quot|apos);/;
const ENT_CHAR: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
const ARITY: Record<string, number> = {m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0};

class Fatal extends Error {}

const num = (s: string): number | null => (NUM.test(s) && Math.abs(Number(s)) <= LIMITS.coord ? Number(s) : null);
// control characters, plus bidi overrides/isolates, line/paragraph separators and zero-width spaces (spoofing); U+200C/D stay for Arabic joining
const isCtl = (s: string) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/.test(s);

/** Checks a path's `d`: only the allowed characters, starts with a move, and every command has the right number of numbers. Returns an error text or null. */
export const checkPathData = (d: string): string | null => {
  if (!d.trim()) return 'is empty';
  if (d.length > LIMITS.pathChars) return `is ${d.length} characters (limit ${LIMITS.pathChars})`;
  if (!D_CHARS.test(d)) return 'has characters outside M L H V C S Q T A Z, numbers, spaces, commas, signs and a decimal point';
  let i = 0, cmd = '', count = 0, first = true;
  const flush = (): string | null => {
    if (!cmd) return null;
    const k = ARITY[cmd.toLowerCase()];
    if (k === 0 ? count !== 0 : count === 0 || count % k !== 0) return `command ${cmd} needs ${k} number${k === 1 ? '' : 's'} per segment (got ${count}${cmd.toLowerCase() === 'a' ? '; write arc flags as separate numbers: "a 5 5 0 0 1 10 10"' : ''})`;
    return null;
  };
  while (i < d.length) {
    const c = d[i];
    if (/[\s,]/.test(c)) { i++; continue; }
    if (/[MLCQSTHVAZmlcqsthvaz]/.test(c)) {
      const e = flush();
      if (e) return e;
      if (first && !/[Mm]/.test(c)) return 'must start with M';
      first = false;
      cmd = c; count = 0; i++;
      continue;
    }
    NUM_G.lastIndex = i;
    const m = NUM_G.exec(d);
    if (!m) return `has an unreadable number near "${d.slice(i, i + 8)}"`;
    if (!cmd) return 'must start with M';
    const v = Number(m[0]);
    if (!Number.isFinite(v) || Math.abs(v) > LIMITS.coord) return `has a number out of range ("${m[0]}")`;
    count++; i = NUM_G.lastIndex;
  }
  return flush();
};

const parsePoints = (s: string): string | {error: string} => {
  if (s.length > LIMITS.pointsChars) return {error: `is ${s.length} characters (limit ${LIMITS.pointsChars})`};
  const parts = s.trim().split(/[\s,]+/).filter(Boolean);
  const ns = parts.map(num);
  if (ns.some((n) => n === null)) return {error: 'must be numbers separated by spaces or commas'};
  if (ns.length % 2 || ns.length < 4) return {error: 'needs at least two x,y pairs'};
  return (ns as number[]).map((n) => String(+n.toFixed(4))).join(' '); // fixed notation only: the render-time re-check does not accept exponents
};

const parseTransform = (s: string): Transform[] | {error: string} => {
  const out: Transform[] = [];
  const re = /\s*(translate|scale|rotate)\(([^()]*)\)\s*/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) return {error: 'allows only translate(x [y]), scale(s [sy]) and rotate(deg [cx cy]) with plain numbers'};
    const args = m[2].trim().split(/[\s,]+/).filter(Boolean).map(num);
    const fn = m[1] as Transform['fn'];
    const okN = fn === 'rotate' ? [1, 3] : [1, 2];
    if (args.some((a) => a === null) || !okN.includes(args.length)) return {error: `${fn}() takes ${okN.join(' or ')} plain number${okN[1] > 1 ? 's' : ''}`};
    out.push({fn, args: args as number[]});
    i = re.lastIndex;
  }
  if (!out.length) return {error: 'is empty'};
  if (out.length > 4) return {error: 'has more than 4 operations'};
  return out;
};

/** Parses and validates; the errors are written for the author (the model) to fix the markup. */
export const parseSvg = (src: unknown): ParseResult => {
  const errors: string[] = [];
  if (typeof src !== 'string') return {ok: false, errors: ['svg must be a string of markup']};
  let pos = 0;
  const lineOf = (p: number) => src.slice(0, p).split('\n').length;
  const err = (msg: string, p = pos) => { if (errors.length < LIMITS.errors) errors.push(`line ${lineOf(p)}: ${msg}`); };
  const fatal = (msg: string, p = pos): never => { err(msg, p); throw new Fatal(msg); };

  const bytes = new TextEncoder().encode(src).length;
  if (bytes > LIMITS.bytes) return {ok: false, errors: [`markup is ${bytes} bytes (limit ${LIMITS.bytes}); simplify the drawing`]};
  if (isCtl(src)) return {ok: false, errors: ['markup has control characters']};

  type Frame = {node: SvgNode; name: string; at: number};
  const stack: Frame[] = [];
  // in one object: TypeScript would otherwise narrow these to null (they are assigned inside closures)
  const S = {root: null as SvgNode | null, viewBox: null as SvgDoc['viewBox'] | null, rootDone: false};
  let count = 0, depthReported = false;
  const ids = new Set<string>();
  const parts: string[] = [];

  const decode = (chunk: string, at: number): string => {
    let out = '';
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== '&') { out += chunk[i]; continue; }
      const m = ENTITY.exec(chunk.slice(i, i + 8));
      if (!m) { err(`entity "${chunk.slice(i, i + 8).split(/[\s<]/)[0]}" is not allowed; only &amp; &lt; &gt; &quot; &apos; (write the character itself otherwise)`, at); continue; }
      out += ENT_CHAR[m[1]];
      i += m[0].length - 1;
    }
    return out;
  };

  const attrValue = (tag: Tag, name: string, kind: Kind, v: string, parent: string | null, at: number): string | number | Transform[] | null => {
    const bad = (why: string) => { err(`<${tag}> ${name}="${v.length > 40 ? v.slice(0, 40) + '...' : v}" ${why}`, at); return null; };
    switch (kind) {
      case 'num': { const n = num(v); return n === null ? bad('must be a plain number') : n; }
      case 'len': { const n = num(v); return n === null || n < 0 ? bad('must be a plain number, 0 or more') : n; }
      case 'paint': return (PAINTS as readonly string[]).includes(v) ? v : bad(`is not a colour name; use one of: ${PAINTS.join(' ')} (no hex, rgb() or CSS colour names)`);
      case 'width': return v === '2' || v === '4' ? Number(v) : bad('must be 2 or 4');
      case 'font': return (FONT_TOKENS as readonly string[]).includes(v) ? v : bad(`must be one of: ${FONT_TOKENS.join(' ')} (no font-family)`);
      case 'size': return (SIZE_TOKENS as readonly string[]).includes(v) ? v : bad(`must be one of: ${SIZE_TOKENS.join(' ')} (no pixel sizes)`);
      case 'anchor': return (ANCHORS as readonly string[]).includes(v) ? v : bad(`must be one of: ${ANCHORS.join(' ')}`);
      case 'arrow': return (ARROWS as readonly string[]).includes(v) ? v : bad(`must be one of: ${ARROWS.join(' ')}`);
      case 'id': {
        if (parent !== 'svg') return bad('is only allowed on a top-level <g> (a direct child of <svg>); parts are top-level groups');
        if (!ID_RE.test(v)) return bad('must match [A-Za-z0-9_-]+');
        if (ids.has(v)) return bad('is a duplicate id');
        ids.add(v);
        return v;
      }
      case 'points': { const r = parsePoints(v); return typeof r === 'string' ? r : bad(r.error); }
      case 'd': { const e = checkPathData(v); return e ? bad(e) : v.trim().replace(/\s+/g, ' '); }
      case 'transform': { const r = parseTransform(v); return Array.isArray(r) ? r : bad(r.error); }
    }
  };

  const open = (rawTag: string, attrs: [string, string, number][], selfClose: boolean, at: number) => {
    const top = stack[stack.length - 1];
    const known = (TAGS as readonly string[]).includes(rawTag);
    const tag = (known ? rawTag : 'g') as Tag;
    if (++count > LIMITS.elements) fatal(`more than ${LIMITS.elements} elements; simplify the drawing`, at);
    if (!top) {
      if (S.rootDone) fatal('only one <svg> root element is allowed', at);
      if (rawTag !== 'svg') fatal(`the root element must be <svg viewBox="...">, not <${rawTag}>`, at);
    } else if (rawTag === 'svg') err('<svg> is only allowed as the root element (no nesting)', at);
    if (!known) err(`<${rawTag}> is not allowed (allowed: ${TAGS.join(' ')})`, at);
    const node: SvgNode = {tag, attrs: {}, children: []};
    const depth = stack.length + 1;
    if (depth > LIMITS.depth && !depthReported) { depthReported = true; err(`elements are nested ${depth} deep (limit ${LIMITS.depth}); flatten the drawing`, at); }
    if (top) {
      if (top.node.tag === 'text') { if (rawTag !== 'tspan') err(`<${rawTag}> inside <text>: only <tspan> is allowed there`, at); }
      else if (top.node.tag === 'tspan') err(`<${rawTag}> inside <tspan> is not allowed`, at);
      else if (top.node.tag !== 'svg' && top.node.tag !== 'g') err(`<${top.node.tag}> cannot contain <${rawTag}>`, at);
      else if (rawTag === 'tspan' && known) err('<tspan> must be inside <text>', at);
      top.node.children.push(node);
    } else S.root = node;

    if (known) {
      const seen = new Set<string>();
      for (const [name, value, p] of attrs) {
        if (seen.has(name)) { err(`<${tag}> has attribute "${name}" twice`, p); continue; }
        seen.add(name);
        if (name.includes(':')) { err(`<${tag}> attribute "${name}": namespaced attributes (xmlns:*, xlink:*) are not allowed`, p); continue; }
        if (/^on/i.test(name)) { err(`<${tag}> attribute "${name}": event handlers are not allowed`, p); continue; }
        if (/^(href|style|class)$/i.test(name)) { err(`<${tag}> attribute "${name}" is not allowed (no links, CSS or classes; colours and sizes are names, see the attribute list)`, p); continue; }
        const allowed = ALLOWED_ATTRS[tag];
        if (!allowed.includes(name)) { err(`<${tag}> attribute "${name}" is not allowed (allowed: ${allowed.join(' ')})`, p); continue; }
        if (tag === 'svg') {
          if (name === 'xmlns') { if (value !== XMLNS) err(`<svg> xmlns must be "${XMLNS}" or left out`, p); continue; }
          const ns = value.trim().split(/[\s,]+/).map(num);
          if (ns.length !== 4 || ns.some((n) => n === null)) { err('<svg> viewBox must be four numbers: "0 0 1700 560"', p); continue; }
          const [x, y, w, h] = ns as number[];
          const lim = LIMITS;
          if (w < lim.viewBoxMin || w > lim.viewBoxMax || h < lim.viewBoxMin || h > lim.viewBoxMax) { err(`<svg> viewBox width and height must be ${lim.viewBoxMin} to ${lim.viewBoxMax}`, p); continue; }
          S.viewBox = {x, y, w, h};
          continue;
        }
        if (/url\(|[&<]/i.test(value) || value.includes(':')) { err(`<${tag}> ${name}="${value.slice(0, 30)}": values may not contain url(, ":" or "&"`, p); continue; }
        const kind = SPEC[tag][name];
        const r = attrValue(tag, name, kind, value, top ? top.node.tag : null, p);
        if (r === null) continue;
        if (kind === 'transform') node.tf = r as Transform[];
        else node.attrs[name] = r as string | number;
      }
      if (tag === 'svg' && !S.viewBox) err('<svg> needs viewBox="0 0 1700 560" (four numbers); width and height are not allowed', at);
      for (const need of REQUIRED[tag] ?? []) if (!(need in node.attrs)) err(`<${tag}> needs the attribute "${need}"`, at);
      if (tag !== 'svg') applyDefaults(node, at);
    }
    if (!selfClose) stack.push({node, name: rawTag, at});
    else if (!top) S.rootDone = true;
  };

  const applyDefaults = (n: SvgNode, at: number) => {
    const a = n.attrs;
    if (CLOSED.has(n.tag as Tag)) { a.fill ??= 'panel'; a.stroke ??= 'ink'; a['stroke-width'] ??= DEFAULT_STROKE_WIDTH; }
    else if (STROKE_ONLY.has(n.tag as Tag)) { if (n.tag !== 'line') a.fill ??= 'none'; a.stroke ??= 'ink'; a['stroke-width'] ??= DEFAULT_STROKE_WIDTH; if (a.arrow && a.stroke === 'none') err(`<${n.tag}> arrow needs a stroke`, at); }
    else if (n.tag === 'text') { a.fill ??= 'ink'; a.font ??= 'sans'; a.size ??= 'body'; a['text-anchor'] ??= 'start'; a.x ??= 0; a.y ??= 0; }
    else if (n.tag === 'tspan') { /* inherits from <text> */ }
    if (n.tag === 'rect') { a.x ??= 0; a.y ??= 0; }
    if (n.tag === 'circle' || n.tag === 'ellipse') { a.cx ??= 0; a.cy ??= 0; }
  };

  const close = (tag: string, at: number) => {
    const top = stack[stack.length - 1];
    if (!top) fatal(`</${tag}> closes nothing`, at);
    if (top.name !== tag) fatal(`</${tag}> does not match the open <${top.name}> (line ${lineOf(top.at)}); close elements in the order they were opened`, at);
    stack.pop();
    const n = top.node;
    if (n.tag === 'text' || n.tag === 'tspan') {
      const len = textOf(n).replace(/\s+/g, ' ').trim().length;
      if (len > LIMITS.textChars) err(`<${n.tag}> text is ${len} characters (limit ${LIMITS.textChars}); split it into several <text> elements`, top.at);
      if (n.tag === 'text' && !n.children.some((c) => (c.tag === '#text' && c.text?.trim()) || c.tag === 'tspan')) err('<text> is empty', top.at);
      // trim the ends of the whole run
      const first = n.children[0], last = n.children[n.children.length - 1];
      if (first?.tag === '#text') first.text = first.text!.replace(/^\s+/, '');
      if (last?.tag === '#text') last.text = last.text!.replace(/\s+$/, '');
      n.children = n.children.filter((c) => c.tag !== '#text' || c.text);
    }
    if (!stack.length) S.rootDone = true;
  };

  try {
    let i = 0;
    const n = src.length;
    while (i < n) {
      pos = i;
      if (src[i] !== '<') {
        const j = src.indexOf('<', i);
        const end = j < 0 ? n : j;
        const chunk = src.slice(i, end);
        const top = stack[stack.length - 1];
        if (chunk.trim()) {
          if (!top) err(S.root ? 'text after the closing </svg>' : 'text before <svg>', i);
          else if (top.node.tag === 'text' || top.node.tag === 'tspan') {
            const t = decode(chunk, i).replace(/\s+/g, ' ');
            top.node.children.push({tag: '#text', attrs: {}, children: [], text: t});
          } else err(`text "${chunk.trim().slice(0, 20)}" must be inside a <text> element`, i);
        } else if (top && (top.node.tag === 'text' || top.node.tag === 'tspan') && chunk) {
          top.node.children.push({tag: '#text', attrs: {}, children: [], text: ' '});
        }
        i = end;
        continue;
      }
      if (src.startsWith('<!--', i)) fatal('comments are not allowed; remove them');
      if (/^<!\[CDATA\[/i.test(src.slice(i, i + 9))) fatal('CDATA is not allowed; write the text directly');
      if (/^<!DOCTYPE/i.test(src.slice(i, i + 9))) fatal('DOCTYPE is not allowed; start with <svg viewBox="...">');
      if (/^<!ENTITY/i.test(src.slice(i, i + 8))) fatal('ENTITY declarations are not allowed');
      if (src[i + 1] === '!') fatal('<! declarations are not allowed');
      if (src[i + 1] === '?') fatal('processing instructions and the <?xml ...?> declaration are not allowed; start with <svg viewBox="...">');
      if (src[i + 1] === '/') {
        const m = /^<\/([^\s>]*)\s*>/.exec(src.slice(i, i + 80));
        if (!m) fatal('malformed closing tag', i);
        const name = m![1];
        if (name.includes(':')) fatal(`namespaced element </${name}> is not allowed`, i);
        close(name, i);
        i += m![0].length;
        continue;
      }
      const m = /^<([^\s/>]*)/.exec(src.slice(i, i + 80))!;
      const name = m[1];
      if (name.includes(':')) fatal(`namespaced element <${name}> is not allowed (plain SVG only)`, i);
      if (!NAME.test(name)) fatal(`malformed element name "<${name}"`, i);
      let j = i + m[0].length;
      const attrs: [string, string, number][] = [];
      let selfClose = false;
      for (;;) {
        while (j < n && /\s/.test(src[j])) j++;
        if (j >= n) fatal(`<${name}> is never closed with ">"`, i);
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
        const am = /^[^\s=/>"']+/.exec(src.slice(j, j + 80));
        if (!am) fatal(`malformed attribute in <${name}>`, j);
        const an = am![0];
        let k = j + an.length;
        while (k < n && /\s/.test(src[k])) k++;
        if (src[k] !== '=') fatal(`attribute "${an}" in <${name}> has no value (write ${an}="...")`, j);
        k++;
        while (k < n && /\s/.test(src[k])) k++;
        const q = src[k];
        if (q !== '"' && q !== "'") fatal(`attribute "${an}" in <${name}> must be quoted`, j);
        const e = src.indexOf(q, k + 1);
        if (e < 0) fatal(`attribute "${an}" in <${name}> has no closing quote`, j);
        if (!ATTR_NAME.test(an) && !an.includes(':')) fatal(`malformed attribute name "${an}" in <${name}>`, j);
        attrs.push([an, src.slice(k + 1, e), j]);
        j = e + 1;
      }
      open(name, attrs, selfClose, i);
      i = j;
    }
    pos = n;
    if (stack.length) fatal(`<${stack[stack.length - 1].node.tag}> opened on line ${lineOf(stack[stack.length - 1].at)} is never closed`, stack[stack.length - 1].at);
    if (!S.root) fatal('no <svg> element found');
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
  }
  if (errors.length || !S.root || !S.viewBox) return {ok: false, errors: errors.length ? errors : ['no <svg viewBox="..."> element found']};
  const r: SvgNode = S.root;
  for (const c of r.children) if (c.tag === 'g' && typeof c.attrs.id === 'string') parts.push(c.attrs.id);
  return {ok: true, doc: {viewBox: S.viewBox, children: r.children, parts}};
};

// ---- shared helpers over the parsed tree (used by the view, the reveal logic and the tests) ----

/** The leaf drawing elements of a subtree (shapes and text), in document order. */
export const leaves = (n: SvgNode): SvgNode[] => (n.tag === 'g' || n.tag === 'svg' ? n.children.flatMap(leaves) : n.tag === '#text' ? [] : [n]);

/** How a part appears: strokes draw along their length, text fades, anything else pops. */
export type Effect = 'draw' | 'fade' | 'pop';
export const effectOf = (g: SvgNode): Effect => {
  const ls = leaves(g);
  if (!ls.length) return 'fade';
  if (ls.every((l) => l.tag === 'text')) return 'fade';
  if (ls.every((l) => STROKE_ONLY.has(l.tag as Tag) && (l.tag === 'line' || l.attrs.fill === 'none'))) return 'draw';
  return 'pop';
};

/** Words of every text run under a node (for lint). */
export const textOf = (n: SvgNode): string => (n.tag === '#text' ? n.text ?? '' : n.children.map(textOf).join(''));

/** Errors of a tree that did not come from parseSvg (the view re-checks what it got before drawing). */
export const checkTree = (children: SvgNode[]): string[] => {
  const errs: string[] = [];
  let n = 0;
  const walk = (x: SvgNode, depth: number, top: boolean) => {
    if (++n > LIMITS.elements) { if (n === LIMITS.elements + 1) errs.push('too many elements'); return; }
    if (depth > LIMITS.depth) errs.push('too deep');
    if (x.tag === '#text') { if ((x.text?.length ?? 0) > LIMITS.textChars) errs.push('text too long'); return; }
    if (!(TAGS as readonly string[]).includes(x.tag) || x.tag === 'svg') { errs.push(`element ${x.tag}`); return; }
    const spec = SPEC[x.tag as Exclude<Tag, 'svg'>];
    for (const [k, v] of Object.entries(x.attrs)) {
      const kind = Object.prototype.hasOwnProperty.call(spec, k) ? spec[k] : undefined;
      if (!kind) { errs.push(`${x.tag}.${k}`); continue; }
      if (kind === 'paint' && !(PAINTS as readonly string[]).includes(String(v))) errs.push(`${x.tag}.${k}=${v}`);
      if (kind === 'width' && !(STROKE_WIDTHS as readonly number[]).includes(Number(v))) errs.push(`${x.tag}.${k}=${v}`);
      if (kind === 'font' && !(FONT_TOKENS as readonly string[]).includes(String(v))) errs.push(`${x.tag}.${k}=${v}`);
      if (kind === 'size' && !(SIZE_TOKENS as readonly string[]).includes(String(v))) errs.push(`${x.tag}.${k}=${v}`);
      if (kind === 'anchor' && !(ANCHORS as readonly string[]).includes(String(v))) errs.push(`${x.tag}.${k}=${v}`);
      if (kind === 'arrow' && !(ARROWS as readonly string[]).includes(String(v))) errs.push(`${x.tag}.${k}=${v}`);
      if ((kind === 'num' || kind === 'len') && !(typeof v === 'number' && Number.isFinite(v))) errs.push(`${x.tag}.${k}`);
      if (kind === 'd' && (typeof v !== 'string' || checkPathData(v))) errs.push(`${x.tag}.d`);
      if (kind === 'points' && (typeof v !== 'string' || typeof parsePoints(v) !== 'string')) errs.push(`${x.tag}.points`);
      if (kind === 'id' && (!top || typeof v !== 'string' || !ID_RE.test(v))) errs.push(`${x.tag}.id`);
    }
    for (const t of x.tf ?? []) if (!['translate', 'scale', 'rotate'].includes(t.fn) || !t.args.every(Number.isFinite)) errs.push(`${x.tag} transform`);
    x.children.forEach((c) => walk(c, depth + 1, false));
  };
  children.forEach((c) => walk(c, 2, true));
  return errs.slice(0, LIMITS.errors);
};
