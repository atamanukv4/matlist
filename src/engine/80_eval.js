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

const ctxPure = { on: false }; // при выводе в заданных единицах имена единиц не переопределяются
function keyOf(n) { return n.u ? n.name + '#u' : n.name; }
function lookup(name, env, node) {
  const v = env.get(name);
  if (node && node.u) { // \mathrm{m} из файла Mathcad — единица (или её переопределение в листе), а не переменная m
    if (!(ctxPure && ctxPure.on) && env.has(name + '#u')) return env.get(name + '#u');
    const u0 = UNITS.get(name); if (u0) return u0.v; if (TEMP[name]) return TEMP[name];
  }
  if (v !== undefined) return v;
  if (name in CONSTS) return CONSTS[name];
  const u = UNITS.get(name); if (u) return u.v;
  if (TEMP[name]) return TEMP[name];
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
    case 'sqrt': return mapScalarU(evalNode(n.e, env, ctx), csqrt);
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
function chk(v) { if (v instanceof TempScale) throw err(v.name + ' пишется после числа: 20 ' + v.name); if (v instanceof Rng) throw err('Ранжированная переменная здесь не допускается'); if (v instanceof Fn) throw err('Функцию нужно вызвать с аргументами'); if (v instanceof Str) throw err('Арифметика со строкой'); return v; }
function cmpVals(a, b) { // сравнение с учётом единиц (0 сравним с любой величиной)
  if (a instanceof Q || b instanceof Q) { if (!isZeroVal(a) && !isZeroVal(b) && !dimEq(qd(a), qd(b))) throw unitMismatch(a, b); return toNum(qv(a)) - toNum(qv(b)); }
  return toNum(a) - toNum(b);
}
function evalBin(n, env, ctx) {
  const op = n.op;
  if (op === '∧') return toNum(evalNode(n.l, env, ctx)) !== 0 && toNum(evalNode(n.r, env, ctx)) !== 0 ? 1 : 0;
  if (op === '∨') return toNum(evalNode(n.l, env, ctx)) !== 0 || toNum(evalNode(n.r, env, ctx)) !== 0 ? 1 : 0;
  // неявное умножение «имя(…)» уже разобрано как вызов
  const a = evalNode(n.l, env, ctx), b = evalNode(n.r, env, ctx);
  if (op === '·' && b instanceof TempScale) return tempApply(chk(a), b); // 20 °C
  if (op === '·' && a instanceof TempScale) return tempApply(chk(b), a);
  switch (op) {
    case '+': if (a instanceof Str && b instanceof Str) return new Str(a.s + b.s); return addAny(a, b);
    case '-': return elementwise(chk(a), chk(b), csub, '-');
    case '±': return elementwise(chk(a), chk(b), cadd, '+');
    case '·': return mulAny(a, b);
    case '/': { if (b instanceof Mat) { if (b.r === b.c && b.r > 1 && a instanceof Mat) return matmul(a, luSolve(b, identity(b.r))); if (b.c === 1 || b.r === 1) return elementwise(chk(a), b, cdiv, '/'); throw err('Деление на матрицу'); } return elementwise(chk(a), chk(b), cdiv, '/'); }
    case '<': return cmpVals(a, b) < 0 ? 1 : 0;
    case '>': return cmpVals(a, b) > 0 ? 1 : 0;
    case '≤': return cmpVals(a, b) <= 0 ? 1 : 0;
    case '≥': return cmpVals(a, b) >= 0 ? 1 : 0;
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
  if (n.type === 'id' && !bound.has(n.name) && env.get(keyOf(n)) instanceof Rng && !out.includes(keyOf(n))) out.push(keyOf(n));
  if (n.type === 'sub' && n.e.type === 'id') { /* базовое имя индексируется — проверим индекс */ }
  let nb = bound;
  if ((n.type === 'sum' || n.type === 'prod' || n.type === 'int') && n.v) { nb = new Set(bound); nb.add(n.v); }
  for (const k in n) if (k !== 'type' && n[k] && typeof n[k] === 'object') freeRanges(n[k], env, (k === 'body' ? nb : bound), out);
  return out;
}

