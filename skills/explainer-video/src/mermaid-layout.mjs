// Layered layout of a rendered mermaid diagram, for scenes that animate it (`build`, `focus`). Used by mermaid-render.mjs.
//
// The diagram is cut into parts (a node, an edge, a gantt bar, a pie slice, a message ...). Each part becomes its own
// SVG file: mermaid's SVG with everything but that part hidden (`visibility`), same viewBox, so the renderer stacks them
// as <Img> layers and animates each layer on the frame clock. What belongs to no part (axes, titles, grid) is the base
// layer. The look is exactly mermaid's, and the SVG is never inlined into the Remotion page.
//
// The layout JSON describes the parts: name and label (for narration matching and focus), how the part animates, when
// it appears (its own narration slot, or `with`/`after` other parts), its box, and for drawn lines the path.

/**
 * Runs inside the render page (serialized with toString: no closure over module scope). `svgText` is mermaid's output
 * for `src`; mermaid's own temporary copy must already be gone (ids would clash). Returns {layout, layers} or null.
 */
export async function readLayout(src, svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const live = document.importNode(doc.documentElement, true);
  document.body.appendChild(live);
  try {
    const svgId = live.getAttribute('id');
    const role = live.getAttribute('aria-roledescription') || '';
    const rootInv = live.getScreenCTM().inverse();
    const toSvg = (el) => rootInv.multiply(el.getScreenCTM());
    const boxOf = (els) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of els) {
        if (!el.getBBox) continue;
        const b = el.getBBox(), m = toSvg(el);
        if (!b.width && !b.height) continue;
        for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
          const px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
          x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
        }
      }
      return x0 === Infinity ? null : {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
    };
    // path of a line or path element in the SVG's user units, if it is only translated (else null: the part fades)
    const lineOf = (el) => {
      const m = toSvg(el);
      if (Math.abs(m.a - 1) > 1e-6 || Math.abs(m.d - 1) > 1e-6 || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return null;
      let d;
      if (el.tagName === 'path') d = el.getAttribute('d');
      else if (el.tagName === 'line') d = ['x1', 'y1', 'x2', 'y2'].map((k) => Number(el.getAttribute(k)) || 0).reduce((s, v, i) => s + (i === 0 ? 'M' : i === 2 ? 'L' : ',') + v, '');
      return d ? {d, dx: m.e, dy: m.f} : null;
    };
    const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
    const esc = (s) => String(s).replace(/["\\]/g, '\\$&');

    // parts: {name, label, anim: pop|draw|wipe|fade, slot?, from?, to?, with?: [names], after?: [names], els: [elements], line?}
    const parts = [];
    const MAX = 80;   // same cap as sanitizeLayout: give up before building (and serializing) layers for a huge diagram
    const seen = new Map();
    const add = (p) => {
      if (parts.length >= MAX) throw new Error('too many parts');
      if (!p.els.filter(Boolean).length) return;
      // two lines between the same ends (A-->|yes|B, A-->|no|B) get distinct names; focus matches lines by their ends
      const n = seen.get(p.name) || 0;
      seen.set(p.name, n + 1);
      // a slot needs a label to match the narration against
      parts.push({...p, name: n ? `${p.name}#${n}` : p.name, slot: !!p.slot && !!p.label, els: p.els.filter(Boolean)});
    };

    const kind = role;
    if (['flowchart-v2', 'stateDiagram', 'er', 'classDiagram', 'mindmap'].includes(kind) || live.querySelector('g.root, g.edgePaths')) {
      const diag = await window.mermaid.mermaidAPI.getDiagramFromText(src);
      if (typeof diag.db.getData !== 'function') return null;
      const data = diag.db.getData();
      const find = (n) =>
        (n.domId && live.querySelector(`[id="${esc(svgId + '-' + n.domId)}"]`)) ||
        live.querySelector(`[id="${esc(svgId + '-' + n.id)}"]`) ||
        live.querySelector(`[data-id="${esc(n.id)}"]:not(path):not(.label)`) ||
        // domId can be stale (re-parsing bumps mermaid's counter): match the id with any trailing counter
        [...live.querySelectorAll('g.node, g.cluster')].find((g) => new RegExp(`(^|-)${n.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?$`).test(g.getAttribute('id') || ''));
      for (const n of data.nodes) {
        const el = find(n);
        if (!el) return null;
        const isMark = n.shape === 'stateStart' || n.shape === 'stateEnd';
        const label = isMark ? '' : text(el.querySelector('.cluster-label, .label, .nodeLabel, text')) || String(n.label || n.id);
        // composite/subgraph: under everything, appears with its first member
        if (n.isGroup) add({name: n.id, label, anim: 'fade', group: true, slot: true, els: [el]});
        else add({name: n.id, label, anim: 'pop', slot: !isMark, els: [el], parent: n.parentId || undefined});
      }
      for (const e of data.edges) {
        const p = live.querySelector(`path[data-id="${esc(e.id)}"]`);
        if (!p) return null;
        add({name: `${e.start}->${e.end}`, label: '', anim: 'draw', from: e.start, to: e.end, after: [e.start, e.end], els: [p], line: lineOf(p)});
        const lineName = parts[parts.length - 1].name;
        const lab = live.querySelector(`.edgeLabel .label[data-id="${esc(e.id)}"]`);
        const labText = text(lab);
        if (lab && labText) add({name: `${lineName}:label`, label: labText, anim: 'fade', after: [lineName], edgeLabel: true, els: [lab.closest('.edgeLabel') || lab]});
      }
      // start/end markers come with what they link to; groups with their first member
      for (const p of parts) {
        if (p.anim === 'pop' && !p.slot) p.with = data.edges.flatMap((e) => (e.start === p.name ? [e.end] : e.end === p.name ? [e.start] : []));
        if (p.group) p.with = data.nodes.filter((n) => n.parentId === p.name).map((n) => n.id);
      }
    } else if (kind === 'sequence') {
      const people = [...live.querySelectorAll('g[data-et="participant"]')];
      for (const g of people) {
        const id = g.getAttribute('data-id');
        const life = live.querySelector(`line[data-et="life-line"][data-id="${esc(id)}"]`);
        const bottoms = [...live.querySelectorAll(`rect.actor-bottom[name="${esc(id)}"]`)].map((r) => r.parentNode);
        add({name: id, label: text(g), anim: 'pop', els: [g, life, ...bottoms]});
      }
      const msgs = [...live.querySelectorAll('[data-et="message"]')];
      msgs.forEach((m, i) => {
        const from = m.getAttribute('data-from'), to = m.getAttribute('data-to');
        let t = m.previousElementSibling;
        while (t && !(t.classList && t.classList.contains('messageText'))) t = t.previousElementSibling;
        add({name: `${from}->${to}#${i}`, label: text(t), anim: 'draw', slot: true, from, to, els: [m, t], line: lineOf(m)});
      });
      for (const n of live.querySelectorAll('g[data-et="note"]')) add({name: n.getAttribute('data-id'), label: text(n), anim: 'pop', slot: true, els: [n]});
      for (const c of live.querySelectorAll('g[data-et="control-structure"]')) add({name: c.getAttribute('data-id'), label: text(c.querySelector('.labelText')), anim: 'fade', block: true, els: [c]});
      // participants appear with their first message (or note); a block (alt, loop) with the first message inside it
      const boxes = new Map(parts.map((p) => [p, boxOf(p.els)]));
      for (const p of parts) {
        if (people.some((g) => g.getAttribute('data-id') === p.name)) {
          const first = parts.find((q) => q.slot && (q.from === p.name || q.to === p.name));
          p.with = first ? [first.name] : [];
        }
        if (p.block) {
          const b = boxes.get(p);
          const inside = parts.filter((q) => q.slot && q.anim === 'draw' && b && boxes.get(q) && boxes.get(q).y >= b.y && boxes.get(q).y <= b.y + b.h);
          p.with = inside.length ? [inside[0].name] : [];
        }
      }
    } else if (kind === 'gantt') {
      const tasks = [...live.querySelectorAll('rect.task[id]')].sort((a, b) => Number(a.getAttribute('x')) - Number(b.getAttribute('x')));
      for (const r of tasks) {
        const t = live.querySelector(`[id="${esc(r.getAttribute('id') + '-text')}"]`);
        add({name: r.getAttribute('id').replace(svgId + '-', ''), label: text(t), anim: 'wipe', slot: true, els: [r, t]});
      }
    } else if (kind === 'timeline') {
      let lastPeriod = null;
      for (const g of live.querySelectorAll('g.taskWrapper > g.timeline-node, g.eventWrapper > g.timeline-node, g.lineWrapper > line')) {
        if (g.tagName === 'line') {
          // the dashed connector below a period belongs to it; the long axis stays in the base layer
          if (lastPeriod && g.getAttribute('x1') === g.getAttribute('x2')) lastPeriod.els.push(g);
          continue;
        }
        if (parts.length >= MAX) throw new Error('too many parts');
        const p = {name: `n${parts.length}`, label: text(g), anim: 'pop', slot: !!text(g), els: [g]};
        if (g.parentNode.classList.contains('taskWrapper')) lastPeriod = p;
        parts.push(p);
      }
    } else if (kind === 'journey') {
      live.querySelectorAll('line.task-line').forEach((l) => {
        const g = l.parentNode;
        add({name: `t${parts.length}`, label: text(g.querySelector('text.task')), anim: 'pop', slot: true, els: [g]});
      });
    } else if (kind === 'pie') {
      const slices = [...live.querySelectorAll('path.pieCircle')], texts = [...live.querySelectorAll('text.slice')], legends = [...live.querySelectorAll('g.legend')];
      slices.forEach((s, i) => add({name: `s${i}`, label: text(legends[i]), anim: 'pop', slot: true, pie: true, els: [s, texts[i], legends[i]]}));
    } else {
      return null;
    }
    if (!parts.length) return null;

    // one SVG per part, and a base with every part hidden. Markers live in <defs>: keep those visible.
    parts.forEach((p, i) => p.els.forEach((el) => el.setAttribute('data-layer', String(i))));
    const ser = new XMLSerializer();
    const layer = (i) => {
      const c = live.cloneNode(true);
      c.style.visibility = i === null ? 'visible' : 'hidden';
      c.querySelectorAll('defs').forEach((d) => (d.style.visibility = 'visible'));
      c.querySelectorAll('[data-layer]').forEach((el) => {
        el.style.visibility = i !== null && el.getAttribute('data-layer') === String(i) ? 'visible' : 'hidden';
        el.removeAttribute('data-layer');
      });
      return ser.serializeToString(c);
    };
    const pieCenter = kind === 'pie' ? boxOf([live.querySelector('circle.pieOuterCircle')]) : null;
    const out = parts.map((p, i) => {
      const box = boxOf(p.els) || {x: 0, y: 0, w: 0, h: 0};
      const o = pieCenter ? {ox: pieCenter.x + pieCenter.w / 2, oy: pieCenter.y + pieCenter.h / 2} : {};
      return {name: p.name, label: p.label, anim: p.anim, slot: !!p.slot, file: `p${i}.svg`, ...box, ...o,
        ...(p.from ? {from: p.from, to: p.to} : {}), ...(p.with ? {with: p.with} : {}), ...(p.after ? {after: p.after} : {}),
        ...(p.parent ? {parent: p.parent} : {}), ...(p.line ? p.line : {})};
    });
    const vb = live.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    return {layout: {vb, parts: out}, layers: [layer(null), ...parts.map((_, i) => layer(i))]};
  } finally {
    live.remove();
  }
}

// ---- sanitizing (Node side): the layout is built from untrusted input. Keep only the shape it is meant to have;
// anything else -> null (the scene shows the static SVG). Keep in step with MermaidLayout in schema.ts.
const MAX_PARTS = 80;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : NaN);
const str = (x, max = 200) => (typeof x === 'string' && x.length <= max ? x : null);
export const PATH_RE = /^[MLCQSTHVAZmlcqsthvaz0-9.,\s+\-eE]{1,20000}$/;
const ANIMS = ['pop', 'draw', 'wipe', 'fade'];

export function sanitizeLayout(l) {
  if (!l || !Array.isArray(l.vb) || l.vb.length !== 4 || !Array.isArray(l.parts) || !l.parts.length || l.parts.length > MAX_PARTS) return null;
  const vb = l.vb.map(num);
  if (vb.some(Number.isNaN) || vb[2] <= 0 || vb[3] <= 0) return null;
  const parts = [];
  for (const [i, p] of l.parts.entries()) {
    const name = str(p.name, 160), label = str(p.label);
    const box = {x: num(p.x), y: num(p.y), w: num(p.w), h: num(p.h)};
    if (name === null || label === null || !ANIMS.includes(p.anim) || p.file !== `p${i}.svg`) return null;
    if (Object.values(box).some(Number.isNaN) || box.w < 0 || box.h < 0) return null;
    const q = {name, label, anim: p.anim, slot: p.slot === true, file: p.file, ...box};
    for (const k of ['from', 'to', 'parent']) if (p[k] !== undefined) { const v = str(p[k], 160); if (v === null) return null; q[k] = v; }
    for (const k of ['with', 'after']) if (p[k] !== undefined) {
      if (!Array.isArray(p[k]) || p[k].length > MAX_PARTS || p[k].some((v) => str(v, 160) === null)) return null;
      q[k] = p[k];
    }
    for (const k of ['ox', 'oy']) if (p[k] !== undefined) { const v = num(p[k]); if (Number.isNaN(v)) return null; q[k] = v; }
    if (p.d !== undefined) {
      const dx = num(p.dx), dy = num(p.dy);
      if (typeof p.d !== 'string' || !PATH_RE.test(p.d) || Number.isNaN(dx) || Number.isNaN(dy)) return null;
      Object.assign(q, {d: p.d, dx, dy});
    }
    parts.push(q);
  }
  const names = new Set(parts.map((p) => p.name));
  if (names.size !== parts.length) return null;
  // references must point at parts (edge ends may be unnamed markers, which are parts too)
  for (const p of parts) for (const r of [...(p.with || []), ...(p.after || [])]) if (!names.has(r)) return null;
  return {vb, parts};
}
