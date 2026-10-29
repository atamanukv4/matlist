// Матлист — импорт листов Mathcad 15 (.xmcd): XML → регионы Матлиста (формулы в LaTeX, текст, заглушки графиков).
// Формат сверён с настоящими файлами Mathcad 15: ml:define / ml:eval / ml:apply, id с subscript, ml:matrix по столбцам.
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.MatEngine;

function local(el) { return (el.localName || el.nodeName || '').replace(/^ml:/, ''); }
function kids(el) { const out = []; for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c); return out; }
function unsupported(what) { return { type: 'unsupported', what }; }

function idName(el) {
  const base = (el.textContent || '').trim();
  const sub = el.getAttribute('subscript');
  return sub ? base + '_' + sub : base;
}

function conv(el) {
  const t = local(el);
  switch (t) {
    case 'id': return { type: 'id', name: idName(el) };
    case 'real': { const v = parseFloat(el.textContent); return v < 0 ? { type: 'neg', e: { type: 'num', v: -v } } : { type: 'num', v }; }
    case 'imag': return { type: 'imag', v: parseFloat(el.textContent) };
    case 'complex': { const k = kids(el); let re = 0, im = 0; for (const c of k) { if (local(c) === 'real') re = parseFloat(c.textContent); if (local(c) === 'imag') im = parseFloat(c.textContent); } return { type: 'bin', op: '+', l: { type: 'num', v: re }, r: { type: 'imag', v: im } }; }
    case 'placeholder': return unsupported('пустое место');
    case 'str': return { type: 'str', v: el.textContent };
    case 'parens': return { type: 'paren', e: conv(kids(el)[0]) };
    case 'matrix': {
      const r = +el.getAttribute('rows'), c = +el.getAttribute('cols'); const ks = kids(el).map(conv);
      const rows = []; for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) row.push(ks[j * r + i] || { type: 'num', v: 0 }); rows.push(row); }
      return { type: 'matrix', rows };
    }
    case 'range': {
      const k = kids(el);
      if (local(k[0]) === 'sequence') { const s = kids(k[0]).map(conv); return { type: 'range', a: s[0], s: s[1], b: conv(k[1]) }; }
      return { type: 'range', a: conv(k[0]), b: conv(k[1]) };
    }
    case 'function': { const k = kids(el); const name = idName(k[0]); const params = kids(k[1]).map(x => ({ type: 'id', name: idName(x) })); return { type: 'call', f: name, args: params }; }
    case 'apply': return convApply(el);
    case 'sequence': return unsupported('последовательность');
    case 'unitOverride': return null;
    default: return unsupported(t);
  }
}
const BINOP = { plus: '+', minus: '-', mult: '·', div: '/', equal: '==', lessThan: '<', greaterThan: '>', lessOrEqual: '≤', greaterOrEqual: '≥', notEqual: '≠', and: '∧', or: '∨', xor: '⊕' };
const SOLVERS = { Find: 1, Minimize: 1, Maximize: 1, Minerr: 1, Odesolve: 1, polyroots: 1, genfit: 1, Pdesolve: 1, numol: 1 };
function lambdaOf(el) { const k = kids(el); const vars = kids(k[0]).map(idName); return { v: vars[0], body: conv(k[1]) }; }
function convApply(el) {
  const k = kids(el); const head = k[0]; const h = local(head);
  if (h === 'integral' || h === 'summation' || h === 'product' || h === 'derivative') {
    const lam = lambdaOf(k[1]); const third = k[2]; const tl = third ? local(third) : null;
    if (h === 'derivative') { const order = tl === 'degree' ? Math.round(parseFloat(kids(third)[0].textContent)) || 1 : 1; return { type: 'deriv', v: lam.v, order, e: lam.body }; }
    const b = tl === 'bounds' ? kids(third).map(conv) : null;
    if (h === 'integral') { if (!b) return unsupported('неопределённый интеграл'); return { type: 'int', lo: b[0], hi: b[1], body: lam.body, v: lam.v }; }
    return { type: h === 'summation' ? 'sum' : 'prod', v: lam.v, from: b ? b[0] : null, to: b ? b[1] : null, body: lam.body };
  }
  if (SOLVERS[h]) { const a = k[1]; const list = !a ? [] : (local(a) === 'sequence' ? kids(a).map(conv) : [conv(a)]); return { type: 'call', f: h, args: list }; }
  const args = k.slice(1).map(conv);
  if (BINOP[h]) {
    if (h === 'minus' && args.length === 1) return { type: 'neg', e: args[0] };
    let acc = args[0]; for (let i = 1; i < args.length; i++) acc = { type: 'bin', op: BINOP[h], l: acc, r: args[i] }; return acc;
  }
  switch (h) {
    case 'pow': return { type: 'pow', b: args[0], e: args[1] };
    case 'neg': return { type: 'neg', e: args[0] };
    case 'sqrt': return { type: 'sqrt', e: args[0] };
    case 'nthRoot': return { type: 'root', n: args[0], e: args[1] }; // порядок аргументов сверен с Mathcad 15
    case 'absval': return { type: 'abs', e: args[0] };
    case 'factorial': return { type: 'fact', e: args[0] };
    case 'not': return { type: 'un', op: '¬', e: args[0] };
    case 'transpose': return { type: 'transpose', e: args[0] };
    case 'determinant': return { type: 'abs', e: args[0] };
    case 'matcol': return { type: 'col', e: args[0], j: args[1] };
    case 'conjugate': return { type: 'call', f: 'conj', args: [args[0]] };
    case 'vectorize': return { type: 'vectorize', e: args[0] };
    case 'indexer': {
      const ixEl = k[2]; const ix = local(ixEl) === 'sequence' ? kids(ixEl).map(conv) : [conv(ixEl)];
      return { type: 'sub', e: args[0], raw: '', ix };
    }
    case 'id': {
      const name = idName(head); const a = k[1];
      const list = !a ? [] : (local(a) === 'sequence' ? kids(a).map(conv) : [conv(a)]);
      return { type: 'call', f: name, args: list };
    }
  }
  return unsupported(h);
}

function textOf(el) {
  const ps = el.getElementsByTagName('p'); const lines = [];
  for (let i = 0; i < ps.length; i++) lines.push(ps[i].textContent);
  if (!lines.length) lines.push(el.textContent);
  return lines.join('\n').replace(/ /g, ' ').trim();
}
function isBold(el) { return el.getElementsByTagName('b').length > 0; }

// Главная функция: текст .xmcd → { regions, warnings }
function importXmcd(xml, DOMParserImpl) {
  const DP = DOMParserImpl || root.DOMParser;
  const doc = new DP().parseFromString(xml, 'application/xml');
  const regs = doc.getElementsByTagName('region'); const out = []; const warnings = new Set();
  const binItems = {}; // картинки: <binaryContent><item item-id="N">base64</item>
  const bcs = doc.getElementsByTagName('binaryContent');
  for (let b = 0; b < bcs.length; b++) { const its = bcs[b].getElementsByTagName('item'); for (let i = 0; i < its.length; i++) binItems[its[i].getAttribute('item-id')] = its[i].textContent; }
  for (let i = 0; i < regs.length; i++) {
    const r = regs[i]; const x = parseFloat(r.getAttribute('left')) || 0, y = parseFloat(r.getAttribute('top')) || 0;
    const bgc = r.getAttribute('background-color'); const hl = r.getAttribute('show-highlight') === 'true' ? (/^#[0-9a-f]{6}$/i.test(bgc || '') ? bgc : '#ffff80') : null;
    const push = o => { if (hl) o.hl = hl; out.push(o); };
    const body = kids(r).filter(c => local(c) !== 'rendering')[0]; if (!body) continue;
    const kind = local(body);
    if (kind === 'text') {
      const t = textOf(body); if (!t) continue;
      const fEl = body.getElementsByTagName('f')[0]; const fs = fEl && parseFloat(fEl.getAttribute('size'));
      push({ kind: 'text', x, y, text: t, bold: isBold(body), wpt: parseFloat(r.getAttribute('width')) || null, fpt: fs || null }); continue;
    }
    if (kind === 'math') {
      const st = kids(body)[0]; if (!st) continue; const sk = local(st);
      let stored = null;
      const resEl = [...kids(st)].find(c => local(c) === 'result');
      if (resEl) { const rv = kids(resEl)[0]; if (rv && local(rv) === 'real') stored = parseFloat(rv.textContent); }
      try {
        let node;
        const symOf = el => { // «→»: выражение, ключевые слова, результат
          const ch = kids(el); const cmds = ch.filter(c => local(c) === 'command').map(c => (c.textContent || '').trim().split(/\s+/)[0]);
          const res = ch.find(c => local(c) === 'symResult'); const ex = ch.find(c => !['command', 'symResult'].includes(local(c)));
          const simple = cmds.every(c => /^(float|simplify|expand|factor|collect|complex|assume)$/.test(c));
          return { ex, res: res && kids(res)[0], simple, cmds };
        };
        if ((sk === 'define' || sk === 'globalDefine') && kids(st).some(c => local(c) === 'symEval')) {
          const k = kids(st); const se = symOf(k.find(c => local(c) === 'symEval'));
          if (se.simple || !se.res) node = { type: 'define', global: sk === 'globalDefine', lhs: conv(k[0]), rhs: conv(se.ex), show: true, sym: true };
          else { node = { type: 'define', global: sk === 'globalDefine', lhs: conv(k[0]), rhs: conv(se.res) }; warnings.add('символьные ключевые слова (' + se.cmds.join(', ') + ') заменены результатом, сохранённым в файле'); }
        } else if (sk === 'symEval') {
          const se = symOf(st);
          node = se.simple || !se.res ? { type: 'eval', expr: conv(se.ex), sym: true } : { type: 'eval', expr: conv(se.res) };
        } else if (sk === 'define' || sk === 'globalDefine') {
          const k = kids(st).filter(c => !['result', 'unitOverride'].includes(local(c)));
          const rEl = k[1]; const inl = rEl && local(rEl) === 'eval'; // c := … = (вывод внутри определения)
          const rIn = inl ? kids(rEl).filter(c => !['result', 'unitOverride'].includes(local(c)))[0] : rEl;
          node = { type: 'define', global: sk === 'globalDefine', lhs: conv(k[0]), rhs: conv(rIn) };
          if (inl || k.length > 2) node.show = true;
          if (inl) { const rr = kids(rEl).find(c => local(c) === 'result'); if (rr) { const rv = kids(rr)[0]; if (rv && local(rv) === 'real') stored = parseFloat(rv.textContent); } }
        } else if (sk === 'eval') {
          const k = kids(st).filter(c => !['result', 'unitOverride'].includes(local(c)));
          const inner = k[0];
          if (inner && local(inner) === 'define') { node = { type: 'define', lhs: conv(kids(inner)[0]), rhs: conv(kids(inner)[1]), show: true }; }
          else node = { type: 'eval', expr: conv(inner) };
          if (kids(st).some(c => local(c) === 'unitOverride')) warnings.add('единицы измерения в выводе пока не поддерживаются — числа показаны в СИ');
        } else node = { type: 'expr', expr: conv(st) };
        const latex = E.stmtToTex(node);
        if (/unsupported|\\text\{[a-zA-Z]+\}/.test(JSON.stringify(node))) warnings.add('часть операторов (программы, символика, блоки решений) пока не переносится');
        push({ kind: 'math', x, y, latex, stored });
      } catch (e) { push({ kind: 'text', x, y, text: '[формула не прочитана: ' + e.message + ']' }); }
      continue;
    }
    if (kind === 'plot') { push({ kind: 'note', x, y, text: '[график Mathcad — перенос графиков из .xmcd на этапе 3]' }); warnings.add('графики из файла пока показаны заглушкой'); continue; }
    if (kind === 'picture') {
      const png = body.getElementsByTagName('png')[0] || [...body.getElementsByTagNameNS ? body.getElementsByTagNameNS('*', 'png') : []][0];
      const id = png && png.getAttribute('item-idref'); const data = id && binItems[id];
      if (data) { const dw = parseFloat(png.getAttribute('display-width')) || 200, dh = parseFloat(png.getAttribute('display-height')) || 150; push({ kind: 'image', x, y, src: 'data:image/png;base64,' + data.replace(/\s+/g, ''), w: dw * 4 / 3, h: dh * 4 / 3, pt: true }); }
      else push({ kind: 'note', x, y, text: '[рисунок]' });
      continue;
    }
    push({ kind: 'note', x, y, text: '[' + kind + ' — пока не поддерживается]' }); warnings.add('встречены неподдерживаемые регионы: ' + kind);
  }
  // настройки листа: формат результатов и ORIGIN
  const settings = {};
  const gen = doc.getElementsByTagName('general')[0];
  if (gen) {
    const pr = parseInt(gen.getAttribute('precision')); if (isFinite(pr)) settings.decimals = pr;
    const et = parseInt(gen.getAttribute('exponential-threshold')); if (isFinite(et)) settings.expThreshold = et;
    const iv = gen.getAttribute('imaginary-value'); if (iv === 'i' || iv === 'j') settings.imagUnit = iv;
  }
  const biv = doc.getElementsByTagName('builtInVariables')[0];
  if (biv) { const o = parseInt(biv.getAttribute('array-origin')); if (isFinite(o)) settings.origin = o; }
  return { regions: out, warnings: [...warnings], settings };
}

// ───────── запись: дерево Матлиста → ml (math30.xsd) ─────────
const T = (typeof module !== 'undefined' && module.exports) ? require('./xmcd_template.js') : root.MatXmcdTemplate;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function mlId(name) {
  const us = name.indexOf('_'); const base = us >= 0 ? name.slice(0, us) : name; const sub = us >= 0 ? name.slice(us + 1) : null;
  return '<ml:id xml:space="preserve"' + (sub ? ' subscript="' + esc(sub) + '"' : '') + '>' + esc(base) + '</ml:id>';
}
function mlNum(v) {
  if (v < 0) return '<ml:apply><ml:neg/>' + mlNum(-v) + '</ml:apply>';
  let s = String(v); if (/e/i.test(s)) { const [m, e] = s.split(/e/i); return '<ml:apply><ml:mult style="default"/><ml:real>' + m + '</ml:real><ml:apply><ml:pow/><ml:real>10</ml:real>' + mlNum(parseInt(e)) + '</ml:apply></ml:apply>'; }
  return '<ml:real>' + s + '</ml:real>';
}
const OPS = { '+': 'plus', '-': 'minus', '·': 'mult style="default"', '/': 'div', '==': 'equal', '<': 'lessThan', '>': 'greaterThan', '≤': 'lessOrEqual', '≥': 'greaterOrEqual', '≠': 'notEqual', '∧': 'and', '∨': 'or', '⊕': 'xor', '±': 'plus' };
const SOLVER_HEADS = { Find: 'Find', find: 'Find', Minimize: 'Minimize', minimize: 'Minimize', Maximize: 'Maximize', maximize: 'Maximize', Minerr: 'Minerr', minerr: 'Minerr', Odesolve: 'Odesolve', odesolve: 'Odesolve', polyroots: 'polyroots' };
class Unsupported extends Error {}
function ml(n) {
  const ap = (op, ...a) => '<ml:apply><ml:' + op + '/>' + a.join('') + '</ml:apply>';
  const lam = (v, body) => '<ml:lambda><ml:boundVars>' + mlId(v) + '</ml:boundVars>' + ml(body) + '</ml:lambda>';
  const args = list => list.length === 1 ? ml(list[0]) : '<ml:sequence>' + list.map(ml).join('') + '</ml:sequence>';
  switch (n.type) {
    case 'num': return mlNum(n.v >= 1e306 ? 1e307 : n.v);
    case 'imag': return '<ml:imag symbol="i">' + n.v + '</ml:imag>';
    case 'str': return '<ml:str xml:space="preserve">' + esc(n.v) + '</ml:str>';
    case 'id': return mlId(n.name);
    case 'paren': return '<ml:parens>' + ml(n.e) + '</ml:parens>';
    case 'neg': return ap('neg', ml(n.e));
    case 'un': return ap('not', ml(n.e));
    case 'bin': { const op = OPS[n.op]; if (!op) throw new Unsupported(n.op); return '<ml:apply><ml:' + op + '/>' + ml(n.l) + ml(n.r) + '</ml:apply>'; }
    case 'pow': return ap('pow', ml(n.b), ml(n.e));
    case 'sqrt': return ap('sqrt', ml(n.e));
    case 'root': return ap('nthRoot', ml(n.n), ml(n.e));
    case 'abs': return ap('absval', ml(n.e));
    case 'fact': return ap('factorial', ml(n.e));
    case 'transpose': return ap('transpose', ml(n.e));
    case 'vectorize': return ap('vectorize', ml(n.e));
    case 'col': return ap('matcol', ml(n.e), ml(n.j));
    case 'sub': {
      if (!n.ix) throw new Unsupported('индекс');
      return ap('indexer', ml(n.e), args(n.ix));
    }
    case 'matrix': { const r = n.rows.length, c = n.rows[0].length; let out = ''; for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) out += ml(n.rows[i][j]); return '<ml:matrix rows="' + r + '" cols="' + c + '">' + out + '</ml:matrix>'; }
    case 'call': {
      if (SOLVER_HEADS[n.f]) return '<ml:apply><ml:' + SOLVER_HEADS[n.f] + '/>' + args(n.args) + '</ml:apply>';
      if (!n.args.length) throw new Unsupported('вызов без аргументов');
      return '<ml:apply>' + mlId(n.f) + args(n.args) + '</ml:apply>';
    }
    case 'range': return '<ml:range>' + (n.s ? '<ml:sequence>' + ml(n.a) + ml(n.s) + '</ml:sequence>' : ml(n.a)) + ml(n.b) + '</ml:range>';
    case 'int': if (!n.lo) throw new Unsupported('неопределённый интеграл'); return '<ml:apply><ml:integral auto-algorithm="true" algorithm="adaptive"/>' + lam(n.v, n.body) + '<ml:bounds>' + ml(n.lo) + ml(n.hi) + '</ml:bounds></ml:apply>';
    case 'deriv': return '<ml:apply><ml:derivative/>' + lam(n.v, n.e) + (n.order > 1 ? '<ml:degree>' + mlNum(n.order) + '</ml:degree>' : '') + '</ml:apply>';
    case 'sum': case 'prod': return '<ml:apply><ml:' + (n.type === 'sum' ? 'summation' : 'product') + '/>' + lam(n.v, n.body) + (n.from ? '<ml:bounds>' + ml(n.from) + ml(n.to) + '</ml:bounds>' : '') + '</ml:apply>';
  }
  throw new Unsupported(n.type);
}
function mlStatement(st) {
  if (st.type === 'define') {
    let lhs;
    if (st.lhs.type === 'call') lhs = '<ml:function>' + mlId(st.lhs.f) + '<ml:boundVars>' + st.lhs.args.map(a => mlId(a.name)).join('') + '</ml:boundVars></ml:function>';
    else lhs = ml(st.lhs);
    // определение с выводом (c := … =): Mathcad 15 оборачивает в ml:eval правую часть внутри define
    const rhs = st.sym ? '<ml:symEval>' + ml(st.rhs) + '</ml:symEval>' : st.show ? '<ml:eval>' + ml(st.rhs) + '</ml:eval>' : ml(st.rhs);
    return '<ml:' + (st.global ? 'globalDefine' : 'define') + '>' + lhs + rhs + '</ml:' + (st.global ? 'globalDefine' : 'define') + '>';
  }
  if (st.type === 'eval' && st.sym) return '<ml:symEval>' + ml(st.expr) + '</ml:symEval>';
  if (st.type === 'eval') return '<ml:eval placeholderMultiplicationStyle="default" resultMultiplicationStyle="default">' + ml(st.expr) + '</ml:eval>';
  if (st.type === 'expr') return ml(st.expr);
  throw new Unsupported('пустая формула');
}
function guid() { const h = () => Math.floor(Math.random() * 16).toString(16).toUpperCase(); const p = n => Array.from({ length: n }, h).join(''); return p(8) + '-' + p(4) + '-4' + p(3) + '-' + p(4) + '-' + p(12); }
// regions: [{ kind, x, y (px), latex | text, w?, h? (px) }], settings: { decimals, expThreshold, imagUnit, origin, title }
function exportXmcd(regions, settings, parse) {
  const PT = 4 / 3; settings = settings || {}; const notes = [];
  let head = T.HEAD.replace('{{TITLE}}', esc(settings.title || '')).replace('{{DOCID}}', guid()).replace('{{VERID}}', guid())
    .replace('{{PREC}}', settings.decimals != null ? settings.decimals : 3).replace('{{EXPTHR}}', settings.expThreshold != null ? settings.expThreshold : 3)
    .replace('{{IMAG}}', settings.imagUnit === 'j' ? 'j' : 'i').replace('{{ORIGIN}}', settings.origin || 0);
  let id = 1, out = ''; const items = [];
  let curHl = null;
  const reg = (x, y, w, h, body) => {
    const L = (x / PT).toFixed(2), Tp = (y / PT).toFixed(2), W = Math.max(10, w / PT).toFixed(2), H = Math.max(10, h / PT).toFixed(2), AY = (y / PT + Math.max(10, h / PT) * 0.6).toFixed(2);
    out += '\t\t<region region-id="' + (id++) + '" left="' + L + '" top="' + Tp + '" width="' + W + '" height="' + H + '" align-x="' + L + '" align-y="' + AY + '" show-border="false" show-highlight="' + (curHl ? 'true' : 'false') + '" is-protected="true" z-order="0" background-color="' + (curHl || 'inherit') + '" tag="">\n\t\t\t' + body + '\n\t\t</region>\n';
  };
  const text = (r, t, bold) => {
    const ps = String(t).split('\n').map(line => '<p style="Обычный" margin-left="inherit" margin-right="inherit" text-indent="inherit" text-align="left" list-style-type="inherit" tabs="inherit">' + (bold ? '<b>' + esc(line) + '</b>' : esc(line)) + '</p>').join('');
    reg(r.x, r.y, r.w || Math.min(500, 8 * String(t).length + 20), r.h || 18 * String(t).split('\n').length, '<text use-page-width="false" push-down="false" lock-width="' + (r.w ? 'true' : 'false') + '">' + ps + '</text>');
  };
  const sortedRegs = regions.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  // прогон листа ядром: нужен для систем уравнений (их решение — начальные приближения для Find в Mathcad)
  const runner = new E.SheetRunner(settings.origin || 0);
  const mathReg = (x, y, h, mlText) => reg(x, y, 140, h, '<math optimize="false" disable-calc="false">' + mlText + '</math>');
  const STEP = 26; // px между строками развёрнутой системы
  let shift = 0; // сдвиг вниз регионов после развёрнутых систем — чтобы не нарушить порядок вычисления
  for (const r0 of sortedRegs) {
    const r = Object.assign({}, r0, { y: r0.y + shift }); curHl = r.hl || null;
    if (r.kind === 'math') {
      if (!r.latex || !r.latex.trim()) continue;
      let st = null, sol = null;
      try { st = parse(r.latex); } catch (e) { notes.push('ошибка формулы: ' + e.message); text(r, '[Матлист: ' + r.latex + ']'); continue; }
      const envBefore = runner.env, inGiven = !!runner.given;
      try { const out = runner.step(st); if (out.value instanceof E.Sol) sol = out.value; } catch (e) { /* ошибка вычисления — формулу всё равно пишем */ }
      try {
        const sys = st.type === 'eval' && st.expr.type === 'system' ? st.expr : (st.type === 'define' && st.rhs.type === 'system' ? st.rhs : null);
        if (st.type === 'expr' && st.expr.type === 'system') { // система внутри Given — каждое уравнение отдельным регионом
          st.expr.eqs.forEach((e, k) => mathReg(r.x, r.y + k * STEP, 22, ml(e)));
          shift += (st.expr.eqs.length - 1) * STEP; continue;
        }
        if (sys) { // { … } = → приближения, Given, уравнения, Find
          let names = sol ? sol.names : null, vals = sol ? sol.vals : null;
          if (st.type === 'define') names = st.lhs.rows.map(row => row[0].type === 'id' ? row[0].name : row[0].e.name + '_' + row[0].raw);
          if (!names) names = [];
          if (!names.length) throw new Unsupported('система без решения');
          let y = r.y;
          names.forEach((nm, k) => { const g = vals ? vals[sol.names.indexOf(nm)] : 1; mathReg(r.x + (k % 3) * 120, y, 22, '<ml:define>' + mlId(nm) + mlNum(+(+g).toPrecision(6)) + '</ml:define>'); if (k % 3 === 2 || k === names.length - 1) y += STEP; });
          mathReg(r.x, y, 22, '<ml:id xml:space="preserve">Given</ml:id>'); y += STEP;
          sys.eqs.forEach(e => { mathReg(r.x, y, 22, ml(e)); y += STEP; });
          const find = '<ml:apply><ml:Find/>' + (names.length === 1 ? mlId(names[0]) : '<ml:sequence>' + names.map(mlId).join('') + '</ml:sequence>') + '</ml:apply>';
          if (st.type === 'define') mathReg(r.x, y, 40, '<ml:define>' + ml(st.lhs) + find + '</ml:define>');
          else mathReg(r.x, y, 40, '<ml:eval placeholderMultiplicationStyle="default" resultMultiplicationStyle="default">' + find + '</ml:eval>');
          shift += y - r.y + (names.length > 1 ? 30 : 0); notes.push('системы уравнений записаны как Given … Find');
          continue;
        }
        mathReg(r.x, r.y, r.h || 24, mlStatement(st));
      } catch (e) { notes.push((e instanceof Unsupported ? 'не переносится в .xmcd: ' : 'ошибка формулы: ') + e.message); text(r, '[Матлист: ' + r.latex + ']'); }
    } else if (r.kind === 'text') text(r, r.text || '', r.bold);
    else if (r.kind === 'note') text(r, r.text || '');
    else if (r.kind === 'plot') { notes.push('графики пока сохраняются в .xmcd как подпись'); text(r, '[график Матлиста: ' + (r.ys || '') + ' от ' + (r.xs || '') + ']'); }
    else if (r.kind === 'image') {
      if (!r.png) { notes.push('картинка не сохранена (не загрузилась)'); continue; }
      const item = items.length + 1; items.push('\t\t<item item-id="' + item + '">' + r.png + '</item>\n');
      reg(r.x, r.y, r.w, r.h, '<picture><png item-idref="' + item + '" display-width="' + (r.w / PT).toFixed(2) + '" display-height="' + (r.h / PT).toFixed(2) + '"/></picture>');
    }
  }
  const bin = items.length ? '\t<binaryContent>\n' + items.join('') + '\t</binaryContent>\n' : '';
  return { xml: head + out + '\t</regions>\n' + bin + '</worksheet>\n', notes: [...new Set(notes)] };
}

const api = { importXmcd, exportXmcd };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatXmcd = api;
})(typeof self !== 'undefined' ? self : this);
