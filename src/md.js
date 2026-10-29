// Матлист — развёртывание Markdown в лист: заголовки и абзацы → текст, формулы $$…$$, \[…\], ```math → регионы-формулы.
// Решение задачи из .md превращается в лист Mathcad: «x = …» — определение x := …, «… = 5» — вывод (значение пересчитывается),
// уравнения без значения показываются как есть. Единицы текстом (\text{кг}) ставятся подписью справа, как принято в листах пользователя.
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.MatEngine;

// ───── LaTeX из Markdown → LaTeX Матлиста ─────
const FUNCS = new Set(['sin', 'cos', 'tan', 'tg', 'ctg', 'cot', 'ln', 'lg', 'log', 'exp', 'max', 'min', 'arcsin', 'arccos', 'arctan', 'arctg', 'sinh', 'cosh', 'tanh', 'det', 'mod', 'if', 'sqrt', 'root', 'lim', 'sum', 'int']);
function splitTop(s, sepRe) { // разбить по разделителю на верхнем уровне скобок
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (d === 0) { const m = sepRe.exec(s.slice(i)); if (m && m.index === 0) { out.push(cur); cur = ''; i += m[0].length - 1; continue; } }
    if (c === '\\') { const m = /^\\[A-Za-z]+|^\\./.exec(s.slice(i)); cur += m[0]; i += m[0].length - 1; continue; }
    if ('{(['.includes(c)) d++; if ('})]'.includes(c)) d--;
    cur += c;
  }
  out.push(cur); return out.map(x => x.trim());
}
// «ab» в записи решения — произведение a·b (в Mathcad «ab» было бы одним именем)
function splitLetters(t) {
  let out = '', i = 0;
  while (i < t.length) {
    if (t[i] === '\\') { const m = /^\\([A-Za-z]+)/.exec(t.slice(i)) || [t.slice(i, i + 2), '']; out += m[0]; i += m[0].length;
      if (/^(text|mathrm|operatorname|mathit|mathbf|textrm|begin|end)$/.test(m[1]) && t[i] === '{') { let d = 0, j = i; for (; j < t.length; j++) { if (t[j] === '{') d++; if (t[j] === '}' && !--d) break; } out += t.slice(i, j + 1); i = j + 1; }
      continue; }
    if (t[i] === '_' || t[i] === '^') { // индекс/степень: одна буква или группа — не трогаем
      out += t[i++]; if (t[i] === '{') { let d = 0, j = i; for (; j < t.length; j++) { if (t[j] === '{') d++; if (t[j] === '}' && !--d) break; } out += t.slice(i, j + 1); i = j + 1; } else if (i < t.length) out += t[i++];
      continue; }
    const m = /^[A-Za-z]{2,}/.exec(t.slice(i));
    if (m) { const w = m[0]; out += FUNCS.has(w) ? w : w.split('').join('\\cdot '); i += w.length; continue; }
    out += t[i++];
  }
  return out;
}
function cleanTex(t) {
  return t.replace(/\\(dfrac|tfrac)/g, '\\frac').replace(/\\times/g, '\\cdot ').replace(/\\cdotp/g, '\\cdot ')
    .replace(/\{,\}/g, '.').replace(/(\d),(\d)/g, '$1.$2') // десятичная запятая
    .replace(/\\(displaystyle|limits|quad|qquad)\b/g, ' ').replace(/\\!/g, '').replace(/\\(ge|geqslant)\b/g, '\\ge').replace(/\\(le|leqslant)\b/g, '\\le')
    .replace(/\\operatorname\{(tg)\}/g, '\\tan').replace(/\\tg\b/g, '\\tan').replace(/\\ctg\b/g, '\\cot')
    .replace(/\s*[,.;:]\s*$/, '').trim();
}
// хвост «= 5\ \text{м/с}» → подпись единиц
function takeUnit(t) {
  const m = /(?:\\[,;:! ]|\\quad|\s|~)*\\(?:text|mathrm)\{\s*([^{}]*?[A-Za-zА-Яа-яЁё°%][^{}]*?)\s*\}\s*$/.exec(t);
  if (!m) return { t, unit: null };
  const before = t.slice(0, m.index); if (!/[\d)}]\s*$/.test(before)) return { t, unit: null }; // \text в середине — не единица
  return { t: before.trim(), unit: m[1].replace(/\\,|~/g, ' ').trim() };
}
const isNum = s => /^-?\s*\d+(\.\d+)?(\s*\\cdot\s*10\^\{?-?\d+\}?)?$/.test(s.replace(/\s+/g, ''));
const isName = s => { try { const n = E.parse(s); return n.type === 'expr' && (n.expr.type === 'id' || (n.expr.type === 'sub' && n.expr.e.type === 'id') || (n.expr.type === 'call' && n.expr.args.every(a => a.type === 'id'))); } catch (e) { return false; } };
function parsesTo(t) { try { E.parse(t); return true; } catch (e) { return false; } }
// одна формула → { latex, unit, shown (полная запись из файла), kind: 'def'|'eval'|'eq' }
// индексы в записи решения — часть имени (c_p, t_1, T_{in}), а не индекс вектора: c_{\mathrm{p}}
function litSubs(t) {
  return t.replace(/(\\[A-Za-z]+|[A-Za-z])_(?:\{\s*([A-Za-z0-9А-Яа-яЁё.' ]+?)\s*\}|([A-Za-z0-9]))/g, (m, base, g, c) => {
    if (/^\\(sum|prod|int|iint|oint|lim|max|min|log|bigcup|bigcap)$/.test(base)) return m;
    const x = g != null ? g : c; if (/^[ijkn]$/.test(x)) return m; // x_i — индекс
    return base + '_{\\mathrm{' + x.replace(/\s+/g, '') + '}}';
  }).replace(/_\{\\text\{([^{}]*)\}\}/g, '_{\\mathrm{$1}}');
}
function formula(raw) {
  let t = litSubs(cleanTex(raw)); const u = takeUnit(t); t = u.t;
  const full = t;
  if (/\\coloneq|:=|\\equiv/.test(t)) return { latex: t.replace(/:=/g, '\\coloneq '), unit: u.unit, full, kind: 'def' };
  const parts = splitTop(t, /^(=|\\approx\b|\\simeq\b)/);
  if (parts.length === 1) return { latex: t, unit: u.unit, full, kind: 'eq' };
  const fixed = p => (parsesTo(p) ? p : splitLetters(p));
  const lhs = parts[0], last = parts[parts.length - 1];
  if (isName(lhs) && parts.length >= 2) {
    const rhs = fixed(parts[1]);
    if (parts.length === 2) return { latex: lhs + '\\coloneq ' + rhs + (isNum(rhs) ? '' : '='), unit: u.unit, full, kind: 'def', given: isNum(last) ? numOf(last) : null };
    return { latex: lhs + '\\coloneq ' + rhs + '=', unit: u.unit, full, kind: 'def', given: isNum(last) ? numOf(last) : null };
  }
  if (isNum(last) && parts.length >= 2 && !(parts.length === 2 && numOf(last) === 0)) return { latex: fixed(lhs) + '=', unit: u.unit, full, kind: 'eval', given: numOf(last) };
  return { latex: t, unit: u.unit, full, kind: 'eq' };
}
function numOf(s) { s = s.replace(/\s+/g, ''); const m = /^(-?\d+(?:\.\d+)?)(?:\\cdot10\^\{?(-?\d+)\}?)?$/.exec(s); return m ? parseFloat(m[1]) * Math.pow(10, m[2] ? +m[2] : 0) : null; }
// окружение aligned/align/gather/cases → строки
function lines(block) {
  const env = /\\begin\{(aligned|align\*?|gather\*?|gathered|split|eqnarray\*?|array)\}(\{[^}]*\})?([\s\S]*?)\\end\{\1\}/.exec(block);
  const body = env ? env[3] : block;
  if (!env && /\\begin\{(cases|bmatrix|pmatrix|matrix|vmatrix)\}/.test(block) && !/\\\\[^]*\\end/.test(block.replace(/\\begin\{(cases|bmatrix|pmatrix|matrix|vmatrix)\}[\s\S]*?\\end\{\1\}/g, ''))) return [block.trim()];
  return splitTop(body.replace(/\\begin\{(cases|bmatrix|pmatrix|matrix|vmatrix)\}[\s\S]*?\\end\{\1\}/g, m => m.replace(/\\\\/g, '\u0001')), /^\\\\/).map(x => x.replace(/\u0001/g, '\\\\').replace(/&/g, ' ').replace(/\\tag\{[^}]*\}/g, '').trim()).filter(Boolean);
}
// инлайн-формулы в тексте → читаемый текст
const SYM = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', varepsilon: 'ε', epsilon: 'ε', eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', varphi: 'φ', phi: 'φ', omega: 'ω', Omega: 'Ω', psi: 'ψ', xi: 'ξ', zeta: 'ζ', chi: 'χ',
  cdot: '·', times: '×', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', pm: '±', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', degree: '°', circ: '°', in: '∈', sqrt: '√', partial: '∂', int: '∫', sum: 'Σ', ldots: '…', dots: '…', cdots: '…' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ', i: 'ᵢ', j: 'ⱼ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };
function plainTex(t) {
  let s = t;
  for (let k = 0; k < 4; k++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)').replace(/\\(text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$2').replace(/\\left|\\right/g, '')
    .replace(/\^\{([^{}]*)\}|\^(\w)/g, (m, a, b) => { const x = a != null ? a : b; return [...x].every(c => SUP[c]) ? [...x].map(c => SUP[c]).join('') : '^' + x; })
    .replace(/_\{([^{}]*)\}|_(\w)/g, (m, a, b) => { const x = a != null ? a : b; return [...x].every(c => SUB[c]) ? [...x].map(c => SUB[c]).join('') : '_' + x; })
    .replace(/\\([A-Za-z]+)/g, (m, c) => SYM[c] != null ? SYM[c] : (FUNCS.has(c) ? c : c)).replace(/\\[,;:! ]/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ');
  return s.trim();
}
function inline(text) {
  return text.replace(/\$\$([^$]+)\$\$|\$([^$]+)\$|\\\((.+?)\\\)/g, (m, a, b, c) => plainTex(a || b || c))
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2').replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<br\s*\/?>/gi, '\n');
}

// ───── Markdown → блоки ─────
function blocks(md) {
  const L = md.replace(/\r\n?/g, '\n').split('\n'); const out = []; let i = 0, para = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  while (i < L.length) {
    const line = L[i], tr = line.trim();
    if (!tr) { flush(); i++; continue; }
    let m;
    if ((m = /^```\s*(\w*)/.exec(tr))) { flush(); const lang = m[1].toLowerCase(); const body = []; i++; while (i < L.length && !/^```/.test(L[i].trim())) body.push(L[i++]); i++;
      out.push(/^(math|latex|tex|mathcad|matlist|formula)$/.test(lang) ? { t: 'math', items: body.map(s => s.trim()).filter(Boolean) } : { t: 'code', text: body.join('\n') }); continue; }
    if (/^\$\$/.test(tr) || /^\\\[/.test(tr) || /^\\begin\{(equation|align|gather|aligned)\*?\}/.test(tr)) {
      flush(); const close = /^\$\$/.test(tr) ? '$$' : /^\\\[/.test(tr) ? '\\]' : null; let buf = tr.replace(/^\$\$|^\\\[/, '');
      if (close) { while (!buf.includes(close) && i + 1 < L.length) buf += '\n' + L[++i]; const k = buf.indexOf(close); const rest = buf.slice(k + close.length).trim(); buf = buf.slice(0, k); i++; if (rest) para.push(rest); }
      else { const env = /^\\begin\{(\w+\*?)\}/.exec(tr)[1]; while (!buf.includes('\\end{' + env + '}') && i + 1 < L.length) buf += '\n' + L[++i]; i++; buf = buf.replace(/^\\begin\{equation\*?\}|\\end\{equation\*?\}$/g, ''); }
      out.push({ t: 'math', items: lines(buf.replace(/\n/g, ' ')) }); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(tr))) { flush(); out.push({ t: 'h', level: m[1].length, text: m[2].replace(/\s*#+\s*$/, '') }); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(tr)) { flush(); out.push({ t: 'hr' }); i++; continue; }
    if (/^\|.*\|\s*$/.test(tr)) { flush(); const rows = []; while (i < L.length && /^\|.*\|\s*$/.test(L[i].trim())) { const r = L[i].trim(); if (!/^\|[\s:|-]+\|$/.test(r)) rows.push(r.slice(1, -1).split('|').map(c => inline(c.trim()))); i++; } out.push({ t: 'table', rows }); continue; }
    if ((m = /^([-*+]|\d+[.)])\s+(.*)$/.exec(tr))) { flush(); const items = []; while (i < L.length && (m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(L[i]))) { items.push({ mark: /\d/.test(m[1]) ? m[1].replace(')', '.') : '•', text: m[2] }); i++; } out.push({ t: 'list', items }); continue; }
    if ((m = /^>\s?(.*)$/.exec(tr))) { flush(); out.push({ t: 'p', text: m[1], quote: true }); i++; continue; }
    if ((m = /^!\[([^\]]*)\]\((data:image\/[^)]+)\)/.exec(tr))) { flush(); out.push({ t: 'img', src: m[2] }); i++; continue; }
    // строка-абзац, целиком из одной формулы $…$
    if ((m = /^\$([^$]+)\$\s*[,.;]?$/.exec(tr))) { flush(); out.push({ t: 'math', items: lines(m[1]) }); i++; continue; }
    para.push(tr); i++;
  }
  flush(); return out;
}

// ───── блоки → регионы листа (координаты в пикселях; высоты потом уточняет приложение по отрисовке) ─────
function mdToRegions(md) {
  const R = []; let y = 16; const X = 16, W = 340;
  const text = (t, o) => { const lines = t.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 44)), 0); R.push(Object.assign({ kind: 'text', x: X, y, text: t }, o || {})); y += 21 * lines + 10; };
  let title = null;
  for (const b of blocks(md)) {
    if (b.t === 'h') { const t = inline(b.text); if (!title) title = t; R.push({ kind: 'text', x: X, y: y + (R.length ? 8 : 0), text: t, bold: true, fpt: b.level <= 1 ? 14 : b.level === 2 ? 12.5 : 11 }); y += (b.level <= 1 ? 34 : 28) + (R.length > 1 ? 8 : 0); continue; }
    if (b.t === 'p') { text(inline(b.text), b.quote ? { quote: true } : null);
      // исходные данные в тексте: «$\delta = 0,25$ м» → определение δ := 0.25 (подпись «м»), в ряд под абзацем
      const defs = []; const re = /(?:\$([^$]+)\$|\\\((.+?)\\\))(?:\s*([A-Za-zА-Яа-яЁё°%²³·\/()^\-]{1,14})(?=[,.;:]|\s*$|\s+(?:и|а|,)\s))?/g; let m;
      while (!/^\**\s*(ответ|итог)/i.test(b.text) && (m = re.exec(b.text))) { if (/\\approx|≈/.test(m[1] || m[2])) continue; const f = formula(m[1] || m[2]); if (f.kind === 'def' && /\\coloneq\s*-?[\d.]+$/.test(f.latex)) defs.push({ f, unit: f.unit || (m[3] && !/^(и|а|в|с|к|на|по|из)$/i.test(m[3]) ? m[3] : null) }); }
      // «где Q = 500 кВт, …» после формулы: в Mathcad данные должны стоять выше — ряд определений ставится перед формулой
      const lastMath = [...R].reverse().find(r => r.kind === 'math');
      const hoist = defs.length && lastMath && /^(где|здесь|при)(?=[\s,:])/i.test(b.text.trim()) ? lastMath.y - 0.5 : null;
      if (hoist != null) { const y0 = y; y = hoist; let x = X + 8; for (const d of defs) { R.push({ kind: 'math', x, y, latex: d.f.latex, mdFull: d.f.full, mdKind: 'def', stored: null }); x += 200; if (d.unit) R.push({ kind: 'text', x: x - 100, y, text: d.unit, oneLine: true, mdUnit: true }); } y = y0; }
      else if (defs.length && !b.quote) { let x = X + 8; for (const d of defs) { const w = 26 + 9 * d.f.latex.replace(/\\coloneq|\\[A-Za-z]+|[{}_^]/g, 'x').length + (d.unit ? 8 * d.unit.length + 8 : 0);
          if (x + w > X + W && x > X + 8) { x = X + 8; y += 36; }
          R.push({ kind: 'math', x, y, latex: d.f.latex, mdFull: d.f.full, mdKind: 'def', stored: null }); if (d.unit) R.push({ kind: 'text', x: x + w - 8 * d.unit.length, y, text: d.unit, oneLine: true, mdUnit: true }); x += w + 22; }
        y += 38; }
      continue; }
    if (b.t === 'list') { text(b.items.map(it => it.mark + ' ' + inline(it.text)).join('\n')); continue; }
    if (b.t === 'table') { text(b.rows.map(r => r.join('   ')).join('\n'), { ff: 'Courier New' }); continue; }
    if (b.t === 'code') { text(b.text, { ff: 'Courier New' }); continue; }
    if (b.t === 'hr') { y += 12; continue; }
    if (b.t === 'img') { R.push({ kind: 'image', x: X, y, src: b.src, w: 240, h: 160 }); y += 172; continue; }
    if (b.t === 'math') for (const it of b.items) {
      const f = formula(it); if (!f.latex) continue;
      const h = 30 + (/\\frac|\\sum|\\int|\\prod/.test(f.latex) ? 16 : 0) + (/\\begin\{(b|p|v)?matrix\}|\\begin\{cases\}/.test(f.latex) ? 26 * ((f.latex.match(/\\\\/g) || []).length) : 0);
      R.push({ kind: 'math', x: X, y, latex: f.latex, mdFull: f.full, mdKind: f.kind, stored: f.given != null ? f.given : null });
      if (f.unit) R.push({ kind: 'text', x: X + 200, y, text: f.unit, oneLine: true, mdUnit: true });
      y += h + 8;
    }
  }
  return { regions: R, title };
}
// проверка: формулы, которые не считаются (символьный вывод, неизвестные), показываются как записаны в файле
function settle(regions) {
  const R = new E.SheetRunner(0);
  for (const r of regions.filter(r => r.kind === 'math').sort((a, b) => a.y - b.y || a.x - b.x)) {
    let st = null;
    if (r.mdKind === 'eq') { r.noeval = true; r.mdPlain = plainTex(r.latex); continue; }
    try { st = E.parse(r.latex); R.step(st); }
    catch (e) {
      // определение без числа: оставить запись из файла как формулу-иллюстрацию
      if (r.mdFull && parsesTo(r.mdFull.replace(/\\approx/g, '='))) r.latex = r.mdFull.replace(/\\approx/g, '=');
      else if (!parsesTo(r.latex)) r.latex = r.mdFull || r.latex;
      r.noeval = true;
    }
    if (r.noeval) r.mdPlain = plainTex(r.mdFull || r.latex);
  }
  return regions;
}
function mdToSheet(md) { const { regions, title } = mdToRegions(md); return { regions: settle(regions), title }; }
const api = { mdToSheet, mdToRegions, blocks, formula, inline, plainTex };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatMarkdown = api;
})(typeof self !== 'undefined' ? self : this);
