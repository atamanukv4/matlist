// Матлист — графики: построение серий, отрисовка (подложка, сетка, оси, легенда, трассировка) и жесты пальцами.
(function (root) {
'use strict';
const E = root.MatEngine;

const COLORS = ['#c0392b', '#1f6feb', '#16a34a', '#9333ea', '#ea8a00', '#0891b2', '#be185d', '#4d7c0f'];
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', varepsilon: 'ε', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', varphi: 'φ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };

const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', '+': '₊', '-': '₋', ',': ',' };
function subs(x) { x = x.replace(/\\(mathrm|text)|[{}\s]/g, ''); return [...x].every(c => SUBS[c]) ? [...x].map(c => SUBS[c]).join('') : '_' + x; }
// LaTeX → короткий текст для подписей на холсте
function texPlain(t) {
  let s = String(t || '');
  for (let i = 0; i < 4; i++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  return s.replace(/\\left|\\right/g, '').replace(/\\(operatorname|mathrm|text)\{([^}]*)\}/g, '$2').replace(/\\cdot/g, '·').replace(/\\langle/g, '⟨').replace(/\\rangle/g, '⟩')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)').replace(/\^\{\\prime\}/g, "'").replace(/\\prime/g, "'")
    .replace(/\\([a-zA-Z]+)/g, (m, c) => GREEK[c] || c).replace(/_\{([^{}]*)\}/g, (m, x) => subs(x)).replace(/_(\w)/g, (m, x) => subs(x)).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

// ───── данные ─────
function xDomain(r) {
  if (r.view) return [r.view.x0, r.view.x1];
  return [isFinite(r.xmin) ? r.xmin : -10, isFinite(r.xmax) ? r.xmax : 10];
}
function seriesOf(r) {
  if (!r.ys || !r.xs) throw new Error('Заполните оси графика');
  const env = r.env || new E.Env(); const ys = E.parseList(r.ys), xs = E.parseList(r.xs);
  if (!ys.length || !xs.length) throw new Error('Заполните оси графика');
  const ctx = new E.Ctx(env); const out = [];
  const num = v => { try { return E.toNum(v); } catch (e) { return NaN; } };
  ys.forEach((y, k) => {
    const x = xs[Math.min(k, xs.length - 1)]; const pts = [];
    const fr = E.freeRanges([x, y], env, new Set(), []);
    if (fr.length) {
      const local = env.child();
      for (const v of env.get(fr[0]).vals) { local.set(fr[0], v); let px, py; try { px = num(E.evalNode(x, local, ctx)); py = num(E.evalNode(y, local, ctx)); } catch (e) { px = py = NaN; } pts.push([px, py]); }
    } else if (x.type === 'id' && env.get(x.name) === undefined) { // быстрый график: x не определён — по видимому диапазону
      let [a, b] = xDomain(r); if (r.logx) { a = Math.max(a, 1e-12); b = Math.max(b, a * 10); }
      const N = 700; const local = env.child();
      for (let i = 0; i <= N; i++) {
        const t = r.logx ? Math.pow(10, Math.log10(a) + (Math.log10(b) - Math.log10(a)) * i / N) : a + (b - a) * i / N;
        local.set(x.name, t); let py;
        try { py = num(E.evalNode(y, local, ctx)); } catch (e) { if (i === 0 && /не определена/.test(e.message)) throw e; py = NaN; }
        pts.push([t, py]);
      }
      pts.quick = true;
    } else {
      const vx = E.evalNode(x, env, ctx), vy = E.evalNode(y, env, ctx);
      if (vx instanceof E.Mat && vy instanceof E.Mat) { const n = Math.min(vx.a.length, vy.a.length); for (let i = 0; i < n; i++) pts.push([num(vx.a[i]), num(vy.a[i])]); }
      else if (vy instanceof E.Mat) vy.a.forEach((v, i) => pts.push([i, num(v)]));
      else pts.push([num(vx), num(vy)]);
    }
    out.push(pts);
  });
  return out;
}

// ───── оформление ─────
function style(r, k) {
  const s = (r.st && r.st[k]) || {};
  return { color: s.color || COLORS[k % COLORS.length], width: s.width || 1.8, dash: s.dash || 'solid', name: s.name };
}
function defaultNames(r) { try { return E.parseList(r.ys).map((n, k) => texPlain(splitTop(r.ys)[k] || '')); } catch (e) { return []; } }
function splitTop(t) { const out = []; let d = 0, cur = ''; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '{' || c === '(' || c === '[') d++; if (c === '}' || c === ')' || c === ']') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; } if (cur) out.push(cur); return out.map(x => x.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')); }
function axisTitle(r, ax) {
  const v = ax === 'x' ? r.xlabel : r.ylabel;
  if (v !== undefined && v !== null) return v;
  if (ax === 'x') return texPlain(r.xs);
  const names = splitTop(r.ys || ''); return names.length === 1 ? texPlain(names[0]) : '';
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const pow10 = p => '10' + String(p).split('').map(c => SUP[c] || c).join('');
function tickText(v, f) {
  f = f || {}; if (Math.abs(v) < 1e-300) return '0';
  if (f.mode === 'fix') return v.toFixed(Math.max(0, Math.min(10, f.d != null ? f.d : 2))).replace('.', ',');
  if (f.mode === 'exp') { const d = Math.max(0, Math.min(6, f.d != null ? f.d : 1)); const [m, e] = v.toExponential(d).split('e'); return m.replace('.', ',') + '·10' + String(+e).split('').map(c => SUP[c] || c).join(''); }
  const a = Math.abs(v); if (a >= 1e5 || a < 1e-3) { const [m, e] = v.toExponential(1).split('e'); return m.replace('.', ',') + '·10' + String(+e).split('').map(c => SUP[c] || c).join(''); }
  return String(+v.toPrecision(5)).replace('.', ',');
}
function nice(span, n) { const raw = span / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function ticks(a, b, log, n) {
  const out = [];
  if (log) { for (let p = Math.floor(a); p <= Math.ceil(b); p++) if (p >= a - 1e-9 && p <= b + 1e-9) out.push(p); return out; }
  const st = nice(b - a, n || 5); for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-6; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v); return out;
}
const imgCache = new Map();
function getImg(src, onload) {
  if (!src) return null; let im = imgCache.get(src);
  if (!im) { im = new Image(); im.onload = () => { if (onload) onload(); }; im.src = src; imgCache.set(src, im); }
  else if (!im.complete && onload) im.addEventListener('load', onload, { once: true });
  return im.complete && im.naturalWidth ? im : null;
}

// ───── отрисовка ─────
// opts: { dpr, w, h, trace: {x, y}, onImg } → геометрия для жестов
function draw(cv, r, opts) {
  opts = opts || {}; const dpr = opts.dpr || 1, W = opts.w || r.w, H = opts.h || r.h;
  const series = seriesOf(r); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const xt = axisTitle(r, 'x'), yt = axisTitle(r, 'y');
  const fs = Math.max(10, Math.min(13, Math.round(W / 30)));
  const L = 48 + (yt ? fs + 6 : 0), R = 16, T = 10, B = 24 + (xt ? fs + 6 : 0);
  const tx = v => r.logx ? Math.log10(v) : v, ty = v => r.logy ? Math.log10(v) : v;
  const okPt = (x, y) => isFinite(x) && isFinite(y) && !(r.logx && x <= 0) && !(r.logy && y <= 0);
  let x0, x1, y0, y1;
  if (r.view) { x0 = tx(r.view.x0); x1 = tx(r.view.x1); y0 = ty(r.view.y0); y1 = ty(r.view.y1); }
  else {
    x0 = Infinity; x1 = -Infinity; y0 = Infinity; y1 = -Infinity;
    for (const s of series) for (const [x, y] of s) { if (!okPt(x, y)) continue; x0 = Math.min(x0, tx(x)); x1 = Math.max(x1, tx(x)); y0 = Math.min(y0, ty(y)); y1 = Math.max(y1, ty(y)); }
    if (!isFinite(x0)) throw new Error('Нет точек для построения');
    if (series.some(s => s.quick)) { const [a, b] = xDomain(r); x0 = tx(r.logx ? Math.max(a, 1e-12) : a); x1 = tx(b); }
    if (isFinite(r.xmin)) x0 = tx(r.xmin); if (isFinite(r.xmax)) x1 = tx(r.xmax);
    if (x0 === x1) { x0 -= 1; x1 += 1; } if (y0 === y1) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.05; y0 -= pad; y1 += pad;
    if (isFinite(r.ymin)) y0 = ty(r.ymin); if (isFinite(r.ymax)) y1 = ty(r.ymax);
  }
  const PW = W - L - R, PH = H - T - B;
  const SX = v => L + (v - x0) / (x1 - x0) * PW, SY = v => T + (y1 - v) / (y1 - y0) * PH; // в преобразованных единицах
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  // подложка
  if (r.bg && r.bg.src) {
    const im = getImg(r.bg.src, opts.onImg);
    if (im) { g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip(); g.globalAlpha = r.bg.op != null ? r.bg.op : 0.85;
      const X0 = SX(tx(r.bg.x0)), X1 = SX(tx(r.bg.x1)), Y0 = SY(ty(r.bg.y0)), Y1 = SY(ty(r.bg.y1));
      g.drawImage(im, Math.min(X0, X1), Math.min(Y0, Y1), Math.abs(X1 - X0), Math.abs(Y0 - Y1)); g.restore(); }
  }
  g.font = fs + 'px system-ui,sans-serif'; g.lineWidth = 1;
  const grid = r.grid !== false;
  g.fillStyle = '#4b5563'; g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of ticks(x0, x1, r.logx, Math.max(3, Math.round(PW / 70)))) { const X = SX(v); if (grid) { g.strokeStyle = 'rgba(100,110,130,.18)'; g.beginPath(); g.moveTo(X + .5, T); g.lineTo(X + .5, T + PH); g.stroke(); } g.fillText(r.logx ? pow10(v) : tickText(v, r.fx), Math.max(L, Math.min(X, W - 14)), T + PH + 5); }
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of ticks(y0, y1, r.logy, Math.max(3, Math.round(PH / 45)))) { const Y = SY(v); if (grid) { g.strokeStyle = 'rgba(100,110,130,.18)'; g.beginPath(); g.moveTo(L, Y + .5); g.lineTo(L + PW, Y + .5); g.stroke(); } g.fillText(r.logy ? pow10(v) : tickText(v, r.fy), L - 5, Y); }
  g.strokeStyle = '#98a2b3'; g.strokeRect(L + .5, T + .5, PW - 1, PH - 1);
  if (!r.logy && y0 < 0 && y1 > 0) { g.strokeStyle = '#98a2b3'; const Y = SY(0); g.beginPath(); g.moveTo(L, Y); g.lineTo(L + PW, Y); g.stroke(); }
  if (!r.logx && x0 < 0 && x1 > 0) { g.strokeStyle = '#98a2b3'; const X = SX(0); g.beginPath(); g.moveTo(X, T); g.lineTo(X, T + PH); g.stroke(); }
  // подписи осей
  g.fillStyle = '#1d2330'; g.font = '600 ' + fs + 'px system-ui,sans-serif';
  if (xt) { g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(xt, L + PW / 2, H - 3); }
  if (yt) { g.save(); g.translate(fs + 2, T + PH / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(yt, 0, 0); g.restore(); }
  // линии
  g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip();
  const scr = []; // точки в экранных координатах для трассировки
  series.forEach((s, k) => {
    const st = style(r, k); g.strokeStyle = st.color; g.fillStyle = st.color; g.lineWidth = st.width;
    g.setLineDash(st.dash === 'dash' ? [7, 5] : st.dash === 'dot' ? [2, 4] : []);
    const pointsOnly = st.dash === 'points' || s.length <= 2; const sp = [];
    g.beginPath(); let pen = false;
    for (const [x, y] of s) {
      if (!okPt(x, y)) { pen = false; continue; }
      const X = SX(tx(x)), Y = SY(ty(y)); sp.push([X, Y, x, y]);
      if (Math.abs(Y) > 1e5 || Math.abs(X) > 1e5) { pen = false; continue; }
      if (pointsOnly) { g.fillRect(X - 2.5, Y - 2.5, 5, 5); continue; }
      if (pen) g.lineTo(X, Y); else g.moveTo(X, Y); pen = true;
    }
    g.stroke(); g.setLineDash([]); scr.push(sp);
  });
  g.restore();
  // легенда
  const names = defaultNames(r);
  const showLegend = r.legend === true || (r.legend !== false && series.length > 1);
  if (showLegend) {
    g.font = (fs - 1) + 'px system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const items = series.map((s, k) => ({ st: style(r, k), name: style(r, k).name || names[k] || ('ряд ' + (k + 1)) }));
    const lw = Math.min(PW - 10, Math.max(...items.map(it => g.measureText(it.name).width)) + 34), lh = items.length * (fs + 4) + 8;
    const lx = r.legendPos === 'left' ? L + 6 : L + PW - lw - 6, ly = r.legendPos === 'bottom' ? T + PH - lh - 6 : T + 6;
    g.fillStyle = 'rgba(255,255,255,.88)'; g.strokeStyle = '#d0d5dd'; g.fillRect(lx, ly, lw, lh); g.strokeRect(lx + .5, ly + .5, lw - 1, lh - 1);
    items.forEach((it, k) => { const yy = ly + 4 + (fs + 4) * k + (fs + 4) / 2; g.strokeStyle = it.st.color; g.lineWidth = it.st.width; g.setLineDash(it.st.dash === 'dash' ? [6, 4] : it.st.dash === 'dot' ? [2, 3] : []); g.beginPath(); g.moveTo(lx + 6, yy); g.lineTo(lx + 24, yy); g.stroke(); g.setLineDash([]); g.fillStyle = '#1d2330'; g.fillText(it.name, lx + 29, yy, lw - 33); });
  }
  // трассировка
  if (opts.trace) {
    let best = null;
    scr.forEach((sp, k) => { for (const p of sp) { const d = Math.hypot(p[0] - opts.trace.x, p[1] - opts.trace.y); if (!best || d < best.d) best = { d, p, k }; } });
    if (best) {
      const [X, Y, x, y] = best.p; const col = style(r, best.k).color;
      g.strokeStyle = 'rgba(29,35,48,.45)'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X, T); g.lineTo(X, T + PH); g.moveTo(L, Y); g.lineTo(L + PW, Y); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.beginPath(); g.arc(X, Y, 4.5, 0, 7); g.fill();
      const fmt = v => (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)) ? v.toExponential(4) : String(+v.toPrecision(6));
      const txt = 'x = ' + fmt(x).replace('.', ',') + '   y = ' + fmt(y).replace('.', ',');
      g.font = '600 ' + fs + 'px system-ui,sans-serif'; const tw = g.measureText(txt).width + 14;
      let bx = Math.min(Math.max(L + 2, X - tw / 2), L + PW - tw - 2), by = Y - fs - 22; if (by < T + 2) by = Y + 12;
      g.fillStyle = 'rgba(29,35,48,.9)'; g.fillRect(bx, by, tw, fs + 10); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, bx + 7, by + (fs + 10) / 2);
    }
  }
  const geo = { L, T, PW, PH, x0, x1, y0, y1, W, H };
  cv._geo = geo; return geo;
}

// ───── жесты ─────
// mode(): 'view' — двигать/масштабировать вид; 'bg' — подгонять подложку. onChange(kind) — перерисовать.
function attachGestures(cv, r, onChange, mode) {
  const P = new Map(); let start = null, lp = null, lastTap = 0;
  const inv = (geo, X, Y) => ({ x: geo.x0 + (X - geo.L) / geo.PW * (geo.x1 - geo.x0), y: geo.y1 - (Y - geo.T) / geo.PH * (geo.y1 - geo.y0) });
  const fromT = (v, log) => log ? Math.pow(10, v) : v, toT = (v, log) => log ? Math.log10(v) : v;
  const local = ev => { const b = cv.getBoundingClientRect(); const k = (cv._geo ? cv._geo.W : b.width) / b.width; return { x: (ev.clientX - b.left) * k, y: (ev.clientY - b.top) * k }; };
  const curBox = () => { const g = cv._geo; return { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 }; };
  const bgBox = () => ({ x0: toT(r.bg.x0, r.logx), x1: toT(r.bg.x1, r.logx), y0: toT(r.bg.y0, r.logy), y1: toT(r.bg.y1, r.logy) });
  const setBox = (b, tgt) => {
    const o = { x0: fromT(b.x0, r.logx), x1: fromT(b.x1, r.logx), y0: fromT(b.y0, r.logy), y1: fromT(b.y1, r.logy) };
    if (tgt === 'bg') Object.assign(r.bg, o); else r.view = o;
  };
  cv.addEventListener('pointerdown', ev => {
    ev.preventDefault(); ev.stopPropagation(); try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
    P.set(ev.pointerId, local(ev)); const m = mode(); const tgt = m === 'bg' && r.bg ? 'bg' : 'view';
    start = { pts: new Map([...P].map(([k, v]) => [k, { ...v }])), box: tgt === 'bg' ? bgBox() : curBox(), tgt, geo: cv._geo };
    clearTimeout(lp); r._trace = null;
    if (P.size === 1 && tgt === 'view') {
      const now = Date.now(); if (now - lastTap < 300) { r.view = null; onChange('reset'); lastTap = 0; return; } lastTap = now;
      const p0 = local(ev); lp = setTimeout(() => { r._trace = p0; onChange('trace'); }, 420);
    }
  });
  cv.addEventListener('pointermove', ev => {
    if (!P.has(ev.pointerId) || !start) return; ev.preventDefault();
    const p = local(ev); P.set(ev.pointerId, p);
    if (r._trace) { r._trace = p; onChange('trace'); return; }
    const geo = start.geo; if (!geo) return;
    const ids = [...P.keys()];
    if (ids.length === 1) {
      const s0 = start.pts.get(ids[0]); if (!s0) return;
      if (Math.hypot(p.x - s0.x, p.y - s0.y) > 6) clearTimeout(lp);
      const dx = (p.x - s0.x) / geo.PW * (geo.x1 - geo.x0), dy = (p.y - s0.y) / geo.PH * (geo.y1 - geo.y0);
      const b = start.box; setBox({ x0: b.x0 + (start.tgt === 'bg' ? dx : -dx), x1: b.x1 + (start.tgt === 'bg' ? dx : -dx), y0: b.y0 + (start.tgt === 'bg' ? -dy : dy), y1: b.y1 + (start.tgt === 'bg' ? -dy : dy) }, start.tgt);
      onChange('move');
    } else if (ids.length >= 2) {
      clearTimeout(lp);
      const a0 = start.pts.get(ids[0]), b0 = start.pts.get(ids[1]); if (!a0 || !b0) { start = { pts: new Map([...P].map(([k, v]) => [k, { ...v }])), box: start.tgt === 'bg' ? bgBox() : curBox(), tgt: start.tgt, geo: cv._geo }; return; }
      const a1 = P.get(ids[0]), b1 = P.get(ids[1]);
      const c0 = inv(geo, (a0.x + b0.x) / 2, (a0.y + b0.y) / 2), c1 = inv(geo, (a1.x + b1.x) / 2, (a1.y + b1.y) / 2);
      let kx, ky;
      if (start.tgt === 'bg') { // подгонка: растяжение по осям отдельно
        const dx0 = Math.abs(a0.x - b0.x), dy0 = Math.abs(a0.y - b0.y), dx1 = Math.abs(a1.x - b1.x), dy1 = Math.abs(a1.y - b1.y);
        kx = dx0 > 40 ? dx1 / dx0 : 1; ky = dy0 > 40 ? dy1 / dy0 : 1;
      } else { const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y); kx = ky = d0 > 10 ? d1 / d0 : 1; }
      kx = Math.max(0.05, Math.min(20, kx)); ky = Math.max(0.05, Math.min(20, ky));
      const b = start.box;
      if (start.tgt === 'bg') setBox({ x0: c1.x + (b.x0 - c0.x) * kx, x1: c1.x + (b.x1 - c0.x) * kx, y0: c1.y + (b.y0 - c0.y) * ky, y1: c1.y + (b.y1 - c0.y) * ky }, 'bg');
      else setBox({ x0: c0.x + (b.x0 - c1.x) / kx, x1: c0.x + (b.x1 - c1.x) / kx, y0: c0.y + (b.y0 - c1.y) / ky, y1: c0.y + (b.y1 - c1.y) / ky }, 'view');
      onChange('zoom');
    }
  });
  const end = ev => {
    if (!P.has(ev.pointerId)) return; P.delete(ev.pointerId); clearTimeout(lp);
    if (r._trace && P.size === 0) { r._trace = null; onChange('trace-end'); }
    start = P.size ? { pts: new Map([...P].map(([k, v]) => [k, { ...v }])), box: (start && start.tgt === 'bg') ? bgBox() : curBox(), tgt: start ? start.tgt : 'view', geo: cv._geo } : null;
    if (!P.size) onChange('end');
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.style.touchAction = 'none';
}

root.MatPlot = { draw, seriesOf, attachGestures, texPlain, defaultNames, axisTitle, COLORS, getImg, splitTop };
})(typeof self !== 'undefined' ? self : this);
