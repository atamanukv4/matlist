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
const PROG_KW = new Set(['if', 'otherwise', 'else', 'for', 'while', 'break', 'continue', 'return', 'on', 'error']);
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
          if (nx && nx.v === '.') { i++; continue; } // \left. пустая скобка
          continue;
        }
        if (GREEK[x.v]) { out.push({ k: 'ch', v: GREEK[x.v] }); continue; }
        if ((x.v === 'mathbf' || x.v === 'textbf') && this.t[i + 1] && this.t[i + 1].v === '{') { // \mathbf{if} — слово программы Mathcad
          let j = i + 2, w = ''; while (j < this.t.length && this.t[j].k === 'ch' && /^[a-z]$/.test(this.t[j].v)) w += this.t[j++].v;
          if (this.t[j] && this.t[j].v === '}' && PROG_KW.has(w)) { out.push({ k: 'kw', v: w === 'else' ? 'otherwise' : w }); i = j; continue; }
        }
        const map = {
          cdot: '·', times: '×', div: '÷', ast: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', lt: '<', gt: '>',
          coloneq: ':=', coloneqq: ':=', equiv: '≡', land: '∧', wedge: '∧', lor: '∨', vee: '∨', neg: '¬', lnot: '¬', lbrack: '[', rbrack: ']',
          lbrace: '{', rbrace: '}', vert: '|', lvert: '|', rvert: '|', mid: '|', infty: '∞', prime: "'", ldots: '..', dots: '..', cdots: '..',
          to: '→', rightarrow: '→', '%': '%', '{': '{', '}': '}', '_': '_', imaginaryI: 'i', exponentialE: 'e', differentialD: 'ⅆ', pm: '±',
          langle: '⟨', rangle: '⟩', leftarrow: '←', gets: '←', in: '∈', degree: '°', circ: '°', oplus: '⊕', placeholder: '■'
        };
        if (map[x.v] !== undefined) {
          const v = map[x.v];
          if (['·', '×', '÷', '≤', '≥', '≠', '<', '>', ':=', '≡', '∧', '∨', '¬', '..', '→', '±', '⊕', '←', '∈'].includes(v)) out.push({ k: 'op', v });
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
    let showAfter = false, sym = false, unit = null;
    { // «… = [ед]» — показать результат в заданных единицах (unitOverride Mathcad)
      const L = this.t.length, lt = this.t[L - 1];
      if (lt && lt.k === 'ch' && lt.v === ']') {
        let dd = 0, j = L - 1;
        for (; j >= 0; j--) { const y = this.t[j]; if (y.k === 'ch' && y.v === ']') dd++; if (y.k === 'ch' && y.v === '[') { dd--; if (!dd) break; } }
        const eqT = this.t[j - 1];
        if (j > 0 && eqT && eqT.k === 'ch' && eqT.v === '=') {
          const up = this.sub(this.t.slice(j + 1, L - 1));
          if (!up.eof()) { unit = up.parseExpr(); if (!up.eof()) throw err('Не удалось разобрать единицы: ' + up.restText()); }
          this.t = this.t.slice(0, j); // оставить «=»
        }
      }
    }
    const last = this.t[this.t.length - 1];
    if (last && last.k === 'ch' && last.v === '=') { this.t.pop(); showAfter = true; }
    else if (last && last.k === 'op' && last.v === '→') { this.t.pop(); showAfter = true; sym = true; } // «→» Mathcad: значение показывается и наследуется
    if (defAt >= 0) {
      const lp = this.sub(this.t.slice(0, defAt)); const lhs = lp.parseExpr(); if (!lp.eof()) throw err('Неверная левая часть определения');
      const rp = this.sub(this.t.slice(defAt + 1)); const rhs = rp.parseRangeOrExpr(); if (!rp.eof()) throw err('Не удалось разобрать: ' + rp.restText());
      const st = { type: 'define', global: defOp === '≡', lhs, rhs, show: showAfter }; if (sym) st.sym = true; if (unit && showAfter) st.unit = unit; return st;
    }
    const e = this.parseExpr(); if (!this.eof()) throw err('Не удалось разобрать: ' + this.restText());
    if (sym) return { type: 'eval', expr: e, sym: true };
    if (showAfter) { const st = { type: 'eval', expr: e }; if (unit) st.unit = unit; return st; }
    return { type: 'expr', expr: e };
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
    if (x.k === 'op' || x.k === 'kw') return false;
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
    if (this.progAt(this.p + 1)) return false; // «|» программы — не модуль и не умножение
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
        if (e.type === 'id' && !toks.length) { e = { type: 'id', name: e.name + '_' }; continue; } // x_{\,} — имя с пустым индексом (Mathcad)
        if (lit || e.type !== 'id') {
          if (e.type === 'id') { e = { type: 'id', name: e.name + '_' + raw }; continue; }
        }
        let ix = null; try { const p = this.sub(toks); const tmp = []; tmp.push(p.parseExpr()); while (p.is(',')) { p.next(); tmp.push(p.parseExpr()); } if (p.eof()) ix = tmp; } catch (x) { ix = null; }
        e = { type: 'sub', e, raw: raw.replace(/\s/g, ''), ix }; continue;
      }
      if (this.is('!')) { this.next(); e = { type: 'fact', e }; continue; }
      if (this.is("'")) { this.next(); if (e.type === 'id') e = { type: 'id', name: e.name + "'" }; continue; }
      if (this.is('%')) { this.next(); e = { type: 'bin', op: '·', l: e, r: { type: 'num', v: 0.01 } }; continue; }
      if (this.is('°')) { this.next(); e = { type: 'bin', op: '·', l: e, r: { type: 'id', name: this.degName() } }; continue; }
      if (this.is('(') && (e.type === 'id')) { this.next(); const args = this.parseArgs(')'); e = { type: 'call', f: e.name, args }; continue; }
      break;
    }
    return e;
  }
  degName() { // после «°»: °C, °F или просто градус
    const x = this.peek();
    if (x && x.k === 'ch' && (x.v === 'C' || x.v === 'F')) { this.next(); return '°' + x.v; }
    if (x && x.k === 'cmd' && (x.v === 'mathrm' || x.v === 'text')) { const save = this.p; this.next(); const t = this.groupTokens(); const r = this.groupRaw(t).replace(/\s/g, ''); if (r === 'C' || r === 'F') return '°' + r; this.p = save; }
    return '°';
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
      if (x.v === '|' && this.progAt(this.p)) return this.parseProgram();
      if (x.v === '|') { const e = this.parseExpr(); this.expect('|'); return { type: 'abs', e }; }
      if (x.v === '∞') return { type: 'num', v: 1e307 };
      if (x.v === '%') return { type: 'id', name: '%', u: true }; // встроенная единица Mathcad: 11·% = 0.11
      if (x.v === '°') return { type: 'id', name: this.degName() };
      if (x.v === 'Δ' && this.is('°')) { this.next(); return { type: 'id', name: 'Δ' + this.degName() }; }
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
        const nm = this.readIdent(name); const idn = { type: 'id', name: nm };
        if (c === 'mathrm' && (UNITS.has(nm) || TEMP[nm])) idn.u = true;
        return idn;
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
  // ───── программы Mathcad: \left|\begin{aligned}&строка\\&строка\end{aligned}\right. ─────
  progAt(i) { const a = this.t[i], b = this.t[i + 1], c = this.t[i + 2]; return a && a.k === 'cmd' && a.v === 'begin' && b && b.v === '{' && c && c.k === 'ch' && c.v === 'a' && /^aligned\}/.test(this.t.slice(i + 2, i + 10).map(x => x.v).join('')); }
  parseProgram() {
    this.next(); this.groupTokens(); // \begin{aligned}
    const rows = [[]]; let d = 0;
    while (!this.eof()) {
      const x = this.next();
      if (x.k === 'cmd' && x.v === 'begin') d++;
      if (x.k === 'cmd' && x.v === 'end') { if (d === 0) { this.groupTokens(); break; } d--; }
      if (d === 0 && x.k === 'cmd' && x.v === '\\') { rows.push([]); continue; }
      if (d === 0 && x.k === 'ch' && x.v === '&') continue;
      rows[rows.length - 1].push(x);
    }
    const lines = rows.filter(r => r.length).map(r => this.sub(r).parseProgLine());
    if (!lines.length) throw err('Пустая программа');
    return { type: 'prog', lines };
  }
  topIndex(toks, pred) { let d = 0; for (let i = 0; i < toks.length; i++) { const x = toks[i]; if ((x.k === 'ch' && (x.v === '{' || x.v === '(' || x.v === '[')) || (x.k === 'cmd' && x.v === 'begin')) d++; if ((x.k === 'ch' && (x.v === '}' || x.v === ')' || x.v === ']')) || (x.k === 'cmd' && x.v === 'end')) d--; if (d === 0 && pred(x)) return i; } return -1; }
  progBody(toks) { // тело: вложенная программа или одна строка
    const p = this.sub(toks);
    if (p.is('|') && p.progAt(1)) { p.next(); const pr = p.parseProgram(); if (!p.eof()) throw err('Не удалось разобрать: ' + p.restText()); return pr; }
    return { type: 'prog', lines: [p.parseProgLine()] };
  }
  parseProgLine() {
    const toks = this.t.slice(this.p); this.p = this.t.length; const kw = toks[0] && toks[0].k === 'kw' ? toks[0].v : null;
    const exprOf = (ts, range) => { const p = this.sub(ts); const e = range ? p.parseRangeOrExpr() : p.parseExpr(); if (!p.eof()) throw err('Не удалось разобрать: ' + p.restText()); return e; };
    const splitBody = (ts) => { // «условие тело»: тело — с «|» программы или после первого выражения
      const p = this.sub(ts); const e = p.parseRangeOrExpr(); const rest = ts.slice(p.p); if (!rest.length) throw err('Нет тела цикла'); return [e, this.progBody(rest)];
    };
    if (kw === 'for') {
      const inAt = this.topIndex(toks, x => x.k === 'op' && x.v === '∈'); if (inAt < 0) throw err('for: ожидалось «i ∈ диапазон»');
      const v = exprOf(toks.slice(1, inAt)); if (v.type !== 'id') throw err('for: переменная цикла — имя');
      const [range, body] = splitBody(toks.slice(inAt + 1)); return { k: 'for', v: v.name, range, body };
    }
    if (kw === 'while') { const [cond, body] = splitBody(toks.slice(1)); return { k: 'while', cond, body }; }
    const ifAt = this.topIndex(toks, x => x.k === 'kw' && x.v === 'if');
    if (ifAt > 0) return { k: 'if', body: this.progBody(toks.slice(0, ifAt)), cond: exprOf(toks.slice(ifAt + 1)) };
    const owAt = this.topIndex(toks, x => x.k === 'kw' && x.v === 'otherwise');
    if (owAt > 0) return { k: 'else', body: this.progBody(toks.slice(0, owAt)) };
    const onAt = this.topIndex(toks, x => x.k === 'kw' && x.v === 'on');
    if (onAt > 0 && toks[onAt + 1] && toks[onAt + 1].v === 'error') return { k: 'onerr', body: this.progBody(toks.slice(0, onAt)), alt: this.progBody(toks.slice(onAt + 2)) };
    if (kw === 'break' || kw === 'continue') return { k: kw };
    if (kw === 'return') return { k: 'return', e: exprOf(toks.slice(1)) };
    const setAt = this.topIndex(toks, x => x.k === 'op' && x.v === '←');
    if (setAt > 0) return { k: 'set', lhs: exprOf(toks.slice(0, setAt)), rhs: exprOf(toks.slice(setAt + 1), true) };
    return { k: 'expr', e: exprOf(toks) };
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

