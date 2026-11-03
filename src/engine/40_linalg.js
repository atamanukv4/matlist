// ───────────────────────── Вычисление ─────────────────────────
// Окружение: цепочка областей. На длинном листе каждое := добавляет звено, и поиск имени шёл бы через сотни звеньев —
// поэтому SheetRunner схлопывает цепочку листа в один снимок (flat). Окружения циклов меняются (set) — их не схлопываем.
class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent || null; this.depth = parent ? parent.depth + 1 : 0; }
  get(n) { for (let e = this; e; e = e.parent) { const v = e.vars.get(n); if (v !== undefined || e.vars.has(n)) return v; } return undefined; }
  has(n) { for (let e = this; e; e = e.parent) if (e.vars.has(n)) return true; return false; }
  set(n, v) { this.vars.set(n, v); this._flat = null; }
  child() { return new Env(this); }
  flat() {
    if (this._flat) return this._flat;
    const chain = []; for (let e = this; e; e = e.parent) chain.push(e);
    const F = new Env(null); for (let k = chain.length - 1; k >= 0; k--) for (const [n, v] of chain[k].vars) F.vars.set(n, v);
    return (this._flat = F);
  }
}

const CONSTS = { 'π': Math.PI, e: Math.E, i: new C(0, 1), j: new C(0, 1), ORIGIN: 0, TOL: 1e-3, CTOL: 1e-3 };

function toNum(v, what) {
  if (typeof v === 'number') return v;
  if (isC(v)) { if (Math.abs(v.im) < 1e-12 * Math.max(1, Math.abs(v.re))) return v.re; throw err((what || 'Значение') + ' должно быть вещественным'); }
  if (v instanceof Mat) { if (v.r === 1 && v.c === 1) return toNum(v.a[0], what); throw err((what || 'Значение') + ' должно быть скаляром, а не матрицей'); }
  if (v instanceof Rng) throw err('Ранжированная переменная здесь не допускается');
  if (v instanceof Q) throw err((what || 'Значение') + ' должно быть безразмерным (сейчас ' + dimText(v.d) + ')');
  if (v instanceof TempScale) throw err(v.name + ' пишется после числа: 20 ' + v.name);
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
  if (a instanceof Mat) return new Mat(a.r, a.c, a.a.map(x => f(x, b))); // как в Mathcad: скаляр прибавляется к каждому элементу
  if (b instanceof Mat) return new Mat(b.r, b.c, b.a.map(x => f(a, x)));
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
