// Матлист — чтение двумерных графиков из .xmcd Mathcad 14/15.
// Mathcad хранит график как сжатый gzip двоичный объект (сериализация MFC): дерево выражений осей
// (пределы, маркеры, списки выражений X и Y), формат осей (лог. шкала, сетка, цвет сетки) и формат
// кривых (тип, линия, цвет, символ, толщины, подпись в легенде). Формат разобран по настоящим файлам
// и проверен в Mathcad: каждое поле меняли в копии графика и смотрели, что нарисует Mathcad.
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.MatEngine;

// ───── inflate (RFC 1951) ─────
function inflateRaw(src, start) {
  let pos = start || 0, bit = 0, bitcnt = 0; const out = [];
  const need = n => { while (bitcnt < n) { if (pos >= src.length) throw new Error('конец данных'); bit |= src[pos++] << bitcnt; bitcnt += 8; } };
  const bits = n => { need(n); const v = bit & ((1 << n) - 1); bit >>>= n; bitcnt -= n; return v; };
  function build(lengths) { // канонический код Хаффмана: { counts, symbols }
    const counts = new Uint16Array(16), offs = new Uint16Array(16), symbols = new Uint16Array(lengths.length);
    for (const l of lengths) counts[l]++; counts[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    lengths.forEach((l, s) => { if (l) symbols[offs[l]++] = s; });
    return { counts, symbols };
  }
  function decode(h) {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) { code |= bits(1); const c = h.counts[len]; if (code - c < first) return h.symbols[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; }
    throw new Error('неверный код');
  }
  const LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  let fixedL = null, fixedD = null;
  for (;;) {
    const last = bits(1), type = bits(2);
    if (type === 0) {
      bit = 0; bitcnt = 0; const len = src[pos] | (src[pos + 1] << 8); pos += 4;
      for (let i = 0; i < len; i++) out.push(src[pos++]);
    } else {
      let lh, dh;
      if (type === 1) {
        if (!fixedL) { const l = new Array(288); for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8; fixedL = build(l); fixedD = build(new Array(30).fill(5)); }
        lh = fixedL; dh = fixedD;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const ORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]; const cl = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) cl[ORD[i]] = bits(3);
        const ch = build(cl); const lens = [];
        while (lens.length < hlit + hdist) {
          const sym = decode(ch);
          if (sym < 16) lens.push(sym);
          else if (sym === 16) { const p = lens[lens.length - 1]; for (let k = 3 + bits(2); k > 0; k--) lens.push(p); }
          else if (sym === 17) { for (let k = 3 + bits(3); k > 0; k--) lens.push(0); }
          else { for (let k = 11 + bits(7); k > 0; k--) lens.push(0); }
        }
        lh = build(lens.slice(0, hlit)); dh = build(lens.slice(hlit));
      } else throw new Error('неверный блок');
      for (;;) {
        const sym = decode(lh);
        if (sym < 256) out.push(sym);
        else if (sym === 256) break;
        else { const i = sym - 257; const len = LB[i] + bits(LE[i]); const ds = decode(dh); const dist = DB[ds] + bits(DE[ds]); for (let k = 0; k < len; k++) out.push(out[out.length - dist]); }
      }
    }
    if (last) break;
  }
  return Uint8Array.from(out);
}
function gunzip(b) {
  if (b[0] !== 0x1f || b[1] !== 0x8b) throw new Error('не gzip');
  const flg = b[3]; let p = 10;
  if (flg & 4) p += 2 + (b[p] | (b[p + 1] << 8));
  if (flg & 8) { while (b[p++]); }
  if (flg & 16) { while (b[p++]); }
  if (flg & 2) p += 2;
  return inflateRaw(b, p);
}
function b64bytes(s) {
  s = s.replace(/\s+/g, '');
  if (typeof atob === 'function') { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return Uint8Array.from(Buffer.from(s, 'base64'));
}
const find = (d, str, from) => { const t = [...str].map(c => c.charCodeAt(0)); outer: for (let i = from || 0; i <= d.length - t.length; i++) { for (let k = 0; k < t.length; k++) if (d[i + k] !== t[k]) continue outer; return i; } return -1; };
const findBytes = (d, t, from) => { outer: for (let i = from || 0; i <= d.length - t.length; i++) { for (let k = 0; k < t.length; k++) if (d[i + k] !== t[k]) continue outer; return i; } return -1; };
const u16 = (d, p, n) => { let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(d[p + 2 * k] | (d[p + 2 * k + 1] << 8)); return s; };

// ───── дерево выражений ─────
// узел: [id] 0x32 [код операции, 2 байта] 00 00 [флаги] [родитель] … ; id растут на 1; объект-аннотация
// (provenance) занимает номер, но записан иначе — его пропускаем, ища следующий узел.
function readTree(d) {
  const t = find(d, 'tree'); if (t < 0) throw new Error('нет дерева выражений');
  const end = find(d, 'd2_graph_format', t); const lim = end > 0 ? end : d.length;
  const offs = []; let j = t + 4, nid = -1;
  const isNode = (i, id) => d[i + 1] === 0x32 && (id < 0 || d[i] === id) && d[i + 4] === 0 && d[i + 5] === 0 && (d[i + 6] & 0xc0);
  while (j < lim - 8) {
    if (isNode(j, nid)) { offs.push(j); nid = (d[j] + 1) & 0xff; j += 8; continue; }
    j++;
    if (nid >= 0 && j - offs[offs.length - 1] > 300) { // пропуск аннотации: ищем любой следующий узел дальше
      let k = j, found = -1;
      for (; k < lim - 8; k++) { if (d[k + 1] === 0x32 && d[k + 4] === 0 && d[k + 5] === 0 && (d[k + 6] & 0xc0) && ((d[k] - nid) & 0xff) < 8) { found = k; break; } }
      if (found < 0) break; j = found; nid = d[found];
    }
  }
  const nodes = offs.map((o, k) => ({ id: d[o], op: d[o + 2] | (d[o + 3] << 8), fl: d[o + 6], par: d[o + 7], off: o, end: k + 1 < offs.length ? offs[k + 1] : lim }));
  const by = new Map(); nodes.forEach(n => { by.set(n.id, n); n.kids = []; });
  nodes.forEach(n => { const p = by.get(n.par); if (p && p !== n) p.kids.push(n); });
  for (const n of nodes) {
    if (n.op === 0x0f02) { // лист: число или имя
      const p = n.off + 8;
      if (n.fl & 0x10) { const L = d[p + 4]; n.num = u16(d, p + 5, L); } else { const L = d[p + 3]; n.name = u16(d, p + 4, L); }
    }
  }
  const rootN = nodes.find(n => n.op === 0xc119);
  return { nodes, root: rootN };
}
class Unknown extends Error {}
const OPN = { 0xc789: '+', 0xca06: '·', 0xfb07: '/' };
// имя Mathcad «W.a» → имя Матлиста «W_a»; «F.» — пустой индекс
function nameOf(s, ctx) {
  const dot = s.indexOf('.');
  if (dot < 0) { const o = { type: 'id', name: s }; if (E.UNITS && E.UNITS.has(s)) o.u = true; return o; }
  const base = s.slice(0, dot), sub = s.slice(dot + 1);
  if (sub === '') return { type: 'id', name: ctx && ctx.collide && ctx.collide.has(base) ? base + '_' : base };
  return { type: 'id', name: base + '_' + sub };
}
function listOf(n) { if (!n) return []; if (n.op === 0xc30a) return n.kids.flatMap(listOf); return [n]; }
function ast(n, ctx) {
  if (!n) throw new Unknown('пусто');
  switch (n.op) {
    case 0x0f02: {
      if (n.num != null) { const s = n.num; if (/[ij]$/.test(s)) return { type: 'imag', v: parseFloat(s) || 1 }; const v = parseFloat(s); if (!isFinite(v)) throw new Unknown('число ' + s); return { type: 'num', v }; }
      return nameOf(n.name || '', ctx);
    }
    case 0x0f00: return null;
    case 0x4013: case 0x70e5: return ast(n.kids[0], ctx);
    case 0x708e: case 0x608e: return { type: 'paren', e: ast(n.kids[0], ctx) };
    case 0x4b95: return { type: 'neg', e: ast(n.kids[0], ctx) };
    case 0x7b9a: return { type: 'sqrt', e: ast(n.kids[0], ctx) };
    case 0x7b9d: return { type: 'abs', e: ast(n.kids[0], ctx) };
    case 0xcc05: case 0xfc05: return { type: 'pow', b: ast(n.kids[0], ctx), e: ast(n.kids[1], ctx) };
    case 0xfd04: { const e = ast(n.kids[0], ctx); const ix = listOf(n.kids[1]).map(k => ast(k, ctx)); return { type: 'sub', e, raw: ix.length === 1 && ix[0].type === 'id' ? ix[0].name : '', ix }; }
    case 0xce12: {
      const f = n.kids[0], a = n.kids[1];
      if (!f || f.op !== 0x0f02 || !f.name) throw new Unknown('вызов');
      const fn = nameOf(f.name, ctx).name; const args = a && (a.op === 0x708e || a.op === 0x608e) ? listOf(a.kids[0]).map(k => ast(k, ctx)) : listOf(a).map(k => ast(k, ctx));
      return { type: 'call', f: fn, args };
    }
    case 0xf924: { const v = ast(n.kids[0], ctx); if (v.type !== 'id') throw new Unknown('производная'); return { type: 'deriv', v: v.name, order: 1, e: ast(n.kids[1], ctx) }; }
  }
  if (OPN[n.op]) {
    const l = ast(n.kids[0], ctx), r = ast(n.kids[1], ctx);
    if (n.op === 0xfb07) return { type: 'bin', op: '/', l, r, frac: true };
    return { type: 'bin', op: OPN[n.op], l, r };
  }
  throw new Unknown('операция 0x' + n.op.toString(16));
}
const kid = (n, k) => (n && n.kids[k]) || null;
function limitVal(n, ctx) { // предел оси: число; флаг 0x02 — Mathcad подставил его сам (автомасштаб)
  if (!n || n.op === 0x0f00) return undefined;
  if (n.fl & 0x02) return undefined;
  try { const a = ast(n, ctx); const v = E.evalNode(a, new E.Env(), new E.Ctx(new E.Env())); const x = E.toNum(v); return isFinite(x) ? x : undefined; } catch (e) { return undefined; }
}
function markVals(n, ctx) { return [kid(n, 0), kid(n, 1)].map(m => { if (!m || m.op === 0x0f00) return null; try { return E.toNum(E.evalNode(ast(m, ctx), new E.Env(), new E.Ctx(new E.Env()))); } catch (e) { return null; } }).filter(v => v != null && isFinite(v)); }

// ───── формат осей и кривых ─────
function readAxes(d) {
  const a = find(d, 'axisFormat'); if (a < 0) return [];
  const out = []; let p = findBytes(d, [0x1c, 0, 0, 0], a + 10); if (p < 0) return [];
  p += 4;
  for (let k = 0; k < 3 && p + 20 < d.length; k++) {
    const f = d[p];
    out.push({ log: !!(f & 1), grid: !!(f & 2), numbered: !!(f & 4), auto: !!(f & 8), gridColor: 'rgb(' + d[p + 14] + ',' + d[p + 15] + ',' + d[p + 16] + ')' });
    p += 21; if (d[p] !== 0x1c) break; p += 1;
  }
  return out;
}
const SYMS = [null, 'x', '+', 'box', 'dmnd', 'o', 'tri', 'fbox', 'fdmnd', 'fo', 'ftri'];
const TYPES = ['lines', 'points', 'error', 'bar', 'step', 'lines', 'stem', 'bar'];
const DASH = ['none', 'solid', 'dot', 'dash', 'dadot'];
function readTraces(d) {
  const t = find(d, 'trace2D'); if (t < 0) return [];
  let p = findBytes(d, [0x1f, 0x01, 0x10, 0x00, 0x01], t); if (p < 0) return [];
  p += 5; const out = [];
  for (let k = 0; k < 16 && d[p] === 0x1b; k++) {
    const ls = d[p + 1], col = '#' + [d[p + 2], d[p + 3], d[p + 4]].map(x => x.toString(16).padStart(2, '0')).join(''), mask = d[p + 5]; p += 6;
    const tr = { dash: DASH[ls] || 'solid', color: col, sym: null, type: 'lines', lw: 1, sw: 1 };
    // поля, чьи биты в маске сброшены, записаны по порядку битов: 0 — символ, 1 — тип, 2 — толщина линии, 3 — размер символа, 4 — подпись
    if (!(mask & 1)) tr.sym = SYMS[d[p++]] || null;
    if (!(mask & 2)) tr.type = TYPES[d[p++]] || 'lines';
    if (!(mask & 4)) tr.lw = d[p++] || 1;
    if (!(mask & 8)) tr.sw = d[p++] || 1;
    if (!(mask & 16)) { const L = d[p++]; tr.name = u16(d, p, L); p += 2 * L; }
    p += 3; out.push(tr);
  }
  return out;
}

// главное: двоичный объект графика (base64 gzip) → описание графика Матлиста
function decodePlot(b64, ctx) {
  const d = gunzip(b64bytes(b64));
  if (find(d, 'd2_graph_format') < 0) throw new Unknown('это не XY-график (полярный или 3D)');
  const { root } = readTree(d); if (!root) throw new Unknown('нет графика');
  const L = root.kids[0], R = root.kids[1]; // Y и X
  const yA = kid(L, 0), yC = kid(yA, 0), xA = R && R.op === 0xc19f && R.kids.length === 2 ? R : null, xC = kid(xA, 0);
  const yl = kid(yC, 0), ym = kid(yC, 1), xl = kid(xC, 0), xm = kid(xC, 1);
  const ys = listOf(kid(yA, 1)).map(n => ast(n, ctx)), xs = listOf(kid(xA, 1)).map(n => ast(n, ctx));
  if (!ys.length || !xs.length || ys.some(v => !v) || xs.some(v => !v)) throw new Unknown('пустые оси');
  const res = { ys, xs, ymax: limitVal(kid(yl, 0), ctx), ymin: limitVal(kid(yl, 1), ctx), xmax: limitVal(kid(xl, 0), ctx), xmin: limitVal(kid(xl, 1), ctx), ymarks: markVals(ym, ctx), xmarks: markVals(xm, ctx) };
  res.axes = readAxes(d); res.traces = readTraces(d);
  return res;
}
// описание → регион-график Матлиста (r.ys / r.xs — LaTeX, как при ручном вводе)
function toRegion(p) {
  const r = { kind: 'plot', ys: p.ys.map(E.toTex).join(','), xs: p.xs.map(E.toTex).join(','), xmin: p.xmin, xmax: p.xmax, ymin: p.ymin, ymax: p.ymax };
  const ax = p.axes[0] || {}, ay = p.axes[1] || {};
  r.logx = !!ax.log; r.logy = !!ay.log; r.grid = !!(ax.grid || ay.grid); if (r.grid) r.gridColor = ax.grid ? ax.gridColor : ay.gridColor;
  r.mcStyle = true; // рамка и подписи как в Mathcad
  if (p.xmarks.length) r.xmarks = p.xmarks; if (p.ymarks.length) r.ymarks = p.ymarks;
  r.st = p.ys.map((_, k) => { const t = p.traces[k] || {}; const st = { color: t.color, width: Math.max(1, t.lw || 1), dash: t.dash, sym: t.sym, sw: t.sw, type: t.type }; if (t.name) st.name = t.name; return st; });
  if (r.st.some(s => s.name)) r.legend = true;
  return r;
}
const api = { gunzip, inflateRaw, b64bytes, decodePlot, toRegion, Unknown, readTree };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatMcPlot = api;
})(typeof self !== 'undefined' ? self : this);
