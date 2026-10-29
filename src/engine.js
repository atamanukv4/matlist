// Матлист — вычислительное ядро: разбор LaTeX (из MathLive) в дерево, вычисление с семантикой Mathcad,
// форматирование результатов. Работает и в браузере, и в Node (для тестов).
(function (root) {
'use strict';

// ───────────────────────── Комплексные числа ─────────────────────────
class C { constructor(re, im) { this.re = re; this.im = im; } }
const isC = v => v instanceof C;
const isNum = v => typeof v === 'number' || isC(v);
const re = v => isC(v) ? v.re : v;
const im = v => isC(v) ? v.im : 0;
function mk(r, i) { return (i === 0 || Math.abs(i) < 1e-300) ? r : new C(r, i); }
function cadd(a, b) { return (typeof a === 'number' && typeof b === 'number') ? a + b : mk(re(a) + re(b), im(a) + im(b)); }
function csub(a, b) { return (typeof a === 'number' && typeof b === 'number') ? a - b : mk(re(a) - re(b), im(a) - im(b)); }
function cmul(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a * b;
  return mk(re(a) * re(b) - im(a) * im(b), re(a) * im(b) + im(a) * re(b));
}
function cdiv(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { if (b === 0) throw err('Деление на ноль'); return a / b; }
  const d = re(b) * re(b) + im(b) * im(b); if (d === 0) throw err('Деление на ноль');
  return mk((re(a) * re(b) + im(a) * im(b)) / d, (im(a) * re(b) - re(a) * im(b)) / d);
}
function cabs(a) { return typeof a === 'number' ? Math.abs(a) : Math.hypot(a.re, a.im); }
function carg(a) { return Math.atan2(im(a), re(a)); }
function cexp(a) { if (typeof a === 'number') return Math.exp(a); const e = Math.exp(a.re); return mk(e * Math.cos(a.im), e * Math.sin(a.im)); }
function cln(a) {
  if (typeof a === 'number' && a > 0) return Math.log(a);
  if (typeof a === 'number' && a === 0) throw err('ln(0) не определён');
  return mk(Math.log(cabs(a)), carg(a));
}
function cpow(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  }
  if (cabs(a) === 0) return 0;
  if (typeof b === 'number' && Number.isInteger(b) && Math.abs(b) <= 64) {
    let r = 1, x = a, n = Math.abs(b);
    while (n) { if (n & 1) r = cmul(r, x); x = cmul(x, x); n >>= 1; }
    return b < 0 ? cdiv(1, r) : r;
  }
  return cexp(cmul(b, cln(a)));
}
function csqrt(a) {
  if (typeof a === 'number') return a >= 0 ? Math.sqrt(a) : mk(0, Math.sqrt(-a));
  const r = cabs(a), t = carg(a) / 2, s = Math.sqrt(r); return mk(s * Math.cos(t), s * Math.sin(t));
}
function cneg(a) { return typeof a === 'number' ? -a : mk(-a.re, -a.im); }
function csin(a) { if (typeof a === 'number') return Math.sin(a); return mk(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im)); }
function ccos(a) { if (typeof a === 'number') return Math.cos(a); return mk(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im)); }

// ───────────────────────── Значения ─────────────────────────
class Mat { // матрица rows×cols, хранение по строкам
  constructor(r, c, a) { this.r = r; this.c = c; this.a = a || new Array(r * c).fill(0); }
  get(i, j) { return this.a[i * this.c + j]; }
  set(i, j, v) { this.a[i * this.c + j] = v; }
}
class Rng { constructor(vals) { this.vals = vals; } }
class Fn { constructor(params, body, env, name) { this.params = params; this.body = body; this.env = env; this.name = name; } }
class Str { constructor(s) { this.s = s; } }
class Sol { constructor(names, vals) { this.names = names; this.vals = vals; } } // решение системы: имена + значения

class MathErr extends Error { constructor(msg, node) { super(msg); this.node = node; } }
function err(m, n) { return new MathErr(m, n); }

// ───────────────────────── Разбор LaTeX ─────────────────────────
const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
};
const GREEK_TO_TEX = Object.fromEntries(Object.entries(GREEK).filter(([k]) => !['varepsilon', 'varphi', 'varrho'].includes(k)).map(([k, v]) => [v, '\\' + k]));
const FUNC_CMDS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'ln', 'log', 'lg',
  'exp', 'det', 'max', 'min', 'arg', 'tg', 'ctg', 'arctg', 'gcd', 'Re', 'Im', 'mod']);
const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'enspace', 'thinspace', 'medspace', 'thickspace']);

// Токенизатор LaTeX: команды, символы, группы {}
function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      let j = i + 1;
      if (/[A-Za-z]/.test(s[j] || '')) { while (j < s.length && /[A-Za-z]/.test(s[j])) j++; }
      else j++;
      t.push({ k: 'cmd', v: s.slice(i + 1, j) }); i = j; continue;
    }
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || '') && s[i - 1] !== '.')) {
      let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (s[j] === '.' && s[j + 1] !== '.') { j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      if ((s[j] === 'i' || s[j] === 'j') && !/[A-Za-z0-9]/.test(s[j + 1] || '')) { t.push({ k: 'imag', v: s.slice(i, j) }); i = j + 1; continue; }
      t.push({ k: 'num', v: s.slice(i, j) }); i = j; continue;
    }
    if (ch === '.' && s[i + 1] === '.') { t.push({ k: 'op', v: '..' }); i += 2; while (s[i] === '.') i++; continue; }
    if (ch === ':' && s[i + 1] === '=') { t.push({ k: 'op', v: ':=' }); i += 2; continue; }
    if (ch === '<' && s[i + 1] === '=') { t.push({ k: 'op', v: '≤' }); i += 2; continue; }
    if (ch === '>' && s[i + 1] === '=') { t.push({ k: 'op', v: '≥' }); i += 2; continue; }
    t.push({ k: 'ch', v: ch }); i++;
  }
  return t;
}

class Parser {
  constructor(src) { this.src = src; this.t = tokenize(src); this.p = 0; this.normalize(); }
  // заменить пробелы-команды, \left/\right, греческие буквы на символы
  normalize() {
    const out = [];
    for (let i = 0; i < this.t.length; i++) {
      const x = this.t[i];
      if (x.k === 'cmd') {
        if (SPACES.has(x.v) || x.v === 'displaystyle' || x.v === 'limits' || x.v === 'nolimits') continue;
        if (x.v === 'left' || x.v === 'right' || x.v === 'bigl' || x.v === 'bigr' || x.v === 'Bigl' || x.v === 'Bigr') {
          const nx = this.t[i + 1];
          if (nx && nx.k === 'cmd' && nx.v === '.') { i++; continue; } // \left. пустая скобка
          continue;
        }
        if (GREEK[x.v]) { out.push({ k: 'ch', v: GREEK[x.v] }); continue; }
        const map = {
          cdot: '·', times: '×', div: '÷', ast: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', lt: '<', gt: '>',
          coloneq: ':=', coloneqq: ':=', equiv: '≡', land: '∧', wedge: '∧', lor: '∨', vee: '∨', neg: '¬', lnot: '¬', lbrack: '[', rbrack: ']',
          lbrace: '{', rbrace: '}', vert: '|', lvert: '|', rvert: '|', mid: '|', infty: '∞', prime: "'", ldots: '..', dots: '..', cdots: '..',
          to: '→', rightarrow: '→', '%': '%', '{': '{', '}': '}', '_': '_', imaginaryI: 'i', exponentialE: 'e', differentialD: 'ⅆ', pm: '±',
          langle: '⟨', rangle: '⟩', degree: '°', circ: '°', oplus: '⊕', placeholder: '■'
        };
        if (map[x.v] !== undefined) {
          const v = map[x.v];
          if (['·', '×', '÷', '≤', '≥', '≠', '<', '>', ':=', '≡', '∧', '∨', '¬', '..', '→', '±', '⊕'].includes(v)) out.push({ k: 'op', v });
          else out.push({ k: 'ch', v });
          if (x.v === 'placeholder') { // \placeholder{} — пропустить {}
            if (this.t[i + 1] && this.t[i + 1].v === '{') { let d = 0, j = i + 1; for (; j < this.t.length; j++) { if (this.t[j].v === '{') d++; if (this.t[j].v === '}') { d--; if (!d) break; } } i = j; }
          }
          continue;
        }
      }
      out.push(x);
    }
    this.t = out;
  }
  peek(o = 0) { return this.t[this.p + o]; }
  next() { return this.t[this.p++]; }
  is(v, o = 0) { const x = this.peek(o); return x && x.v === v && x.k !== 'num'; }
  isCmd(v) { const x = this.peek(); return x && x.k === 'cmd' && x.v === v; }
  expect(v) { const x = this.next(); if (!x || x.v !== v) throw err('Ожидалось «' + v + '»'); return x; }
  eof() { return this.p >= this.t.length; }

  // {…} или одиночный токен как подвыражение
  groupTokens() {
    const x = this.peek();
    if (!x) throw err('Пустое место в формуле');
    if (x.v === '{' && x.k === 'ch') {
      this.next(); const st = this.p; let d = 1;
      while (!this.eof()) { const y = this.next(); if (y.k === 'ch' && y.v === '{') d++; if (y.k === 'ch' && y.v === '}') { d--; if (!d) return this.t.slice(st, this.p - 1); } }
      throw err('Нет закрывающей скобки }');
    }
    if (x.k === 'num' && x.v.length > 1) { // \frac14, x^23: в TeX аргумент без скобок — один символ
      this.t[this.p] = { k: 'num', v: x.v.slice(1) }; return [{ k: 'num', v: x.v[0] }];
    }
    this.next(); return [x];
  }
  sub(tokens) { const p = new Parser(''); p.t = tokens; p.p = 0; return p; }
  groupExpr() { const toks = this.groupTokens(); const p = this.sub(toks); const e = p.parseExpr(); if (!p.eof()) throw err('Лишние символы в группе'); return e; }
  groupRaw(toks) { // текст группы как строка (для литерального индекса)
    return toks.map(x => x.k === 'cmd' ? (x.v === 'mathrm' || x.v === 'text' || x.v === 'mathit' || x.v === 'operatorname' ? '' : '\\' + x.v) : (x.v === '{' || x.v === '}' ? '' : x.v)).join('');
  }

  // statement: lhs := rhs [=] | lhs ≡ rhs | expr = | expr
  parseStatement() {
    if (this.eof()) return { type: 'empty' };
    // найти := или ≡ на верхнем уровне
    let d = 0, defAt = -1, defOp = null;
    for (let i = 0; i < this.t.length; i++) {
      const x = this.t[i];
      if (x.k === 'ch' && (x.v === '{' || x.v === '(' || x.v === '[')) d++;
      if (x.k === 'ch' && (x.v === '}' || x.v === ')' || x.v === ']')) d--;
      if (d === 0 && x.k === 'op' && (x.v === ':=' || x.v === '≡')) { defAt = i; defOp = x.v; break; }
    }
    let showAfter = false, sym = false;
    const last = this.t[this.t.length - 1];
    if (last && last.k === 'ch' && last.v === '=') { this.t.pop(); showAfter = true; }
    else if (last && last.k === 'op' && last.v === '→') { this.t.pop(); showAfter = true; sym = true; } // «→» Mathcad: значение показывается и наследуется
    if (defAt >= 0) {
      const lp = this.sub(this.t.slice(0, defAt)); const lhs = lp.parseExpr(); if (!lp.eof()) throw err('Неверная левая часть определения');
      const rp = this.sub(this.t.slice(defAt + 1)); const rhs = rp.parseRangeOrExpr(); if (!rp.eof()) throw err('Не удалось разобрать: ' + rp.restText());
      const st = { type: 'define', global: defOp === '≡', lhs, rhs, show: showAfter }; if (sym) st.sym = true; return st;
    }
    const e = this.parseExpr(); if (!this.eof()) throw err('Не удалось разобрать: ' + this.restText());
    if (sym) return { type: 'eval', expr: e, sym: true };
    return showAfter ? { type: 'eval', expr: e } : { type: 'expr', expr: e };
  }
  restText() { return this.t.slice(this.p).map(x => x.v).join(' ').slice(0, 30); }
  // a..b  или  a, b..c
  parseRangeOrExpr() {
    const st = this.p;
    const a = this.parseExpr();
    if (this.is('..') ) { this.next(); const b = this.parseExpr(); return { type: 'range', a, b }; }
    if (this.is(',')) {
      const save = this.p; this.next();
      const s = this.parseExpr();
      if (this.is('..')) { this.next(); const b = this.parseExpr(); return { type: 'range', a, s, b }; }
      this.p = save;
    }
    return a;
  }
  parseExpr() { return this.parseOr(); }
  parseOr() { let l = this.parseAnd(); while (this.is('∨') || this.is('⊕')) { const o = this.next().v; l = { type: 'bin', op: o, l, r: this.parseAnd() }; } return l; }
  parseAnd() { let l = this.parseNot(); while (this.is('∧')) { this.next(); l = { type: 'bin', op: '∧', l, r: this.parseNot() }; } return l; }
  parseNot() { if (this.is('¬')) { this.next(); return { type: 'un', op: '¬', e: this.parseNot() }; } return this.parseCmp(); }
  parseCmp() {
    let l = this.parseAdd();
    while (this.is('<') || this.is('>') || this.is('≤') || this.is('≥') || this.is('≠') || (this.is('=') && this.peek(1))) {
      const o = this.next().v; l = { type: 'bin', op: o === '=' ? '==' : o, l, r: this.parseAdd() };
    }
    return l;
  }
  parseAdd() {
    let l;
    if (this.is('-') || this.is('−')) { this.next(); l = { type: 'neg', e: this.parseMul() }; }
    else if (this.is('+')) { this.next(); l = this.parseMul(); }
    else l = this.parseMul();
    while (this.is('+') || this.is('-') || this.is('−') || this.is('±')) {
      const o = this.next().v; const r = this.parseMul(); l = { type: 'bin', op: o === '−' ? '-' : o, l, r };
    }
    return l;
  }
  startsPrimary() {
    const x = this.peek(); if (!x) return false;
    if (x.k === 'num' || x.k === 'imag') return true;
    if (x.k === 'op') return false;
    if (x.k === 'cmd') return !['end', '\\', 'right'].includes(x.v) && x.v !== '&';
    if (x.k === 'ch') return !['+', '-', '−', ')', ']', '}', ',', '=', '|', '&', '^', '_', '!', "'", '<', '>', '%', '.', ';'].includes(x.v);
    return false;
  }
  parseMul() {
    let l = this.parseUnary();
    for (;;) {
      if (this.is('·') || this.is('×') || this.is('*')) { this.next(); l = { type: 'bin', op: '·', l, r: this.parseUnary() }; continue; }
      if (this.is('/') || this.is('÷')) { this.next(); l = { type: 'bin', op: '/', l, r: this.parseUnary() }; continue; }
      if (this.is('|') && this.absOpensHere()) { l = { type: 'bin', op: '·', l, r: this.parseUnary(), imp: true }; continue; }
      if (this.startsPrimary()) { l = { type: 'bin', op: '·', l, r: this.parseUnary(), imp: true }; continue; }
      break;
    }
    return l;
  }
  absOpensHere() { // «|» начинает модуль, если дальше есть парная «|»
    let d = 0;
    for (let i = this.p + 1; i < this.t.length; i++) { const x = this.t[i]; if (x.v === '{' || x.v === '(') d++; if (x.v === '}' || x.v === ')') d--; if (d < 0) return false; if (d === 0 && x.v === '|') return true; }
    return false;
  }
  parseUnary() {
    if (this.is('-') || this.is('−')) { this.next(); return { type: 'neg', e: this.parseUnary() }; }
    if (this.is('+')) { this.next(); return this.parseUnary(); }
    return this.parsePostfix();
  }
  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      if (this.is('^')) {
        this.next(); const toks = this.groupTokens();
        // M^{⟨j⟩} — столбец
        if (toks.length >= 3 && toks[0].v === '⟨' && toks[toks.length - 1].v === '⟩') { const p = this.sub(toks.slice(1, -1)); e = { type: 'col', e, j: p.parseExpr() }; continue; }
        if (toks.length === 1 && toks[0].v === 'T') { e = { type: 'transpose', e }; continue; }
        if (toks.length && toks.every(t => t.v === "'") && e.type === 'id') { e = { type: 'id', name: e.name + "'".repeat(toks.length) }; continue; }
        const p = this.sub(toks); const ex = p.parseExpr(); if (!p.eof()) throw err('Ошибка в показателе степени');
        e = { type: 'pow', b: e, e: ex }; continue;
      }
      if (this.is('_')) {
        this.next(); const toks = this.groupTokens();
        const lit = toks.length && toks[0].k === 'cmd' && (toks[0].v === 'mathrm' || toks[0].v === 'text');
        const raw = this.groupRaw(toks);
        if (lit || e.type !== 'id') {
          if (e.type === 'id') { e = { type: 'id', name: e.name + '_' + raw }; continue; }
        }
        let ix = null; try { const p = this.sub(toks); const tmp = []; tmp.push(p.parseExpr()); while (p.is(',')) { p.next(); tmp.push(p.parseExpr()); } if (p.eof()) ix = tmp; } catch (x) { ix = null; }
        e = { type: 'sub', e, raw: raw.replace(/\s/g, ''), ix }; continue;
      }
      if (this.is('!')) { this.next(); e = { type: 'fact', e }; continue; }
      if (this.is("'")) { this.next(); if (e.type === 'id') e = { type: 'id', name: e.name + "'" }; continue; }
      if (this.is('%')) { this.next(); e = { type: 'bin', op: '·', l: e, r: { type: 'num', v: 0.01 } }; continue; }
      if (this.is('°')) { this.next(); e = { type: 'bin', op: '·', l: e, r: { type: 'num', v: Math.PI / 180 } }; continue; }
      if (this.is('(') && (e.type === 'id')) { this.next(); const args = this.parseArgs(')'); e = { type: 'call', f: e.name, args }; continue; }
      break;
    }
    return e;
  }
  parseArgs(close) {
    const args = [];
    if (this.is(close)) { this.next(); return args; }
    for (;;) { args.push(this.parseRangeOrExpr()); if (this.is(',') || this.is(';')) { this.next(); continue; } this.expect(close); return args; }
  }
  readIdent(first) { // буквы/цифры подряд — одно имя (как в Mathcad)
    let name = first;
    while (!this.eof()) {
      const x = this.peek();
      if (x.k === 'ch' && /^[A-Za-zА-Яа-яЁё0-9α-ωΑ-Ωϑϱς]$/.test(x.v)) { name += x.v; this.next(); continue; }
      if (x.k === 'num' && /^[0-9]+$/.test(x.v)) { name += x.v; this.next(); continue; }
      break;
    }
    return name;
  }
  parsePrimary() {
    const x = this.next();
    if (!x) throw err('Формула не закончена');
    if (x.k === 'num') return { type: 'num', v: parseFloat(x.v) };
    if (x.k === 'imag') return { type: 'imag', v: parseFloat(x.v) };
    if (x.k === 'ch') {
      if (x.v === '■') throw err('Заполните пустое место ■');
      if (x.v === '(') { const e = this.parseExpr(); if (this.is(',')) { /* кортеж не поддерживается */ } this.expect(')'); return { type: 'paren', e }; }
      if (x.v === '[') { const e = this.parseExpr(); this.expect(']'); return { type: 'paren', e }; }
      if (x.v === '{') { this.p--; const toks = this.groupTokens(); const p = this.sub(toks); const e = p.parseRangeOrExpr(); if (!p.eof()) throw err('Не удалось разобрать: ' + p.restText()); return e; }
      if (x.v === '|') { const e = this.parseExpr(); this.expect('|'); return { type: 'abs', e }; }
      if (x.v === '∞') return { type: 'num', v: 1e307 };
      if (x.v === 'ⅆ') throw err('Неожиданный дифференциал d');
      if (/^[A-Za-zА-Яа-яЁёα-ωΑ-Ωϑϱς]$/.test(x.v)) return { type: 'id', name: this.readIdent(x.v) };
      if (x.v === '"') { let s = ''; while (!this.eof() && !this.is('"')) s += this.next().v; this.expect('"'); return { type: 'str', v: s }; }
      throw err('Неожиданный символ «' + x.v + '»');
    }
    if (x.k === 'cmd') {
      const c = x.v;
      if (c === 'frac' || c === 'dfrac' || c === 'tfrac' || c === 'cfrac') {
        const nt = this.groupTokens(), dt = this.groupTokens();
        const d = this.derivFrac(nt, dt); if (d) return d;
        const np = this.sub(nt), dp = this.sub(dt);
        const n = np.parseExpr(), de = dp.parseExpr();
        if (!np.eof() || !dp.eof()) throw err('Ошибка в дроби');
        return { type: 'bin', op: '/', l: n, r: de, frac: true };
      }
      if (c === 'sqrt') {
        if (this.is('[')) { this.next(); const st = this.p; let d = 1; while (!this.eof()) { const y = this.next(); if (y.v === '[') d++; if (y.v === ']') { d--; if (!d) break; } } const p = this.sub(this.t.slice(st, this.p - 1)); const n = p.parseExpr(); return { type: 'root', n, e: this.groupExpr() }; }
        return { type: 'sqrt', e: this.groupExpr() };
      }
      if (c === 'mathrm' || c === 'text' || c === 'mathit' || c === 'operatorname' || c === 'mathbf' || c === 'mathsf' || c === 'textrm' || c === 'mathnormal') {
        const toks = this.groupTokens(); const raw = this.groupRaw(toks); const name = raw.replace(/\s/g, '');
        if ((c === 'text' || c === 'textrm') && /^["“«”]/.test(raw.trim())) return { type: 'str', v: raw.trim().replace(/^["“«”]|["”»“]$/g, '') };
        if ((c === 'text' || c === 'textrm') && /[:;%{}]/.test(raw)) return { type: 'str', v: raw.trim() };
        if (!name) throw err('Пустое имя');
        if (name === 'd' && this.peek() && (this.peek().k === 'ch')) { /* «d x» вне интеграла */ }
        return { type: 'id', name: this.readIdent(name) };
      }
      if (c === 'pi') return { type: 'id', name: 'π' };
      if (FUNC_CMDS.has(c)) {
        const name = { tg: 'tan', ctg: 'cot', arctg: 'atan', arcsin: 'asin', arccos: 'acos', arctan: 'atan', lg: 'log' }[c] || c;
        if (this.is('(')) { this.next(); return { type: 'call', f: name, args: this.parseArgs(')') }; }
        if (this.is('^')) { // sin^2 x
          this.next(); const pw = this.groupExpr(); const a = this.parseUnary();
          return { type: 'pow', b: { type: 'call', f: name, args: [a] }, e: pw };
        }
        return { type: 'call', f: name, args: [this.parseUnary()] };
      }
      if (c === 'int') return this.parseInt();
      if (c === 'sum' || c === 'prod') return this.parseBig(c);
      if (c === 'lim') throw err('Пределы — в версии v2 (символьный модуль)');
      if (c === 'begin') return this.parseEnv();
      if (c === 'overrightarrow' || c === 'vec') return { type: 'vectorize', e: this.groupExpr() };
      if (c === 'differentialD') throw err('Неожиданный дифференциал');
      throw err('Неизвестная команда \\' + c);
    }
    if (x.k === 'op' && x.v === '¬') return { type: 'un', op: '¬', e: this.parseUnary() };
    throw err('Неожиданное «' + x.v + '»');
  }
  isD(tok) { return tok && ((tok.k === 'ch' && (tok.v === 'd' || tok.v === 'ⅆ'))); }
  stripD(toks) { // [\mathrm{d}] или d → убрать
    if (toks.length && toks[0].k === 'cmd' && (toks[0].v === 'mathrm' || toks[0].v === 'text')) {
      // \mathrm { d }
      if (toks[1] && toks[1].v === '{' && toks[2] && (toks[2].v === 'd') && toks[3] && toks[3].v === '}') return toks.slice(4);
      if (toks[1] && toks[1].v === 'd') return toks.slice(2);
    }
    if (this.isD(toks[0])) return toks.slice(1);
    return null;
  }
  derivFrac(nt, dt) { // \frac{d}{dx} или \frac{d^n}{dx^n}
    const n1 = this.stripD(nt); if (!n1) return null;
    let order = 1;
    if (n1.length) { if (n1[0].v === '^') { const p = this.sub(n1.slice(1)); const o = p.groupTokens(); order = parseInt(this.groupRaw(o)) || 1; } else return null; }
    const d1 = this.stripD(dt); if (!d1 || !d1.length) return null;
    let toks = d1; let vtoks = [];
    for (let i = 0; i < toks.length; i++) { if (toks[i].v === '^') break; vtoks.push(toks[i]); }
    const vp = this.sub(vtoks); const v = vp.parsePrimary();
    let vname = v.type === 'id' ? v.name : null;
    if (vp.is('_')) { vp.next(); const g = vp.groupTokens(); vname += '_' + this.groupRaw(g); }
    if (!vname) throw err('Неверная переменная дифференцирования');
    const body = this.parseUnary();
    return { type: 'deriv', v: vname, order, e: body };
  }
  parseInt() {
    let lo = null, hi = null;
    for (let k = 0; k < 2; k++) {
      if (this.is('_')) { this.next(); lo = this.groupExpr(); }
      else if (this.is('^')) { this.next(); hi = this.groupExpr(); }
    }
    // тело до d<var>
    const st = this.p; let d = 0, dAt = -1;
    for (let i = this.p; i < this.t.length; i++) {
      const x = this.t[i];
      if (x.v === '{' || x.v === '(') d++; if (x.v === '}' || x.v === ')') d--;
      if (d < 0) break;
      if (d === 0 && (this.isD(x) || (x.k === 'cmd' && (x.v === 'mathrm' || x.v === 'text') && this.t[i + 1] && this.t[i + 1].v === '{' && this.t[i + 2] && this.t[i + 2].v === 'd' && this.t[i + 3] && this.t[i + 3].v === '}'))) {
        const after = x.k === 'cmd' ? this.t[i + 4] : this.t[i + 1];
        if (after && after.k === 'ch' && /^[A-Za-zА-Яа-яα-ω]$/.test(after.v)) { dAt = i; if (x.k === 'cmd' || (i > st)) break; }
      }
    }
    if (dAt < 0) throw err('В интеграле нет «d x»');
    const bp = this.sub(this.t.slice(st, dAt)); const body = bp.parseExpr(); if (!bp.eof()) throw err('Ошибка в подынтегральном выражении');
    this.p = dAt + (this.t[dAt].k === 'cmd' ? 4 : 1);
    const vx = this.next(); let v = vx.v;
    if (this.is('_')) { this.next(); v += '_' + this.groupRaw(this.groupTokens()); }
    return { type: 'int', lo, hi, body, v };
  }
  parseBig(c) {
    let lo = null, hi = null;
    for (let k = 0; k < 2; k++) {
      if (this.is('_')) { this.next(); lo = this.groupTokens(); }
      else if (this.is('^')) { this.next(); hi = this.groupExpr(); }
    }
    if (!lo) throw err('У ' + (c === 'sum' ? 'Σ' : 'Π') + ' нет переменной');
    let v, from = null;
    const eq = lo.findIndex(x => x.v === '=');
    if (eq >= 0) { v = this.groupRaw(lo.slice(0, eq)).replace(/\s/g, ''); const p = this.sub(lo.slice(eq + 1)); from = p.parseExpr(); }
    else v = this.groupRaw(lo).replace(/\s/g, '');
    const body = this.parseMulOnly();
    return { type: c, v, from, to: hi, body };
  }
  parseMulOnly() { // тело Σ: до + или − верхнего уровня
    return this.parseMul();
  }
  parseEnv() {
    const nameT = this.groupTokens(); const name = this.groupRaw(nameT);
    const rows = [[[]]];
    let d = 0;
    while (!this.eof()) {
      const x = this.peek();
      if (d === 0 && x.k === 'cmd' && x.v === 'end') { this.next(); this.groupTokens(); break; }
      this.next();
      if (x.k === 'cmd' && x.v === 'begin') d++;
      if (x.k === 'cmd' && x.v === 'end') d--;
      if (d === 0 && x.k === 'ch' && x.v === '&') { rows[rows.length - 1].push([]); continue; }
      if (d === 0 && x.k === 'cmd' && x.v === '\\') { rows.push([[]]); continue; }
      rows[rows.length - 1][rows[rows.length - 1].length - 1].push(x);
    }
    while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0].length === 0) rows.pop();
    if (/cases/.test(name)) { // система уравнений: строки — уравнения/неравенства, столбцы & — выравнивание
      const eqs = rows.map(r => [].concat(...r)).filter(t => t.length).map(toks => { const p = this.sub(toks); const e = p.parseExpr(); if (!p.eof()) throw err('Ошибка в уравнении системы'); return e; });
      if (!eqs.length) throw err('Система пуста');
      return { type: 'system', eqs };
    }
    const cells = rows.map(r => r.map(toks => { const p = this.sub(toks); const e = p.parseExpr(); if (!p.eof()) throw err('Ошибка в элементе матрицы'); return e; }));
    const nc = Math.max(...cells.map(r => r.length));
    if (cells.some(r => r.length !== nc)) throw err('Строки матрицы разной длины');
    return { type: 'matrix', rows: cells };
  }
}

function parse(latex) { return new Parser(latex).parseStatement(); }
function parseList(latex) { // «a, b, c» → [дерево, …] (оси графика)
  const p = new Parser(latex); if (p.eof()) return [];
  const out = [p.parseExpr()]; while (p.is(',') || p.is(';')) { p.next(); out.push(p.parseExpr()); }
  if (!p.eof()) throw err('Не удалось разобрать: ' + p.restText()); return out;
}

// ───────────────────────── Вычисление ─────────────────────────
class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
  get(n) { for (let e = this; e; e = e.parent) if (e.vars.has(n)) return e.vars.get(n); return undefined; }
  has(n) { for (let e = this; e; e = e.parent) if (e.vars.has(n)) return true; return false; }
  set(n, v) { this.vars.set(n, v); }
  child() { return new Env(this); }
}

const CONSTS = { 'π': Math.PI, e: Math.E, i: new C(0, 1), j: new C(0, 1), g: 9.80665, ORIGIN: 0, TOL: 1e-3, CTOL: 1e-3 };

function toNum(v, what) {
  if (typeof v === 'number') return v;
  if (isC(v)) { if (Math.abs(v.im) < 1e-12 * Math.max(1, Math.abs(v.re))) return v.re; throw err((what || 'Значение') + ' должно быть вещественным'); }
  if (v instanceof Mat) { if (v.r === 1 && v.c === 1) return toNum(v.a[0], what); throw err((what || 'Значение') + ' должно быть скаляром, а не матрицей'); }
  if (v instanceof Rng) throw err('Ранжированная переменная здесь не допускается');
  throw err((what || 'Значение') + ' должно быть числом');
}
function toInt(v, what) { const x = toNum(v, what); if (!Number.isInteger(Math.round(x * 1e9) / 1e9)) throw err((what || 'Индекс') + ' должен быть целым'); return Math.round(x); }
function asMat(v) { if (v instanceof Mat) return v; if (isNum(v)) return new Mat(1, 1, [v]); throw err('Ожидалась матрица'); }
function vecOf(v) { const m = asMat(v); if (m.c !== 1 && m.r !== 1) throw err('Ожидался вектор'); return m.a.slice(); }
function colVec(arr) { return new Mat(arr.length, 1, arr.slice()); }

// поэлементные операции
function elementwise(a, b, f, name) {
  if (a instanceof Mat && b instanceof Mat) {
    if (a.r !== b.r || a.c !== b.c) throw err('Размеры матриц не совпадают (' + a.r + '×' + a.c + ' и ' + b.r + '×' + b.c + ')');
    return new Mat(a.r, a.c, a.a.map((x, k) => f(x, b.a[k])));
  }
  if (a instanceof Mat) { if (name === '+' || name === '-') throw err('Нельзя складывать матрицу и скаляр'); return new Mat(a.r, a.c, a.a.map(x => f(x, b))); }
  if (b instanceof Mat) { if (name === '+' || name === '-') throw err('Нельзя складывать матрицу и скаляр'); return new Mat(b.r, b.c, b.a.map(x => f(a, x))); }
  return f(a, b);
}
function matmul(a, b) {
  if (a.c !== b.r) {
    if (a.c === 1 && b.c === 1 && a.r === b.r) { let s = 0; for (let k = 0; k < a.r; k++) s = cadd(s, cmul(a.a[k], b.a[k])); return s; } // скалярное произведение
    throw err('Нельзя перемножить ' + a.r + '×' + a.c + ' и ' + b.r + '×' + b.c);
  }
  const m = new Mat(a.r, b.c);
  for (let i = 0; i < a.r; i++) for (let j = 0; j < b.c; j++) { let s = 0; for (let k = 0; k < a.c; k++) s = cadd(s, cmul(a.get(i, k), b.get(k, j))); m.set(i, j, s); }
  return m;
}
function transpose(a) { const m = new Mat(a.c, a.r); for (let i = 0; i < a.r; i++) for (let j = 0; j < a.c; j++) m.set(j, i, a.get(i, j)); return m; }
function identity(n) { const m = new Mat(n, n); for (let i = 0; i < n; i++) m.set(i, i, 1); return m; }
function luSolve(A, B) { // решение A·X = B, возвращает X; кидает при вырожденности
  const n = A.r; if (A.c !== n) throw err('Матрица должна быть квадратной');
  const a = A.a.slice(), b = B.a.slice(), m = B.c;
  for (let k = 0; k < n; k++) {
    let p = k, mx = cabs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = cabs(a[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (mx < 1e-14) throw err('Матрица вырождена');
    if (p !== k) { for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; } for (let j = 0; j < m; j++) { const t = b[k * m + j]; b[k * m + j] = b[p * m + j]; b[p * m + j] = t; } }
    for (let i = k + 1; i < n; i++) {
      const f = cdiv(a[i * n + k], a[k * n + k]); if (cabs(f) === 0) continue;
      for (let j = k; j < n; j++) a[i * n + j] = csub(a[i * n + j], cmul(f, a[k * n + j]));
      for (let j = 0; j < m; j++) b[i * m + j] = csub(b[i * m + j], cmul(f, b[k * m + j]));
    }
  }
  const x = new Array(n * m).fill(0);
  for (let j = 0; j < m; j++) for (let i = n - 1; i >= 0; i--) {
    let s = b[i * m + j]; for (let k = i + 1; k < n; k++) s = csub(s, cmul(a[i * n + k], x[k * m + j]));
    x[i * m + j] = cdiv(s, a[i * n + i]);
  }
  return new Mat(n, m, x);
}
function det(A) {
  const n = A.r; if (A.c !== n) throw err('Определитель — только для квадратной матрицы');
  const a = A.a.slice(); let d = 1;
  for (let k = 0; k < n; k++) {
    let p = k, mx = cabs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = cabs(a[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (mx === 0) return 0;
    if (p !== k) { for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; } d = cneg(d); }
    d = cmul(d, a[k * n + k]);
    for (let i = k + 1; i < n; i++) { const f = cdiv(a[i * n + k], a[k * n + k]); for (let j = k; j < n; j++) a[i * n + j] = csub(a[i * n + j], cmul(f, a[k * n + j])); }
  }
  return d;
}

// численные методы
function brent(f, a, b, tol) {
  let fa = f(a), fb = f(b);
  if (fa === 0) return a; if (fb === 0) return b;
  if (fa * fb > 0) throw err('На концах интервала функция одного знака — корня может не быть');
  let c = a, fc = fa, d = b - a, e = d;
  for (let it = 0; it < 200; it++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * 1e-15 * Math.abs(b) + 0.5 * tol, xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let s = fb / fa, p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else { const r = fb / fc; q = fa / fc; p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb; b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1); fb = f(b);
  }
  return b;
}
function secantRoot(f, x0) {
  let x1 = x0 === 0 ? 1e-4 : x0 * 1.0001 + 1e-6, f0 = f(x0), f1 = f(x1);
  for (let it = 0; it < 200; it++) {
    if (Math.abs(f1) < 1e-14) return x1;
    const den = f1 - f0; if (den === 0) break;
    let x2 = x1 - f1 * (x1 - x0) / den;
    if (!isFinite(x2)) break;
    x0 = x1; f0 = f1; x1 = x2; f1 = f(x1);
    if (Math.abs(x1 - x0) < 1e-13 * Math.max(1, Math.abs(x1))) return x1;
  }
  if (Math.abs(f1) < 1e-6) return x1;
  throw err('root не сошёлся — задайте другое начальное приближение или интервал');
}
function integrate(f, a, b) { // адаптивная Гаусс–Кронрод 7-15
  const xk = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0];
  const wk = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728];
  const wg = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];
  function gk(a, b) {
    const c = (a + b) / 2, h = (b - a) / 2; let k = wk[7] * f(c), g = wg[3] * f(c);
    for (let i = 0; i < 7; i++) { const dx = h * xk[i]; const s = f(c - dx) + f(c + dx); k += wk[i] * s; if (i % 2 === 1) g += wg[(i - 1) / 2] * s; }
    return [k * h, Math.abs((k - g) * h)];
  }
  let total = 0, depth = 0;
  function rec(a, b, whole, tol, lvl) {
    const m = (a + b) / 2; const [l, el] = gk(a, m), [r, er] = gk(m, b);
    if (lvl > 40 || el + er <= tol || Math.abs(b - a) < 1e-14) return l + r;
    return rec(a, m, l, tol / 2, lvl + 1) + rec(m, b, r, tol / 2, lvl + 1);
  }
  if (a === b) return 0;
  // бесконечные пределы — замена переменной
  const INF = 1e300;
  if (Math.abs(a) >= INF || Math.abs(b) >= INF) {
    const g = f; const sgn = a > b ? -1 : 1; let lo = Math.min(a, b), hi = Math.max(a, b);
    const tf = t => { const x = t / (1 - t * t); const dx = (1 + t * t) / ((1 - t * t) ** 2); return g(x) * dx; };
    const tlo = lo <= -INF ? -1 : (Math.abs(lo) < 1e-300 ? 0 : (-1 + Math.sqrt(1 + 4 * lo * lo)) / (2 * lo));
    const thi = hi >= INF ? 1 : (Math.abs(hi) < 1e-300 ? 0 : (-1 + Math.sqrt(1 + 4 * hi * hi)) / (2 * hi));
    f = tf; const eps = 1e-9;
    const [w] = gk(tlo + eps, thi - eps);
    return sgn * rec(tlo + eps, thi - eps, w, 1e-10, 0);
  }
  const [w, e] = gk(a, b);
  total = rec(a, b, w, Math.max(1e-11, Math.abs(w) * 1e-12), 0);
  return total;
}
function derivative(f, x, order) { // центральные разности с экстраполяцией Ричардсона
  if (order === 0) return f(x);
  if (order > 1) return derivative(t => derivative(f, t, order - 1), x, 1);
  let h = 1e-2 * Math.max(1, Math.abs(x));
  const D = [];
  for (let i = 0; i < 6; i++) { D.push([(f(x + h) - f(x - h)) / (2 * h)]); h /= 2; }
  for (let k = 1; k < 6; k++) for (let i = k; i < 6; i++) D[i][k] = D[i][k - 1] + (D[i][k - 1] - D[i - 1][k - 1]) / (Math.pow(4, k) - 1);
  return D[5][5];
}
function polyroots(coef) { // Durand–Kerner, коэффициенты по возрастанию степени (как в Mathcad)
  let c = coef.slice(); while (c.length > 1 && cabs(c[c.length - 1]) === 0) c.pop();
  const n = c.length - 1; if (n < 1) throw err('polyroots: степень многочлена должна быть ≥ 1');
  const lead = c[n]; c = c.map(x => cdiv(x, lead));
  const P = z => { let s = 1; for (let k = n - 1; k >= 0; k--) s = cadd(cmul(s, z), c[k]); return s; };
  const R = Math.max(...c.slice(0, n).map(cabs)) + 1;
  let z = []; for (let k = 0; k < n; k++) z.push(new C(R * Math.cos(2 * Math.PI * k / n + 0.4), R * Math.sin(2 * Math.PI * k / n + 0.4)));
  for (let it = 0; it < 2000; it++) {
    let delta = 0;
    for (let i = 0; i < n; i++) {
      let den = 1; for (let j = 0; j < n; j++) if (j !== i) den = cmul(den, csub(z[i], z[j]));
      const step = cdiv(P(z[i]), den); z[i] = csub(z[i], step); delta = Math.max(delta, cabs(step));
    }
    if (delta < 1e-15) break;
  }
  z = z.map(v => { const r = re(v), i = im(v); return mk(Math.abs(r) < 1e-12 ? 0 : r, Math.abs(i) < 1e-10 * Math.max(1, Math.abs(r)) ? 0 : i); });
  z.sort((a, b) => re(a) - re(b) || im(a) - im(b));
  return colVec(z);
}
function rk4fixed(y0, x1, x2, npts, D) {
  const n = y0.length; const out = new Mat(npts + 1, n + 1); const h = (x2 - x1) / npts;
  let y = y0.slice(); let x = x1;
  const add = (a, b, k) => a.map((v, i) => v + k * b[i]);
  for (let s = 0; s <= npts; s++) {
    out.set(s, 0, x); for (let i = 0; i < n; i++) out.set(s, i + 1, y[i]);
    if (s === npts) break;
    const k1 = D(x, y), k2 = D(x + h / 2, add(y, k1, h / 2)), k3 = D(x + h / 2, add(y, k2, h / 2)), k4 = D(x + h, add(y, k3, h));
    y = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    x = x1 + (s + 1) * h;
  }
  return out;
}
function cspline(vx, vy) { // естественный кубический сплайн: вторые производные
  const n = vx.length; const y2 = new Array(n).fill(0), u = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const sig = (vx[i] - vx[i - 1]) / (vx[i + 1] - vx[i - 1]); const p = sig * y2[i - 1] + 2;
    y2[i] = (sig - 1) / p; u[i] = (vy[i + 1] - vy[i]) / (vx[i + 1] - vx[i]) - (vy[i] - vy[i - 1]) / (vx[i] - vx[i - 1]);
    u[i] = (6 * u[i] / (vx[i + 1] - vx[i - 1]) - sig * u[i - 1]) / p;
  }
  for (let k = n - 2; k >= 0; k--) y2[k] = y2[k] * y2[k + 1] + u[k];
  return y2;
}
function splineAt(vs, vx, vy, x) {
  let lo = 0, hi = vx.length - 1;
  if (x <= vx[0]) { lo = 0; hi = 1; } else if (x >= vx[hi]) { lo = hi - 1; } else { while (hi - lo > 1) { const k = (hi + lo) >> 1; if (vx[k] > x) hi = k; else lo = k; } }
  const h = vx[hi] - vx[lo], a = (vx[hi] - x) / h, b = (x - vx[lo]) / h;
  return a * vy[lo] + b * vy[hi] + ((a * a * a - a) * vs[lo] + (b * b * b - b) * vs[hi]) * h * h / 6;
}

const BUILTIN_NAMES = new Set();
function realFn(f) { return (args) => { if (args.length !== 1) throw err('Ожидался один аргумент'); return mapScalar(args[0], x => f(toNum(x))); }; }
function mapScalar(v, f) { if (v instanceof Mat) return new Mat(v.r, v.c, v.a.map(f)); return f(v); }
const B = {}; // встроенные функции: (args, ctx) => value
function def(names, fn, lazy) { for (const n of names.split(' ')) { B[n] = { fn, lazy: !!lazy }; BUILTIN_NAMES.add(n); } }
def('sin', a => mapScalar(a[0], csin));
def('cos', a => mapScalar(a[0], ccos));
def('tan', a => mapScalar(a[0], x => cdiv(csin(x), ccos(x))));
def('cot', a => mapScalar(a[0], x => cdiv(ccos(x), csin(x))));
def('sec', a => mapScalar(a[0], x => cdiv(1, ccos(x))));
def('csc', a => mapScalar(a[0], x => cdiv(1, csin(x))));
def('asin', realFn(Math.asin)); def('acos', realFn(Math.acos));
def('atan', realFn(Math.atan)); def('acot', realFn(x => Math.PI / 2 - Math.atan(x)));
def('atan2', a => Math.atan2(toNum(a[1]), toNum(a[0]))); // Mathcad: atan2(x, y)
def('angle', a => { const t = Math.atan2(toNum(a[1]), toNum(a[0])); return t < 0 ? t + 2 * Math.PI : t; });
def('sinh', realFn(Math.sinh)); def('cosh', realFn(Math.cosh)); def('tanh', realFn(Math.tanh)); def('coth', realFn(x => 1 / Math.tanh(x)));
def('asinh', realFn(Math.asinh)); def('acosh', realFn(Math.acosh)); def('atanh', realFn(Math.atanh));
def('exp', a => mapScalar(a[0], cexp));
def('ln', a => mapScalar(a[0], cln));
def('log', a => a.length === 2 ? cdiv(cln(a[0]), cln(a[1])) : mapScalar(a[0], x => cdiv(cln(x), Math.LN10)));
def('sqrt', a => mapScalar(a[0], csqrt));
def('abs', a => mapScalar(a[0], cabs));
def('floor', realFn(Math.floor)); def('ceil', realFn(Math.ceil)); def('trunc', realFn(Math.trunc));
def('round', a => { const x = toNum(a[0]); const n = a.length > 1 ? toInt(a[1]) : 0; const k = Math.pow(10, n); return Math.round(x * k) / k; });
def('mod', a => { const x = toNum(a[0]), y = toNum(a[1]); if (y === 0) throw err('mod: деление на ноль'); return x - y * Math.trunc(x / y); });
def('sign', realFn(Math.sign)); def('signum', a => { const v = a[0]; const r = cabs(v); return r === 0 ? 0 : cdiv(v, r); });
def('Re', a => mapScalar(a[0], re)); def('Im', a => mapScalar(a[0], im)); def('arg', a => mapScalar(a[0], carg));
def('csgn', a => { const v = a[0]; return re(v) > 0 || (re(v) === 0 && im(v) >= 0) ? 1 : -1; });
def('Φ', a => mapScalar(a[0], x => toNum(x) >= 0 ? 1 : 0)); def('Heaviside', B['Φ'].fn);
def('δ', a => (toNum(a[0]) === toNum(a[1]) ? 1 : 0));
def('if', (a, ctx) => { if (a.length !== 3) throw err('if(условие, если да, если нет)'); const c = toNum(ctx.ev(a[0])); return ctx.ev(c !== 0 ? a[1] : a[2]); }, true);
function flat(args) { const out = []; for (const v of args) { if (v instanceof Mat) out.push(...v.a); else if (v instanceof Rng) out.push(...v.vals); else out.push(v); } return out; }
def('max', a => { const v = flat(a).map(x => toNum(x)); if (!v.length) throw err('max: нет значений'); return Math.max(...v); });
def('min', a => { const v = flat(a).map(x => toNum(x)); if (!v.length) throw err('min: нет значений'); return Math.min(...v); });
def('mean', a => { const v = flat(a); return cdiv(v.reduce(cadd, 0), v.length); });
def('median', a => { const v = flat(a).map(x => toNum(x)).sort((p, q) => p - q); const n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; });
def('var', a => { const v = flat(a).map(x => toNum(x)); const m = v.reduce((s, x) => s + x, 0) / v.length; return v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length; });
def('Var', a => { const v = flat(a).map(x => toNum(x)); const m = v.reduce((s, x) => s + x, 0) / v.length; return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); });
def('stdev', a => Math.sqrt(B['var'].fn(a))); def('Stdev', a => Math.sqrt(B['Var'].fn(a)));
def('gcd', a => { let v = flat(a).map(x => Math.abs(toInt(x))); return v.reduce((p, q) => { while (q) [p, q] = [q, p % q]; return p; }); });
def('lcm', a => { let v = flat(a).map(x => Math.abs(toInt(x))); const g = (p, q) => { while (q) [p, q] = [q, p % q]; return p; }; return v.reduce((p, q) => p * q / g(p, q)); });
def('length', a => vecOf(a[0]).length);
def('last', a => vecOf(a[0]).length - 1);
def('rows', a => asMat(a[0]).r); def('cols', a => asMat(a[0]).c);
def('identity', a => identity(toInt(a[0])));
def('tr', a => { const m = asMat(a[0]); let s = 0; for (let i = 0; i < Math.min(m.r, m.c); i++) s = cadd(s, m.get(i, i)); return s; });
def('rank', a => { const m = asMat(a[0]); const A = m.a.map(toNum); const r = m.r, c = m.c; let rank = 0; const used = new Array(r).fill(false);
  for (let j = 0; j < c; j++) { let p = -1, mx = 1e-10; for (let i = 0; i < r; i++) if (!used[i] && Math.abs(A[i * c + j]) > mx) { mx = Math.abs(A[i * c + j]); p = i; } if (p < 0) continue; used[p] = true; rank++;
    for (let i = 0; i < r; i++) if (i !== p) { const f = A[i * c + j] / A[p * c + j]; for (let k = j; k < c; k++) A[i * c + k] -= f * A[p * c + k]; } }
  return rank; });
def('augment', a => { const ms = a.map(asMat); const r = ms[0].r; if (ms.some(m => m.r !== r)) throw err('augment: разное число строк'); const c = ms.reduce((s, m) => s + m.c, 0); const o = new Mat(r, c); let off = 0; for (const m of ms) { for (let i = 0; i < r; i++) for (let j = 0; j < m.c; j++) o.set(i, off + j, m.get(i, j)); off += m.c; } return o; });
def('stack', a => { const ms = a.map(asMat); const c = ms[0].c; if (ms.some(m => m.c !== c)) throw err('stack: разное число столбцов'); return new Mat(ms.reduce((s, m) => s + m.r, 0), c, [].concat(...ms.map(m => m.a))); });
def('submatrix', a => { const m = asMat(a[0]); const [ir, jr, ic, jc] = a.slice(1).map(x => toInt(x)); const o = new Mat(jr - ir + 1, jc - ic + 1); for (let i = ir; i <= jr; i++) for (let j = ic; j <= jc; j++) o.set(i - ir, j - ic, m.get(i, j)); return o; });
def('diag', a => { const v = vecOf(a[0]); const m = new Mat(v.length, v.length); v.forEach((x, i) => m.set(i, i, x)); return m; });
def('matrix', (a, ctx) => { const r = toInt(ctx.ev(a[0])), c = toInt(ctx.ev(a[1])); const f = ctx.ev(a[2]); if (!(f instanceof Fn)) throw err('matrix(m, n, f): f — функция'); const m = new Mat(r, c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) m.set(i, j, ctx.callFn(f, [i, j])); return m; }, true);
def('sort', a => colVec(vecOf(a[0]).map(x => toNum(x)).sort((p, q) => p - q)));
def('reverse', a => { const m = asMat(a[0]); if (m.c === 1) return colVec(m.a.slice().reverse()); const o = new Mat(m.r, m.c); for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) o.set(i, j, m.get(m.r - 1 - i, j)); return o; });
def('csort', a => { const m = asMat(a[0]); const j = toInt(a[1]); const idx = [...Array(m.r).keys()].sort((p, q) => toNum(m.get(p, j)) - toNum(m.get(q, j))); const o = new Mat(m.r, m.c); idx.forEach((s, i) => { for (let k = 0; k < m.c; k++) o.set(i, k, m.get(s, k)); }); return o; });
def('lsolve', a => { const A = asMat(a[0]), b = asMat(a[1]); if (b.r !== A.r) throw err('lsolve: размеры не согласованы'); return luSolve(A, b); });
def('linterp', a => { const vx = vecOf(a[0]).map(x => toNum(x)), vy = vecOf(a[1]).map(x => toNum(x)); return mapScalar(a[2], xv => { const x = toNum(xv); let k = 0; if (x <= vx[0]) k = 0; else if (x >= vx[vx.length - 1]) k = vx.length - 2; else while (k < vx.length - 2 && vx[k + 1] < x) k++; return vy[k] + (vy[k + 1] - vy[k]) * (x - vx[k]) / (vx[k + 1] - vx[k]); }); });
def('cspline lspline pspline', a => colVec(cspline(vecOf(a[0]).map(x => toNum(x)), vecOf(a[1]).map(x => toNum(x)))));
def('interp', a => { const vs = vecOf(a[0]).map(x => toNum(x)), vx = vecOf(a[1]).map(x => toNum(x)), vy = vecOf(a[2]).map(x => toNum(x)); return mapScalar(a[3], x => splineAt(vs, vx, vy, toNum(x))); });
def('polyroots', a => polyroots(vecOf(a[0])));
def('eigenvals', a => { const m = asMat(a[0]); if (m.r !== m.c) throw err('eigenvals: матрица должна быть квадратной'); // через характеристический многочлен (Фаддеев–Леверье) для n ≤ 10
  const n = m.r; if (n > 10) throw err('eigenvals: пока до 10×10'); let Mk = identity(n), c = [1]; const coefs = new Array(n + 1).fill(0); coefs[n] = 1; let AM;
  for (let k = 1; k <= n; k++) { AM = matmul(m, Mk); let trv = 0; for (let i = 0; i < n; i++) trv = cadd(trv, AM.get(i, i)); const ck = cdiv(cneg(trv), k); coefs[n - k] = ck; Mk = new Mat(n, n, AM.a.map((x, idx) => (idx % (n + 1) === 0 ? cadd(x, ck) : x))); }
  return polyroots(coefs); });
def('rkfixed', (a, ctx) => {
  if (a.length !== 5) throw err('rkfixed(y, x1, x2, npoints, D)');
  const y0 = vecOf(a[0]).map(x => toNum(x)), x1 = toNum(a[1]), x2 = toNum(a[2]), n = toInt(a[3]); const D = a[4];
  if (!(D instanceof Fn)) throw err('rkfixed: D должна быть функцией D(x, y)');
  if (n < 1 || n > 200000) throw err('rkfixed: число шагов 1…200000');
  return rk4fixed(y0, x1, x2, n, (x, y) => { const r = ctx.callFn(D, [x, colVec(y)]); const v = r instanceof Mat ? r.a.map(t => toNum(t)) : [toNum(r)]; if (v.length !== y.length) throw err('rkfixed: D должна возвращать вектор длины ' + y.length); return v; });
});
def('Rkadapt rkadapt Bulstoer', (a, ctx) => B['rkfixed'].fn(a, ctx));
def('root', (a, ctx) => {
  if (a.length !== 2 && a.length !== 4) throw err('root(f(x), x) или root(f(x), x, a, b)');
  const v = a[1]; if (v.type !== 'id') throw err('root: второй аргумент — имя переменной');
  const local = ctx.env.child(); const f = x => { local.set(v.name, x); return toNum(ctx.evIn(a[0], local), 'Функция в root'); };
  if (a.length === 4) { const lo = toNum(ctx.ev(a[2])), hi = toNum(ctx.ev(a[3])); return brent(f, lo, hi, 1e-13); }
  const g = ctx.env.get(v.name); if (g === undefined) throw err('root: задайте начальное приближение ' + v.name + ' := … выше или укажите интервал');
  return secantRoot(f, toNum(g));
}, true);
// ───── блоки решений: Given … Find / Minerr / Minimize / Maximize / Odesolve ─────
function guesses(args, ctx, fname) {
  return args.map(a => {
    if (a.type !== 'id') throw err(fname + ': аргументы — имена неизвестных');
    const v = ctx.env.get(a.name);
    if (v === undefined || v instanceof Fn) throw err(fname + ': задайте начальное приближение ' + prettyName(a.name) + ' := … выше Given');
    return { name: a.name, v: toNum(v, 'Начальное приближение') };
  });
}
function splitGiven(given, fname) {
  const eqs = [], ineqs = [];
  for (const g of given || []) {
    const e = g.type === 'paren' ? g.e : g;
    if (e.type === 'bin' && e.op === '==') eqs.push(e);
    else if (e.type === 'bin' && ['<', '>', '≤', '≥'].includes(e.op)) ineqs.push(e);
    else throw err('В блоке Given допустимы только уравнения (логическое =) и неравенства');
  }
  return { eqs, ineqs };
}
function residuals(eqs, ineqs, names, ctx) {
  const local = ctx.env.child();
  return x => {
    names.forEach((n, i) => local.set(n, x[i]));
    const r = []; let scale = 1;
    for (const e of eqs) { const a = toNum(evalNode(e.l, local, ctx)), b = toNum(evalNode(e.r, local, ctx)); r.push(a - b); scale = Math.max(scale, Math.abs(a), Math.abs(b)); }
    for (const q of ineqs) { const a = toNum(evalNode(q.l, local, ctx)), b = toNum(evalNode(q.r, local, ctx)); const v = (q.op === '<' || q.op === '≤') ? a - b : b - a; r.push(v > 0 ? v : 0); }
    r.scale = scale; return r;
  };
}
function levmar(f, x0) { // Левенберг–Марквардт, численный якобиан
  let x = x0.slice(), r = f(x), cost = r.reduce((s, v) => s + v * v, 0), lam = 1e-3;
  const n = x.length;
  for (let it = 0; it < 300 && cost > 1e-30; it++) {
    const m = r.length, J = [];
    for (let j = 0; j < n; j++) { const h = 1e-7 * Math.max(1, Math.abs(x[j])); const xp = x.slice(); xp[j] += h; const rp = f(xp); J.push(rp.map((v, i) => (v - r[i]) / h)); }
    const A = new Mat(n, n), g = new Mat(n, 1);
    for (let a = 0; a < n; a++) { let gs = 0; for (let i = 0; i < m; i++) gs += J[a][i] * r[i]; g.a[a] = -gs; for (let b = 0; b < n; b++) { let sum = 0; for (let i = 0; i < m; i++) sum += J[a][i] * J[b][i]; A.set(a, b, sum); } }
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const D = new Mat(n, n, A.a.slice()); for (let a = 0; a < n; a++) D.set(a, a, D.get(a, a) * (1 + lam) + lam * 1e-12);
      let dx; try { dx = luSolve(D, g).a; } catch (e) { lam *= 10; continue; }
      const xn = x.map((v, i) => v + dx[i]); let rn; try { rn = f(xn); } catch (e) { lam *= 10; continue; }
      const cn = rn.reduce((s, v) => s + v * v, 0);
      if (isFinite(cn) && cn < cost) { const step = Math.max(...dx.map((d, i) => Math.abs(d) / Math.max(1, Math.abs(x[i])))); x = xn; r = rn; cost = cn; lam = Math.max(lam / 10, 1e-15); improved = true; if (step < 1e-15) it = 1e9; break; }
      lam *= 10;
    }
    if (!improved) break;
  }
  return { x, r, cost };
}
function solveGiven(args, ctx, fname, strict) {
  const given = ctx.opts && ctx.opts.given;
  if (!given) throw err(fname + ': нужен блок Given выше с уравнениями');
  if (!given.length) throw err(fname + ': в блоке Given нет уравнений');
  const g = guesses(args, ctx, fname); const names = g.map(q => q.name);
  const { eqs, ineqs } = splitGiven(given, fname);
  const f = residuals(eqs, ineqs, names, ctx);
  const res = levmar(f, g.map(q => q.v));
  const nrm = Math.sqrt(res.cost), scale = res.r.scale || 1;
  const ctol = toNum(ctx.env.get('CTOL') !== undefined ? ctx.env.get('CTOL') : 1e-3);
  if (strict && !(nrm <= Math.max(1e-9, Math.min(ctol, 1e-6) * scale))) throw err('Решение не найдено — измените начальные приближения или проверьте уравнения');
  return names.length === 1 ? res.x[0] : colVec(res.x);
}
def('Find find', (a, ctx) => solveGiven(a, ctx, 'Find', true), true);
def('Minerr minerr', (a, ctx) => solveGiven(a, ctx, 'Minerr', false), true);
function nelderMead(f, x0) {
  const n = x0.length; let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] = p[i] !== 0 ? p[i] * 1.1 : 0.1; pts.push(p); }
  let vals = pts.map(f);
  for (let it = 0; it < 4000 * n; it++) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); pts = idx.map(i => pts[i]); vals = idx.map(i => vals[i]);
    const spread = Math.abs(vals[n] - vals[0]), size = Math.max(...pts.slice(1).map(p => Math.max(...p.map((v, j) => Math.abs(v - pts[0][j]) / Math.max(1, Math.abs(pts[0][j]))))));
    if (spread <= 1e-15 * (Math.abs(vals[0]) + 1e-300) && size < 1e-12) break;
    if (size < 1e-14) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = t => c.map((v, j) => v + t * (pts[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < vals[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else { const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc);
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); } } }
  }
  const b = vals.indexOf(Math.min(...vals)); return pts[b];
}
function optimize(args, ctx, fname, sign) {
  if (args.length < 2) throw err(fname + '(f, x, …): функция и неизвестные');
  const fv = evalArg(args[0], ctx.env, ctx); if (!(fv instanceof Fn)) throw err(fname + ': первый аргумент — имя функции');
  const g = guesses(args.slice(1), ctx, fname); const names = g.map(q => q.name);
  const given = (ctx.opts && ctx.opts.given) || [];
  const { eqs, ineqs } = splitGiven(given, fname); const pen = residuals(eqs, ineqs, names, ctx);
  const obj = mu => x => { let v; try { v = sign * toNum(ctx.callFn(fv, x)); } catch (e) { return 1e300; } if (!isFinite(v)) return 1e300; if (eqs.length + ineqs.length) { const r = pen(x); v += mu * r.reduce((s, q) => s + q * q, 0); } return v; };
  let x = g.map(q => q.v);
  if (eqs.length + ineqs.length) { for (const mu of [1e2, 1e4, 1e6, 1e8, 1e10]) { x = nelderMead(obj(mu), x); } }
  else { x = nelderMead(obj(0), x); x = nelderMead(obj(0), x); }
  return names.length === 1 ? x[0] : colVec(x);
}
def('Minimize minimize', (a, ctx) => optimize(a, ctx, 'Minimize', 1), true);
def('Maximize maximize', (a, ctx) => optimize(a, ctx, 'Maximize', -1), true);

// Odesolve(t, b [, шаги]) — одно ОДУ n-го порядка с начальными условиями в блоке Given; результат — функция y(t)
function primeSplit(name) { const m = /^(.*?)('*)$/.exec(name); return { base: m[1], k: m[2].length }; }
function odesolve(args, ctx) {
  const given = ctx.opts && ctx.opts.given;
  if (!given || !given.length) throw err('Odesolve: нужен блок Given с уравнением и начальными условиями');
  if (args.length < 2 || args[0].type !== 'id') throw err('Odesolve(t, конец [, число шагов])');
  const tv = args[0].name, tEnd = toNum(ctx.ev(args[1]), 'Конец интервала'); const steps = args[2] ? toInt(ctx.ev(args[2])) : 1000;
  // неизвестная функция и порядки производных: y(t), y'(t), y''(t) или d/dt y(t)
  const calls = []; const known = n => { const v = ctx.env.get(n); return v instanceof Fn || B[n] || extFn(n); };
  const walk = (n, cb) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(x => walk(x, cb)); cb(n); for (const k in n) if (k !== 'type' && typeof n[k] === 'object') walk(n[k], cb); };
  let fname = null;
  for (const g0 of given) walk(g0, n => { if (n.type === 'call') { const { base } = primeSplit(n.f); if (!known(base) && !known(n.f)) fname = fname || base; } if (n.type === 'deriv' && n.e && n.e.type === 'call' && !known(n.e.f)) fname = fname || n.e.f; });
  if (!fname) throw err('Odesolve: не найдена неизвестная функция вида y(' + tv + ')');
  const isVar = a => a && a.type === 'id' && a.name === tv;
  const odes = [], ics = [];
  for (const g0 of given) {
    const e = g0.type === 'paren' ? g0.e : g0; if (!(e.type === 'bin' && e.op === '==')) throw err('Odesolve: в Given только равенства');
    let usesT = false; walk(e, n => { if (n.type === 'call' && primeSplit(n.f).base === fname && isVar(n.args[0])) usesT = true; if (n.type === 'deriv' && n.v === tv) usesT = true; });
    if (usesT) odes.push(e); else ics.push(e);
  }
  if (odes.length !== 1) throw err('Odesolve: нужно ровно одно дифференциальное уравнение (сейчас ' + odes.length + ')');
  let n = 0; walk(odes[0], q => { if (q.type === 'call' && primeSplit(q.f).base === fname) n = Math.max(n, primeSplit(q.f).k); if (q.type === 'deriv' && q.e && q.e.type === 'call' && q.e.f === fname) n = Math.max(n, q.order); });
  if (n < 1) throw err('Odesolve: в уравнении нет производной ' + fname + "'");
  // начальные условия: y(a) = …, y'(a) = …
  let t0 = null; const Y0 = new Array(n).fill(null);
  for (const e of ics) {
    const c = e.l.type === 'call' ? e.l : (e.r.type === 'call' ? e.r : null); const other = c === e.l ? e.r : e.l;
    if (!c || primeSplit(c.f).base !== fname) throw err('Odesolve: начальное условие должно иметь вид ' + fname + '(a) = значение');
    const k = primeSplit(c.f).k; if (k >= n) throw err('Odesolve: лишнее начальное условие для производной порядка ' + k);
    const a = toNum(ctx.ev(c.args[0]), 'Точка начального условия'); if (t0 !== null && a !== t0) throw err('Odesolve: начальные условия должны быть в одной точке');
    t0 = a; Y0[k] = toNum(ctx.ev(other));
  }
  if (Y0.some(v => v === null)) throw err('Odesolve: нужно ' + n + ' начальных условия(й) — для ' + fname + (n > 1 ? ' и производных до ' + fname + "'".repeat(n - 1) : ''));
  const ode = odes[0]; const local = ctx.env.child(); let state = null, top = 0;
  const bindState = () => {
    for (let k = 0; k <= n; k++) { const nm = fname + "'".repeat(k); const kk = k; local.set(nm, new Fn(['τ'], { type: 'native', params: ['τ'], fn: () => (kk < n ? state[kk] : top) }, local, nm)); }
  };
  // d/dt y(t) внутри уравнения: заменить на вызов y^(k)
  const rewrite = q => { if (!q || typeof q !== 'object') return q; if (Array.isArray(q)) return q.map(rewrite); if (q.type === 'deriv' && q.e && q.e.type === 'call' && q.e.f === fname) return { type: 'call', f: fname + "'".repeat(q.order), args: q.e.args }; const o = {}; for (const k in q) o[k] = (typeof q[k] === 'object') ? rewrite(q[k]) : q[k]; return o; };
  const L = rewrite(ode.l), R = rewrite(ode.r);
  bindState();
  const F = (t, Y, z) => { local.set(tv, t); state = Y; top = z; return toNum(evalNode(L, local, ctx)) - toNum(evalNode(R, local, ctx)); };
  let zPrev = 0;
  const highest = (t, Y) => { // y^(n) из F = 0 методом секущих (уравнение обычно линейно по y^(n))
    let z0 = zPrev, z1 = zPrev + 1, f0 = F(t, Y, z0), f1 = F(t, Y, z1);
    for (let i = 0; i < 50; i++) { if (f1 === f0) break; const z2 = z1 - f1 * (z1 - z0) / (f1 - f0); z0 = z1; f0 = f1; z1 = z2; f1 = F(t, Y, z1); if (Math.abs(f1) < 1e-13 * (1 + Math.abs(z1)) || Math.abs(z1 - z0) < 1e-14 * (1 + Math.abs(z1))) break; }
    if (!isFinite(z1)) throw err('Odesolve: не удалось выразить старшую производную'); zPrev = z1; return z1;
  };
  const D = (t, Y) => { const d = Y.slice(1); d.push(highest(t, Y)); return d; };
  const N = Math.max(10, Math.min(200000, steps)); const h = (tEnd - t0) / N;
  const T = [t0], YS = [Y0.slice()], DS = [D(t0, Y0)]; let Y = Y0.slice(), t = t0;
  const add = (a, b, k) => a.map((v, i) => v + k * b[i]);
  for (let s = 0; s < N; s++) {
    const k1 = DS[DS.length - 1], k2 = D(t + h / 2, add(Y, k1, h / 2)), k3 = D(t + h / 2, add(Y, k2, h / 2)), k4 = D(t + h, add(Y, k3, h));
    Y = Y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); t = t0 + (s + 1) * h;
    if (!Y.every(isFinite)) throw err('Odesolve: решение уходит в бесконечность при ' + tv + ' ≈ ' + +t.toPrecision(4));
    T.push(t); YS.push(Y.slice()); DS.push(D(t, Y));
  }
  const lo = Math.min(t0, tEnd), hi = Math.max(t0, tEnd);
  const interp = x => { // кубическая эрмитова интерполяция по y и y'
    if (x < lo - 1e-12 * (hi - lo) || x > hi + 1e-12 * (hi - lo)) throw err(fname + '(' + tv + '): ' + tv + ' вне интервала решения [' + +lo.toPrecision(6) + ', ' + +hi.toPrecision(6) + ']');
    let i = Math.floor((x - t0) / h); i = Math.max(0, Math.min(N - 1, i));
    const u = (x - T[i]) / h, y0 = YS[i][0], y1 = YS[i + 1][0], d0 = (n >= 1 ? (YS[i][1] !== undefined ? YS[i][1] : DS[i][0]) : 0) * h, d1 = (n >= 1 ? (YS[i + 1][1] !== undefined ? YS[i + 1][1] : DS[i + 1][0]) : 0) * h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * d0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * d1;
  };
  return new Fn([tv], { type: 'native', params: [tv], fn: a => mapScalar(a[0], v => interp(toNum(v))) }, ctx.env, fname);
}
def('Odesolve odesolve', (a, ctx) => odesolve(a, ctx), true);
const SOLVE_FNS = new Set(['Find', 'find', 'Minerr', 'minerr', 'Minimize', 'minimize', 'Maximize', 'maximize', 'Odesolve', 'odesolve']);
def('concat', a => new Str(a.map(x => x instanceof Str ? x.s : fmtPlain(x)).join('')));
def('strlen', a => (a[0] instanceof Str ? a[0].s.length : 0));
def('num2str', a => new Str(fmtPlain(a[0])));
def('str2num', a => { const v = parseFloat(String(a[0].s).replace(',', '.')); if (isNaN(v)) throw err('str2num: не число'); return v; });
def('error', a => { throw err(a[0] instanceof Str ? a[0].s : 'Ошибка'); });
def('time', () => Date.now() / 1000);
def('rnd', a => Math.random() * toNum(a[0]));
def('fact', a => factorial(toNum(a[0])));
function factorial(n) { if (n < 0 || !Number.isInteger(n)) return gammaFn(n + 1); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; }
function gammaFn(x) { // Ланцош
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  x -= 1; const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
def('Γ Gamma', a => gammaFn(toNum(a[0])));
def('erf', realFn(x => { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : -y; }));
def('erfc', a => 1 - B['erf'].fn(a));
def('pnorm', a => { const x = toNum(a[0]), m = toNum(a[1]), s = toNum(a[2]); return 0.5 * (1 + B['erf'].fn([(x - m) / (s * Math.SQRT2)])); });
def('dnorm', a => { const x = toNum(a[0]), m = toNum(a[1]), s = toNum(a[2]); return Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)); });

// Контекст вычисления
class Ctx {
  constructor(env, opts) { this.env = env; this.opts = opts || {}; this.depth = 0; }
  ev(n) { return evalNode(n, this.env, this); }
  evIn(n, env) { return evalNode(n, env, this); }
  callFn(f, args) {
    if (f.params.length !== args.length) throw err('Функция ' + (f.name || '') + ' ожидает ' + f.params.length + ' аргумент(ов)');
    if (++this.depth > 400) { this.depth = 0; throw err('Слишком глубокая рекурсия'); }
    const local = new Env(f.env); local.set(f.name, f); // рекурсия
    f.params.forEach((p, i) => local.set(p, args[i]));
    try { return evalNode(f.body, local, this); } finally { this.depth--; }
  }
}

function lookup(name, env, node) {
  const v = env.get(name);
  if (v !== undefined) return v;
  if (name in CONSTS) return CONSTS[name];
  if (B[name]) throw err('«' + name + '» — функция, нужны аргументы', node);
  throw err('Переменная «' + prettyName(name) + '» не определена', node);
}
function prettyName(n) { return n.replace(/_/, '.'); }

function evalNode(n, env, ctx) {
  switch (n.type) {
    case 'num': return n.v;
    case 'imag': return mk(0, n.v);
    case 'str': return new Str(n.v);
    case 'id': return lookup(n.name, env, n);
    case 'paren': return evalNode(n.e, env, ctx);
    case 'neg': return mapNeg(evalNode(n.e, env, ctx));
    case 'un': return toNum(evalNode(n.e, env, ctx)) === 0 ? 1 : 0;
    case 'bin': return evalBin(n, env, ctx);
    case 'pow': {
      const b = evalNode(n.b, env, ctx), e = evalNode(n.e, env, ctx);
      if (b instanceof Mat) {
        const k = toInt(e, 'Степень матрицы'); if (b.r !== b.c) throw err('Степень — только для квадратной матрицы');
        if (k < 0) { let inv = luSolve(b, identity(b.r)); let r = identity(b.r); for (let q = 0; q < -k; q++) r = matmul(r, inv); return r; }
        let r = identity(b.r); for (let q = 0; q < k; q++) r = matmul(r, b); return r;
      }
      if (e instanceof Mat) throw err('Показатель степени должен быть скаляром');
      return cpow(b, e);
    }
    case 'sqrt': return mapScalar(evalNode(n.e, env, ctx), csqrt);
    case 'root': { const k = toNum(evalNode(n.n, env, ctx)); const x = evalNode(n.e, env, ctx); return mapScalar(x, v => (typeof v === 'number' && v < 0 && Number.isInteger(k) && k % 2 === 1) ? -Math.pow(-v, 1 / k) : cpow(v, 1 / k)); }
    case 'abs': { const v = evalNode(n.e, env, ctx); if (v instanceof Mat) { if (v.r === v.c && v.r > 1) return det(v); return Math.sqrt(v.a.reduce((s, x) => s + cabs(x) ** 2, 0)); } if (v instanceof Str) return v.s.length; return cabs(v); }
    case 'fact': { const v = toNum(evalNode(n.e, env, ctx)); return factorial(v); }
    case 'transpose': return transpose(asMat(evalNode(n.e, env, ctx)));
    case 'col': { const m = asMat(evalNode(n.e, env, ctx)); const j = toInt(evalNode(n.j, env, ctx)) - ORIGIN(env); if (j < 0 || j >= m.c) throw err('Номер столбца вне диапазона'); const o = new Mat(m.r, 1); for (let i = 0; i < m.r; i++) o.a[i] = m.get(i, j); return o; }
    case 'vectorize': return evalNode(n.e, env, ctx);
    case 'native': return n.fn(n.params.map(p => env.get(p)), ctx);
    case 'matrix': {
      const r = n.rows.length, c = n.rows[0].length; const vals = n.rows.map(row => row.map(x => evalNode(x, env, ctx)));
      if (vals.some(row => row.some(v => v instanceof Mat))) { // блочная матрица
        const blocks = vals.map(row => row.map(asMat)); const rh = blocks.map(row => row[0].r), cw = blocks[0].map(b => b.c);
        const o = new Mat(rh.reduce((s, x) => s + x, 0), cw.reduce((s, x) => s + x, 0)); let ro = 0;
        blocks.forEach((row, bi) => { let co = 0; row.forEach((b, bj) => { for (let i = 0; i < b.r; i++) for (let j = 0; j < b.c; j++) o.set(ro + i, co + j, b.get(i, j)); co += cw[bj]; }); ro += rh[bi]; });
        return o;
      }
      const m = new Mat(r, c); vals.forEach((row, i) => row.forEach((v, j) => m.set(i, j, toScalar(v)))); return m;
    }
    case 'sub': return evalSub(n, env, ctx);
    case 'call': return evalCall(n, env, ctx);
    case 'range': throw err('Ранжированная переменная задаётся только в определении: i := 0..10');
    case 'system': return solveSystem(n, env, ctx);
    case 'int': {
      if (!n.lo || !n.hi) throw err('Неопределённый интеграл — в версии v2 (символьный модуль); задайте пределы');
      const a = toNum(evalNode(n.lo, env, ctx), 'Нижний предел'), b = toNum(evalNode(n.hi, env, ctx), 'Верхний предел');
      const local = env.child(); return integrate(x => { local.set(n.v, x); return toNum(evalNode(n.body, local, ctx), 'Подынтегральная функция'); }, a, b);
    }
    case 'deriv': {
      const x0 = env.get(n.v); if (x0 === undefined) throw err('Производная: задайте ' + prettyName(n.v) + ' := … выше (точка дифференцирования)');
      const local = env.child(); return derivative(x => { local.set(n.v, x); return toNum(evalNode(n.e, local, ctx)); }, toNum(x0), n.order);
    }
    case 'sum': case 'prod': {
      const isSum = n.type === 'sum'; let acc = isSum ? 0 : 1; const local = env.child();
      let vals;
      if (n.from) { const a = toInt(evalNode(n.from, env, ctx), 'Нижний предел'); const b = n.to ? toInt(evalNode(n.to, env, ctx), 'Верхний предел') : null; if (b === null) throw err('Укажите верхний предел'); if (b - a > 5e6) throw err('Слишком много слагаемых'); vals = []; for (let k = a; k <= b; k++) vals.push(k); }
      else { const rv = env.get(n.v); if (!(rv instanceof Rng)) throw err('«' + prettyName(n.v) + '» должна быть ранжированной переменной'); vals = rv.vals; }
      for (const k of vals) { local.set(n.v, k); const v = evalNode(n.body, local, ctx); acc = isSum ? addAny(acc, v) : mulAny(acc, v); }
      return acc;
    }
    default: throw err('Неподдерживаемый элемент: ' + n.type);
  }
}
function ORIGIN(env) { const o = env.get('ORIGIN'); return o === undefined ? 0 : toNum(o); }
function toScalar(v) { if (v instanceof Mat && v.r === 1 && v.c === 1) return v.a[0]; if (isNum(v)) return v; if (v instanceof Str) throw err('Строка в матрице не поддерживается'); throw err('Элемент матрицы должен быть числом'); }
function mapNeg(v) { if (v instanceof Mat) return new Mat(v.r, v.c, v.a.map(cneg)); if (v instanceof Rng) throw err('Ранжированная переменная здесь не допускается'); return cneg(toScalarOrStr(v)); }
function toScalarOrStr(v) { if (v instanceof Fn) throw err('Функцию нужно вызвать с аргументами'); if (v instanceof Str) throw err('Операция со строкой'); return v; }
function addAny(a, b) { return elementwise(chk(a), chk(b), cadd, '+'); }
function mulAny(a, b) {
  a = chk(a); b = chk(b);
  if (a instanceof Mat && b instanceof Mat) return matmul(a, b);
  return elementwise(a, b, cmul, '·');
}
function chk(v) { if (v instanceof Rng) throw err('Ранжированная переменная здесь не допускается'); if (v instanceof Fn) throw err('Функцию нужно вызвать с аргументами'); if (v instanceof Str) throw err('Арифметика со строкой'); return v; }
function evalBin(n, env, ctx) {
  const op = n.op;
  if (op === '∧') return toNum(evalNode(n.l, env, ctx)) !== 0 && toNum(evalNode(n.r, env, ctx)) !== 0 ? 1 : 0;
  if (op === '∨') return toNum(evalNode(n.l, env, ctx)) !== 0 || toNum(evalNode(n.r, env, ctx)) !== 0 ? 1 : 0;
  // неявное умножение «имя(…)» уже разобрано как вызов
  const a = evalNode(n.l, env, ctx), b = evalNode(n.r, env, ctx);
  switch (op) {
    case '+': if (a instanceof Str && b instanceof Str) return new Str(a.s + b.s); return addAny(a, b);
    case '-': return elementwise(chk(a), chk(b), csub, '-');
    case '±': return elementwise(chk(a), chk(b), cadd, '+');
    case '·': return mulAny(a, b);
    case '/': { if (b instanceof Mat) { if (b.r === b.c && a instanceof Mat) return matmul(a, luSolve(b, identity(b.r))); throw err('Деление на матрицу'); } return elementwise(chk(a), chk(b), cdiv, '/'); }
    case '<': return toNum(a) < toNum(b) ? 1 : 0;
    case '>': return toNum(a) > toNum(b) ? 1 : 0;
    case '≤': return toNum(a) <= toNum(b) ? 1 : 0;
    case '≥': return toNum(a) >= toNum(b) ? 1 : 0;
    case '≠': return cabs(csub(toScalar(a), toScalar(b))) !== 0 ? 1 : 0;
    case '==': return cabs(csub(toScalar(a), toScalar(b))) === 0 ? 1 : 0;
    case '⊕': return (toNum(a) !== 0) !== (toNum(b) !== 0) ? 1 : 0;
  }
  throw err('Неизвестная операция ' + op);
}
function evalSub(n, env, ctx) {
  // 1) литеральное имя x_пв, если определено
  if (n.e.type === 'id') {
    const lit = n.e.name + '_' + n.raw;
    if (env.has(lit)) return env.get(lit);
  }
  // 2) индекс массива
  const base = evalNode(n.e, env, ctx);
  if (!(base instanceof Mat)) {
    if (n.e.type === 'id' && !n.ix) throw err('Переменная «' + n.e.name + '.' + n.raw + '» не определена');
    if (n.e.type === 'id') throw err('Переменная «' + n.e.name + '.' + n.raw + '» не определена (или «' + n.e.name + '» — не массив)');
    throw err('Индекс применяется только к массиву');
  }
  if (!n.ix) throw err('Неверный индекс');
  const o = ORIGIN(env);
  const idx = n.ix.map(x => evalNode(x, env, ctx));
  if (idx.length === 1) {
    const k = toInt(idx[0]) - o;
    if (base.c === 1 || base.r === 1) { if (k < 0 || k >= base.a.length) throw err('Индекс ' + (k + o) + ' вне диапазона (0…' + (base.a.length - 1 + o) + ')'); return base.a[k]; }
    throw err('У матрицы нужен двойной индекс i, j');
  }
  const i = toInt(idx[0]) - o, j = toInt(idx[1]) - o;
  if (i < 0 || i >= base.r || j < 0 || j >= base.c) throw err('Индекс вне диапазона');
  return base.get(i, j);
}
function evalCall(n, env, ctx) {
  const user = env.get(n.f);
  if (user instanceof Fn) return ctx.callFn(user, n.args.map(a => evalArg(a, env, ctx)));
  if (user !== undefined) { // переменная: x(a) — умножение
    if (n.args.length !== 1) throw err('«' + n.f + '» — не функция');
    return mulAny(user, evalNode(n.args[0], env, ctx));
  }
  const b = B[n.f];
  if (b) {
    if (b.lazy) return b.fn(n.args, Object.assign(Object.create(ctx), { env }));
    const args = n.args.map(a => evalArg(a, env, ctx));
    return b.fn(args, Object.assign(Object.create(ctx), { env }));
  }
  const ext = extFn(n.f);
  if (ext) return callExt(n, ext, n.args.map(a => evalNode(a, env, ctx)));
  if (n.f in CONSTS && n.args.length === 1) return mulAny(CONSTS[n.f], evalNode(n.args[0], env, ctx));
  throw err('Функция «' + prettyName(n.f) + '» не определена', n);
}
// внешние библиотеки функций: свойства воды и пара (WSP, iap97) и газов — src/wsp.js
let WSPLIB = null;
function wspLib() {
  if (WSPLIB) return WSPLIB;
  if (typeof module !== 'undefined' && module.exports) { try { WSPLIB = require('./wsp.js'); } catch (e) { WSPLIB = null; } }
  else WSPLIB = root.MatWSP || null;
  return WSPLIB;
}
function extFn(name) { if (!/^(wsp|iap)/.test(name)) return null; const L = wspLib(); return L && L.F[name] ? L : null; }
function callExt(n, L, vals) {
  const args = vals.map(v => v instanceof Str ? v.s : (v instanceof Mat && v.r * v.c === 1) ? toNum(v.a[0]) : toNum(v));
  let r;
  try { r = L.call(n.f, args); } catch (e) { throw err(e.message, n); }
  if (Array.isArray(r)) return new Mat(r.length, 1, r.slice());
  if (typeof r === 'string') return new Str(r);
  if (typeof r !== 'number' || !isFinite(r)) throw err('WSP: результат не определён', n);
  return r;
}
function evalArg(a, env, ctx) {
  if (a.type === 'id') { const v = env.get(a.name); if (v instanceof Fn) return v; if (v === undefined && B[a.name] && !(a.name in CONSTS)) { const bb = B[a.name]; return new Fn(['x'], { type: 'call', f: a.name, args: [{ type: 'id', name: 'x' }] }, new Env(), a.name); } }
  return evalNode(a, env, ctx);
}

// найти свободные ранжированные переменные в выражении
function freeRanges(n, env, bound, out) {
  if (!n || typeof n !== 'object') return out;
  if (Array.isArray(n)) { n.forEach(x => freeRanges(x, env, bound, out)); return out; }
  if (n.type === 'id' && !bound.has(n.name) && env.get(n.name) instanceof Rng && !out.includes(n.name)) out.push(n.name);
  if (n.type === 'sub' && n.e.type === 'id') { /* базовое имя индексируется — проверим индекс */ }
  let nb = bound;
  if ((n.type === 'sum' || n.type === 'prod' || n.type === 'int') && n.v) { nb = new Set(bound); nb.add(n.v); }
  for (const k in n) if (k !== 'type' && n[k] && typeof n[k] === 'object') freeRanges(n[k], env, (k === 'body' ? nb : bound), out);
  return out;
}

// ───────────────────────── Лист: выполнение определений ─────────────────────────
function execStatement(st, env, opts) {
  const ctx = new Ctx(env, opts);
  if (st.type === 'empty') return { env };
  if (st.type === 'define') {
    const lhs = st.lhs; let value;
    const newEnv = env.child();
    if (lhs.type === 'call') { // f(x, y) := …
      const params = lhs.args.map(a => { if (a.type !== 'id') throw err('Параметры функции — имена переменных'); return a.name; });
      const fn = new Fn(params, st.rhs, env, lhs.f); newEnv.set(lhs.f, fn); value = fn;
      return { env: newEnv, value: st.show ? null : undefined, name: lhs.f, fn: true };
    }
    if (st.rhs.type === 'range') {
      if (lhs.type !== 'id') throw err('Ранжированная переменная — простое имя');
      const a = toNum(evalNode(st.rhs.a, env, ctx)), b = toNum(evalNode(st.rhs.b, env, ctx));
      let step = a <= b ? 1 : -1; if (st.rhs.s) step = toNum(evalNode(st.rhs.s, env, ctx)) - a;
      if (step === 0 || (b - a) / step < 0) throw err('Неверный шаг ранжированной переменной');
      const cnt = Math.floor((b - a) / step + 1e-9) + 1; if (cnt > 1e6) throw err('Слишком много значений (>10⁶)');
      const vals = []; for (let k = 0; k < cnt; k++) vals.push(+(a + k * step).toPrecision(15));
      value = new Rng(vals); newEnv.set(lhs.name, value);
      return { env: newEnv, value: st.show ? value : undefined, name: lhs.name };
    }
    if (lhs.type === 'id') {
      const fr = freeRanges(st.rhs, env, new Set(), []);
      if (fr.length) throw err('Справа ранжированная переменная «' + fr[0] + '» — используйте индекс: ' + lhs.name + '_' + fr[0] + ' := …');
      value = evalNode(st.rhs, env, ctx);
      if (value instanceof Fn && st.rhs.type === 'id') value = new Fn(value.params, value.body, value.env, lhs.name);
      newEnv.set(lhs.name, value); return { env: newEnv, value: st.show ? value : undefined, name: lhs.name };
    }
    if (lhs.type === 'matrix' && lhs.rows.every(r => r.length === 1 && (r[0].type === 'id' || r[0].type === 'sub'))) { // [x; y] := …
      const names = lhs.rows.map(r => r[0].type === 'id' ? r[0].name : (r[0].e.name + '_' + r[0].raw));
      let v = st.rhs.type === 'system' ? solveSystem(st.rhs, env, ctx, names.filter(nm => env.get(nm) === undefined).length === names.length ? names : names) : evalNode(st.rhs, env, ctx);
      const vals = v instanceof Sol ? names.map(nm => { const k = v.names.indexOf(nm); if (k < 0) throw err('В системе нет неизвестной ' + prettyName(nm)); return v.vals[k]; }) : vecOf(v);
      if (vals.length !== names.length) throw err('Слева ' + names.length + ' имён, справа ' + vals.length + ' значений');
      let e2 = env; names.forEach((nm, k) => { e2 = e2.child(); e2.set(nm, vals[k]); });
      return { env: e2, value: st.show ? colVec(vals) : undefined, name: names.join(',') };
    }
    if (lhs.type === 'sub' && lhs.e.type === 'id') { // x_i := … (заполнение массива) или x_1 := …
      const name = lhs.e.name; const o = ORIGIN(env);
      const fr = freeRanges(lhs.ix || [], env, new Set(), []);
      let cur = env.get(name); let M = cur instanceof Mat ? new Mat(cur.r, cur.c, cur.a.slice()) : new Mat(0, 1, []);
      const assign = (local) => {
        const idx = lhs.ix.map(x => toInt(evalNode(x, local, ctx)) - o);
        const v = toScalar(evalNode(st.rhs, local, ctx));
        const i = idx[0], j = idx.length > 1 ? idx[1] : 0;
        if (i < 0 || j < 0) throw err('Отрицательный индекс');
        if (i >= M.r || j >= M.c) { const nr = Math.max(M.r, i + 1), nc = Math.max(M.c, j + 1); const N = new Mat(nr, nc); for (let p = 0; p < M.r; p++) for (let q = 0; q < M.c; q++) N.set(p, q, M.get(p, q)); M = N; }
        M.set(i, j, v);
      };
      if (!lhs.ix) throw err('Неверный индекс в левой части');
      if (fr.length) {
        const local = env.child();
        const loop = (k) => { if (k === fr.length) return assign(local); for (const v of env.get(fr[k]).vals) { local.set(fr[k], v); loop(k + 1); } };
        loop(0);
      } else assign(env);
      newEnv.set(name, M); return { env: newEnv, value: st.show ? M : undefined, name };
    }
    throw err('Неверная левая часть определения');
  }
  if (st.type === 'eval' || st.type === 'expr') {
    if (st.type === 'expr') return { env };
    const fr = freeRanges(st.expr, env, new Set(), []);
    if (fr.length) { // таблица значений по ранжированной переменной
      const rv = env.get(fr[0]).vals; const local = env.child(); const out = [];
      if (rv.length > 2000) throw err('Слишком длинная таблица');
      for (const v of rv) { local.set(fr[0], v); const r = evalNode(st.expr, local, ctx); out.push(r); }
      return { env, value: new Rng(out), table: true };
    }
    let v;
    if (st.expr.type === 'id' && env.get(st.expr.name) instanceof Fn) throw err('«' + st.expr.name + '» — функция, укажите аргументы');
    v = evalNode(st.expr, env, ctx);
    return { env, value: v };
  }
  return { env };
}

// ───────────────────────── Системы уравнений { … } ─────────────────────────
const SYS_CONST = new Set(['π', 'e', 'i', 'j']);
function systemUnknowns(n, env) {
  const names = [];
  (function w(q, bound) {
    if (!q || typeof q !== 'object') return;
    if (Array.isArray(q)) return q.forEach(x => w(x, bound));
    if (q.type === 'id' && !bound.has(q.name) && env.get(q.name) === undefined && !SYS_CONST.has(q.name) && !B[q.name] && !names.includes(q.name)) names.push(q.name);
    if (q.type === 'sub' && q.e.type === 'id') { const lit = q.e.name + '_' + q.raw; if (!env.has(lit) && env.get(q.e.name) === undefined) { if (!names.includes(lit)) names.push(lit); return; } }
    if (q.type === 'call') { q.args.forEach(a => w(a, bound)); return; }
    let nb = bound; if ((q.type === 'sum' || q.type === 'prod' || q.type === 'int' || q.type === 'deriv') && q.v) { nb = new Set(bound); nb.add(q.v); }
    for (const k in q) if (k !== 'type' && q[k] && typeof q[k] === 'object') w(q[k], (k === 'body' || k === 'e') ? nb : bound);
  })(n.eqs, new Set());
  return names;
}
// sub-узлы вида x_1 с неопределённым x — превратить в литеральные имена x_1, чтобы их можно было искать
function literalizeSubs(q, env) {
  if (!q || typeof q !== 'object') return q; if (Array.isArray(q)) return q.map(x => literalizeSubs(x, env));
  if (q.type === 'sub' && q.e.type === 'id' && env.get(q.e.name) === undefined) return { type: 'id', name: q.e.name + '_' + q.raw };
  const o = {}; for (const k in q) o[k] = (q[k] && typeof q[k] === 'object') ? literalizeSubs(q[k], env) : q[k]; return o;
}
function solveSystem(n, env, ctx, wanted) {
  const eqsAll = literalizeSubs(n.eqs, env);
  const names = wanted || systemUnknowns({ eqs: eqsAll }, env).sort((a, b) => a.localeCompare(b, 'ru'));
  if (!names.length) throw err('В системе нет неизвестных: все имена уже определены выше');
  const eqs = [], ineqs = [];
  for (const g of eqsAll) { const e = g.type === 'paren' ? g.e : g; if (e.type === 'bin' && e.op === '==') eqs.push(e); else if (e.type === 'bin' && ['<', '>', '≤', '≥'].includes(e.op)) ineqs.push(e); else throw err('Каждая строка системы — уравнение (=) или неравенство'); }
  if (!eqs.length) throw err('В системе нет уравнений');
  const sctx = Object.assign(Object.create(ctx), { env });
  const f = residuals(eqs, ineqs, names, sctx);
  const safe = x => { try { const r = f(x); return r.every(isFinite) ? r : null; } catch (e) { return null; } };
  // несколько стартовых точек: заданные приближения, 1, 0.5, 2, −1, затем случайные
  const starts = [names.map(() => 1), names.map(() => 0.5), names.map(() => 2), names.map(() => -1), names.map((_, i) => (i % 2 ? -0.5 : 1.5))];
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 40; k++) starts.push(names.map(() => (rnd() * 2 - 1) * Math.pow(10, Math.floor(rnd() * 3) - 1) * 3));
  let best = null;
  for (const x0 of starts) {
    if (!safe(x0)) continue;
    let res; try { res = levmar(x => { const r = safe(x); return r || x.map(() => 1e150); }, x0); } catch (e) { continue; }
    const r = safe(res.x); if (!r) continue;
    const nrm = Math.sqrt(r.reduce((s, v) => s + v * v, 0)), scale = r.scale || 1;
    if (!best || nrm < best.nrm) best = { x: res.x, nrm, scale };
    if (nrm <= 1e-9 * Math.max(1, scale)) break;
  }
  if (!best || !(best.nrm <= 1e-6 * Math.max(1, best.scale))) throw err('Система не решена: действительного решения не найдено (или нужны другие начальные приближения — задайте их через Given/Find)');
  return new Sol(names, best.x.map(v => Math.abs(v) < 1e-13 ? 0 : v));
}

// ───────────────────────── Прогон листа (с блоками Given) ─────────────────────────
function callsAny(n, set) { let hit = false; (function w(q) { if (hit || !q || typeof q !== 'object') return; if (Array.isArray(q)) return q.forEach(w); if (q.type === 'call' && set.has(q.f)) { hit = true; return; } for (const k in q) if (k !== 'type' && typeof q[k] === 'object') w(q[k]); })(n); return hit; }
class SheetRunner {
  constructor(origin) { this.env = new Env(); this.env.set('ORIGIN', origin || 0); this.given = null; const L = wspLib(); if (L && L.reset) L.reset(); }
  // st — разобранный регион; возвращает { value?, given?, constraint? } и запоминает окружение до региона
  step(st) {
    const before = { env: this.env, given: this.given ? this.given.slice() : null };
    if (st.type === 'expr' && st.expr.type === 'id' && /^given$/i.test(st.expr.name)) { this.given = []; return { before, given: true }; }
    if (this.given && st.type === 'expr') { if (st.expr.type === 'system') this.given.push(...st.expr.eqs); else this.given.push(st.expr); return { before, constraint: true }; }
    const closes = this.given && callsAny(st, SOLVE_FNS);
    let out;
    try { out = execStatement(st, this.env, { given: this.given }); }
    finally { if (closes) this.given = null; }
    this.env = out.env; out.before = before; return out;
  }
}

// ───────────────────────── Форматирование ─────────────────────────
const DEFAULT_FMT = { decimals: 3, expThreshold: 3, imagUnit: 'i' };
function fmtReal(x, f) {
  f = f || DEFAULT_FMT;
  if (!isFinite(x)) return isNaN(x) ? '\\text{NaN}' : (x > 0 ? '\\infty' : '-\\infty');
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e307) return x > 0 ? '\\infty' : '-\\infty';
  if (ax >= Math.pow(10, f.expThreshold) || ax < Math.pow(10, -f.expThreshold)) {
    let e = Math.floor(Math.log10(ax)); let m = x / Math.pow(10, e);
    let ms = trimZeros(roundHalfUp(m, f.decimals));
    if (Math.abs(parseFloat(ms)) >= 10) { e += 1; ms = trimZeros(roundHalfUp(x / Math.pow(10, e), f.decimals)); }
    if (ms === '1' ) return '10^{' + e + '}';
    if (ms === '-1') return '-10^{' + e + '}';
    return ms + '\\times10^{' + e + '}';
  }
  let s = trimZeros(roundHalfUp(x, f.decimals));
  if (s === '-0') s = '0';
  // группы разрядов не ставим (как Mathcad 15)
  return s;
}
function roundHalfUp(x, d) { const k = Math.pow(10, d); const r = Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9) / k; return r.toFixed(d); }
function trimZeros(s) { if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s; }
function fmtScalar(v, f) {
  if (typeof v === 'number') return fmtReal(v, f);
  if (isC(v)) {
    f = f || DEFAULT_FMT; const thr = Math.pow(10, -(f.decimals + 12));
    const r = Math.abs(v.re) < 1e-15 * Math.abs(v.im) ? 0 : v.re, i = Math.abs(v.im) < 1e-15 * Math.abs(v.re) ? 0 : v.im;
    const iu = f.imagUnit || 'i';
    const is = fmtReal(Math.abs(i), f); const ipart = (is === '1' ? '' : is) + iu;
    if (r === 0 && i === 0) return '0';
    if (i === 0) return fmtReal(r, f);
    if (r === 0) return (i < 0 ? '-' : '') + ipart;
    return fmtReal(r, f) + (i < 0 ? '-' : '+') + ipart;
  }
  return '?';
}
function fmtValue(v, f) {
  if (v instanceof Mat) {
    const MAXR = 14, MAXC = 8;
    const rows = []; for (let i = 0; i < Math.min(v.r, MAXR); i++) { const cells = []; for (let j = 0; j < Math.min(v.c, MAXC); j++) cells.push(fmtScalar(v.get(i, j), f)); if (v.c > MAXC) cells.push('\\cdots'); rows.push(cells.join('&')); }
    if (v.r > MAXR) rows.push(new Array(Math.min(v.c, MAXC)).fill('\\vdots').join('&'));
    if (v.r === 0) return '\\text{пустой массив}';
    return '\\begin{bmatrix}' + rows.join('\\\\') + '\\end{bmatrix}';
  }
  if (v instanceof Rng) { const vals = v.vals.slice(0, 16).map(x => (x instanceof Mat ? fmtValue(x, f) : fmtScalar(x, f))); if (v.vals.length > 16) vals.push('\\vdots'); return '\\begin{array}{r}' + vals.join('\\\\') + '\\end{array}'; }
  if (v instanceof Fn) return '\\text{функция}';
  if (v instanceof Sol) return '\\begin{array}{l}' + v.names.map((nm, k) => nameToTex(nm) + '=' + fmtScalar(v.vals[k], f)).join('\\\\') + '\\end{array}';
  if (v instanceof Str) return '\\text{"' + v.s.replace(/[\\{}]/g, '') + '"}';
  return fmtScalar(v, f);
}
function fmtPlain(v) { if (typeof v === 'number') return String(+v.toPrecision(10)); if (isC(v)) return re(v) + (im(v) < 0 ? '-' : '+') + Math.abs(im(v)) + 'i'; if (v instanceof Str) return v.s; return '[массив]'; }

// ───────────────────────── Дерево → LaTeX (для импорта .xmcd) ─────────────────────────
function nameToTex(name) {
  // имя: base[_sub], base может содержать греческие буквы и '
  const us = name.indexOf('_');
  const base = us >= 0 ? name.slice(0, us) : name, sub = us >= 0 ? name.slice(us + 1) : null;
  const conv = s => { let o = ''; for (const ch of s) { o += GREEK_TO_TEX[ch] ? GREEK_TO_TEX[ch] + ' ' : (ch === "'" ? "'" : ch); } return o.trim(); };
  const isOne = [...base].length === 1 || GREEK_TO_TEX[base];
  let t = isOne ? conv(base) : (/^[A-Za-z]+$/.test(base.replace(/'/g, '')) ? '\\mathrm{' + base.replace(/'/g, '') + '}' + "'".repeat((base.match(/'/g) || []).length) : conv(base));
  if (sub !== null) t += '_{\\mathrm{' + conv(sub) + '}}';
  return t;
}
const PREC = { or: 1, and: 2, cmp: 3, add: 4, mul: 5, neg: 6, pow: 7, atom: 9 };
function toTex(n) { return tex(n, 0); }
function tex(n, p) {
  const wrap = (s, q) => (q < p ? '\\left(' + s + '\\right)' : s);
  switch (n.type) {
    case 'num': { let s = String(n.v); if (/e/.test(s)) { const [m, e] = s.split('e'); s = m + '\\cdot10^{' + parseInt(e) + '}'; return wrap(s, PREC.mul); } return n.v < 0 ? wrap(s, PREC.neg) : s; }
    case 'str': return '\\text{"' + n.v + '"}';
    case 'imag': return String(n.v) + 'i';
    case 'id': return nameToTex(n.name);
    case 'paren': return '\\left(' + tex(n.e, 0) + '\\right)';
    case 'neg': return wrap('-' + tex(n.e, PREC.neg), PREC.neg);
    case 'un': return wrap('\\neg ' + tex(n.e, PREC.neg), PREC.neg);
    case 'bin': {
      const o = n.op;
      if (o === '/') return '\\frac{' + tex(n.l, 0) + '}{' + tex(n.r, 0) + '}';
      if (o === '+' || o === '-') return wrap(tex(n.l, PREC.add) + o + tex(n.r, PREC.add + 1), PREC.add);
      if (o === '·') return wrap(tex(n.l, PREC.mul) + '\\cdot ' + tex(n.r, PREC.mul + 1), PREC.mul);
      const cm = { '<': '<', '>': '>', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '==': '=' }[o];
      if (cm) return wrap(tex(n.l, PREC.cmp + 1) + cm + tex(n.r, PREC.cmp + 1), PREC.cmp);
      if (o === '∧') return wrap(tex(n.l, PREC.and) + '\\land ' + tex(n.r, PREC.and + 1), PREC.and);
      if (o === '∨') return wrap(tex(n.l, PREC.or) + '\\lor ' + tex(n.r, PREC.or + 1), PREC.or);
      return tex(n.l, 0) + o + tex(n.r, 0);
    }
    case 'pow': return wrap(tex(n.b, PREC.pow + 1) + '^{' + tex(n.e, 0) + '}', PREC.pow);
    case 'sqrt': return '\\sqrt{' + tex(n.e, 0) + '}';
    case 'root': return '\\sqrt[' + tex(n.n, 0) + ']{' + tex(n.e, 0) + '}';
    case 'abs': return '\\left|' + tex(n.e, 0) + '\\right|';
    case 'fact': return tex(n.e, PREC.atom) + '!';
    case 'transpose': return tex(n.e, PREC.atom) + '^{T}';
    case 'col': return tex(n.e, PREC.atom) + '^{\\langle ' + tex(n.j, 0) + '\\rangle}';
    case 'matrix': return '\\begin{bmatrix}' + n.rows.map(r => r.map(c => tex(c, 0)).join('&')).join('\\\\') + '\\end{bmatrix}';
    case 'sub': return tex(n.e, PREC.atom) + '_{' + (n.ix ? n.ix.map(x => tex(x, 0)).join(',') : n.raw) + '}';
    case 'call': {
      const std = { sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1, ln: 1, log: 1, exp: 1, sinh: 1, cosh: 1, tanh: 1, max: 1, min: 1, arg: 1, det: 1 };
      const f = std[n.f] ? '\\' + n.f : nameToTex(n.f);
      return f + '\\left(' + n.args.map(a => tex(a, 0)).join(',') + '\\right)';
    }
    case 'range': return tex(n.a, 0) + (n.s ? ',' + tex(n.s, 0) : '') + '..' + tex(n.b, 0);
    case 'int': return '\\int_{' + tex(n.lo, 0) + '}^{' + tex(n.hi, 0) + '}' + tex(n.body, PREC.add) + '\\,\\mathrm{d}' + nameToTex(n.v);
    case 'deriv': return '\\frac{\\mathrm{d}' + (n.order > 1 ? '^{' + n.order + '}' : '') + '}{\\mathrm{d}' + nameToTex(n.v) + (n.order > 1 ? '^{' + n.order + '}' : '') + '}' + tex(n.e, PREC.mul);
    case 'sum': case 'prod': return '\\' + n.type + '_{' + nameToTex(n.v) + (n.from ? '=' + tex(n.from, 0) : '') + '}' + (n.to ? '^{' + tex(n.to, 0) + '}' : '') + tex(n.body, PREC.mul);
    case 'unsupported': return '\\text{' + n.what + '}';
    case 'system': return '\\begin{cases}' + n.eqs.map(e => tex(e, 0)).join('\\\\') + '\\end{cases}';
  }
  return '?';
}
function stmtToTex(st) {
  if (st.type === 'define') return tex(st.lhs, 0) + (st.global ? '\\equiv ' : '\\coloneq ') + tex(st.rhs, 0) + (st.sym ? '\\to ' : st.show ? '=' : '');
  if (st.type === 'eval') return tex(st.expr, 0) + (st.sym ? '\\to ' : '=');
  if (st.type === 'expr') return tex(st.expr, 0);
  return '';
}

const api = { Sol, solveSystem, SheetRunner, SOLVE_FNS, parse, parseList, Parser, tokenize, Env, Ctx, execStatement, evalNode, fmtValue, fmtScalar, fmtReal, DEFAULT_FMT, toTex, stmtToTex, nameToTex,
  C, Mat, Rng, Fn, Str, MathErr, toNum, isNum, re, im, cabs, B, BUILTIN_NAMES, CONSTS, freeRanges, vecOf, asMat, integrate, brent };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatEngine = api;
})(typeof self !== 'undefined' ? self : this);
