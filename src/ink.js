// Матлист — рукописный ввод формул. Модель CoMER (Des-fee/calculator, дообучена на MathWriting), ONNX Runtime Web.
// Штрихи → картинка как в обучающей выборке CROHME (белые линии на чёрном, высота знака ~45 пикс.) → энкодер →
// лучевой поиск по декодеру → токены LaTeX. Геометрия штрихов поправляет спорные места: степень, точки, дроби, «=» в конце
// (порт Recognizer.kt / InkGeometry.kt из Des-fee/calculator).
(function (root) {
'use strict';
const SOS = 1, EOS = 2;
class Stroke {
  constructor() { this.xs = []; this.ys = []; this.l = Infinity; this.t = Infinity; this.r = -Infinity; this.b = -Infinity; }
  add(x, y) { this.xs.push(x); this.ys.push(y); if (x < this.l) this.l = x; if (x > this.r) this.r = x; if (y < this.t) this.t = y; if (y > this.b) this.b = y; }
  get w() { return this.r - this.l; } get h() { return this.b - this.t; } get cx() { return (this.l + this.r) / 2; } get cy() { return (this.t + this.b) / 2; } get n() { return this.xs.length; }
}
function bounds(strokes) { const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }; for (const s of strokes) { b.l = Math.min(b.l, s.l); b.t = Math.min(b.t, s.t); b.r = Math.max(b.r, s.r); b.b = Math.max(b.b, s.b); } b.w = b.r - b.l; b.h = b.b - b.t; return b; }
// типичная высота знака: «символьные» штрихи; плоские (минус, черта дроби) и точки не считаются
function typicalHeight(strokes) {
  const hs = strokes.filter(s => s.h > s.w * 0.35 && s.h > 4).map(s => s.h).sort((a, b) => a - b);
  if (!hs.length) { const all = strokes.map(s => Math.max(s.h, s.w * 0.5)).sort((a, b) => a - b); return Math.max(all[all.length >> 1] || 8, 8); }
  return Math.max(hs[hs.length >> 1], 8);
}

// ───── геометрия строки ─────
const DOT_TOKENS = new Set(['.', '\\cdot']);
function geometry(strokes) {
  const h = typicalHeight(strokes);
  const isDot = s => s.w < 0.28 * h && s.h < 0.28 * h, isBar = s => s.w > 2.5 * s.h && s.w > 0.5 * h;
  const bars = strokes.filter(isBar).filter(bar => { const inR = strokes.filter(o => o !== bar && !isBar(o) && o.cx > bar.l && o.cx < bar.r); return inR.some(o => o.b < bar.t + 0.1 * h) && inR.some(o => o.t > bar.b - 0.1 * h); });
  const overBar = s => bars.some(b => s !== b && s.cx > b.l && s.cx < b.r);
  const body = strokes.filter(s => !isDot(s) && !isBar(s) && s.h > 0.5 * h && !overBar(s));
  const ref = body.length ? body : (strokes.filter(s => !isDot(s)).length ? strokes.filter(s => !isDot(s)) : strokes);
  const tops = ref.map(s => s.t).sort((a, b) => a - b), bots = ref.map(s => s.b).sort((a, b) => a - b);
  const top = tops[tops.length >> 1], bottom = bots[bots.length >> 1], mid = (top + bottom) / 2;
  const raised = strokes.some(s => !isDot(s) && !overBar(s) && s.h > 0.3 * h && s.h < 0.8 * (bottom - top) && s.b < mid - 0.15 * h && s.t < top + 0.1 * h);
  const attached = d => strokes.some(o => o !== d && !isDot(o) && d.cx > o.l - 0.1 * h && d.cx < o.r + 0.1 * h && ((o.t > d.b && o.t - d.b < 0.6 * h) || (o.b < d.t && d.t - o.b < 0.6 * h)));
  const dots = strokes.filter(s => isDot(s) && !overBar(s) && !attached(s)).sort((a, b) => a.cx - b.cx).map(s => s.cy < bottom - 0.22 * (bottom - top));
  return { raised, dots, fractionBars: bars.length };
}
function penalty(toks, g) {
  let p = 0; if (g.raised !== toks.includes('^')) p += 2;
  p += Math.abs(toks.filter(t => t === '\\frac').length - g.fractionBars) * 2;
  p += Math.abs(toks.filter(t => DOT_TOKENS.has(t)).length - g.dots.length); return p;
}
function fixDots(toks, g) { const idx = toks.map((t, i) => DOT_TOKENS.has(t) ? i : -1).filter(i => i >= 0); if (!idx.length || idx.length !== g.dots.length) return toks; const o = toks.slice(); idx.forEach((i, k) => { o[i] = g.dots[k] ? '\\cdot' : '.'; }); return o; }
function trailingEquals(strokes) { // два штриха «=» в самом конце строки
  if (strokes.length < 3) return null; const h = typicalHeight(strokes);
  const byX = strokes.slice().sort((a, b) => b.cx - a.cx); const a = byX[0], b = byX[1];
  const bar = s => s.w > 2.2 * Math.max(s.h, 1) && s.w > 0.3 * h && s.w < 2.5 * h;
  if (!bar(a) || !bar(b)) return null;
  if (Math.min(a.r, b.r) - Math.max(a.l, b.l) < 0.55 * Math.min(a.w, b.w)) return null;
  const gap = Math.abs(a.cy - b.cy); if (gap < 0.12 * h || gap > 0.9 * h) return null;
  const left = Math.min(a.l, b.l), w = Math.min(a.w, b.w);
  if (strokes.some(s => s !== a && s !== b && s.r > left + 0.25 * w)) return null;
  return [a, b];
}

// ───── картинка для модели ─────
function render(strokes) {
  const target = 45, margin = 11, b = bounds(strokes), ch = typicalHeight(strokes);
  let scale = target / ch;
  scale = Math.min(scale, (256 - 2 * margin) / Math.max(b.h, 1), (1024 - 2 * margin) / Math.max(b.w, 1));
  const w = Math.max(16, Math.ceil(b.w * scale + 2 * margin)), h = Math.max(16, Math.ceil(b.h * scale + 2 * margin));
  const cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 3.6; g.lineCap = 'round'; g.lineJoin = 'round';
  const ox = margin - b.l * scale, oy = margin - b.t * scale;
  for (const s of strokes) {
    if (s.n === 1 || (s.w * scale < 1.5 && s.h * scale < 1.5)) { g.beginPath(); g.arc(s.xs[0] * scale + ox, s.ys[0] * scale + oy, 1.8, 0, 7); g.fill(); continue; }
    g.beginPath(); g.moveTo(s.xs[0] * scale + ox, s.ys[0] * scale + oy);
    for (let i = 1; i < s.n; i++) g.lineTo(s.xs[i] * scale + ox, s.ys[i] * scale + oy);
    g.stroke();
  }
  const px = g.getImageData(0, 0, w, h).data; const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = px[i * 4] > 127 ? 1 : 0;
  return { w, h, data };
}

// ───── модель ─────
let ortP = null, sess = null, vocab = null;
async function load(base) {
  if (sess) return sess;
  const ort = root.ort; if (!ort) throw new Error('ONNX Runtime не загружен');
  ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = base + 'ort/';
  const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const [enc, dec, vt] = await Promise.all([
    ort.InferenceSession.create(base + 'model/encoder.onnx', opt), ort.InferenceSession.create(base + 'model/decoder.onnx', opt),
    fetch(base + 'model/vocab.txt').then(r => { if (!r.ok) throw new Error('нет словаря модели'); return r.text(); })]);
  vocab = vt.split('\n').map(s => s.trim()); while (vocab.length && vocab[vocab.length - 1] === '') vocab.pop();
  sess = { enc, dec, ort }; return sess;
}
function topK(row, off, V, k) { const idx = new Array(k).fill(-1), val = new Array(k).fill(-Infinity); for (let i = 0; i < V; i++) { const v = row[off + i]; if (v <= val[k - 1]) continue; let j = k - 1; while (j > 0 && val[j - 1] < v) { val[j] = val[j - 1]; idx[j] = idx[j - 1]; j--; } val[j] = v; idx[j] = i; } return idx.filter(i => i >= 0); }
async function beamSearch(img, beam, maxLen) {
  const { enc, dec, ort } = sess;
  const fo = await enc.run({ image: new ort.Tensor('float32', img.data, [1, 1, img.h, img.w]) });
  const F = fo[Object.keys(fo)[0]]; const [, fh, fw, fd] = F.dims; const feat = F.data;
  let beams = [{ seq: [SOS], score: 0 }]; const done = [];
  for (let step = 0; step < maxLen; step++) {
    const B = beams.length, L = beams[0].seq.length;
    const fb = new Float32Array(B * feat.length); for (let i = 0; i < B; i++) fb.set(feat, i * feat.length);
    const tb = new BigInt64Array(B * L); beams.forEach((b, i) => b.seq.forEach((t, j) => { tb[i * L + j] = BigInt(t); }));
    const out = await dec.run({ feature: new ort.Tensor('float32', fb, [B, fh, fw, fd]), tokens: new ort.Tensor('int64', tb, [B, L]) });
    const lp = out[Object.keys(out)[0]]; const V = lp.dims[1]; const P = lp.data;
    const cand = [];
    beams.forEach((h, bi) => { for (const t of topK(P, bi * V, V, beam)) cand.push({ seq: h.seq.concat(t), score: h.score + P[bi * V + t] }); });
    cand.sort((a, b) => b.score - a.score);
    const next = [];
    for (const c of cand) { if (c.seq[c.seq.length - 1] === EOS) done.push({ seq: c.seq.slice(1, -1), score: c.score / (c.seq.length - 1) }); else next.push(c); if (next.length === beam) break; }
    beams = next;
    if (done.length >= beam || !beams.length) break;
    const best = Math.max(...done.map(d => d.score)); if (done.length && beams.every(b => b.score / b.seq.length < best)) break;
  }
  if (!done.length) beams.forEach(b => done.push({ seq: b.seq.slice(1), score: b.score / b.seq.length }));
  done.sort((a, b) => b.score - a.score);
  const seen = new Set(), out = [];
  for (const d of done) { const toks = d.seq.map(i => vocab[i] || '').filter(Boolean); const k = toks.join(' '); if (seen.has(k)) continue; seen.add(k); out.push({ toks, score: d.score }); }
  return out;
}
// несколько прочтений, лучшее первым
async function recognize(strokes, base, opts) {
  opts = opts || {}; await load(base || '');
  if (!strokes.length) return [];
  const eq = trailingEquals(strokes); const body = eq ? strokes.filter(s => !eq.includes(s)) : strokes;
  if (!body.length) return [['=']];
  const hyps = await beamSearch(render(body), opts.beam || 5, opts.maxLen || 90);
  const g = geometry(body);
  return hyps.map(hh => ({ hh, k: -hh.score + 0.08 * penalty(hh.toks, g) })).sort((a, b) => a.k - b.k)
    .map(({ hh }) => { const f = fixDots(hh.toks, g); return eq && f[f.length - 1] !== '=' ? f.concat('=') : f; })
    .filter((t, i, a) => a.findIndex(u => u.join(' ') === t.join(' ')) === i);
}
// токены модели → LaTeX Матлиста (умножение — точка, деление — дробь, «x = 5» — определение x := 5)
function toLatex(toks) {
  const map = { '\\times': '\\cdot', '\\div': '/', '\\limits': '', '*': '\\cdot', '\\ldots': '..', '\\cdots': '..' };
  let t = toks.map(x => (x in map ? map[x] : x)).filter(Boolean);
  let s = t.join(' ').replace(/\s+/g, ' ').trim();
  const m = /^([A-Za-zα-ωΑ-Ω](?:\s*_\s*(?:\{[^{}]*\}|\w))?)\s*=\s*(.+?)$/.exec(s);
  if (m && !/=/.test(m[2])) return m[1] + '\\coloneq ' + m[2];
  return s;
}
const api = { Stroke, recognize, toLatex, render, geometry, trailingEquals, typicalHeight, load, loaded: () => !!sess };
root.MatInk = api;
})(typeof self !== 'undefined' ? self : this);
