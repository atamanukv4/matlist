// ───────────────────────── Комплексные числа ─────────────────────────
class C { constructor(re, im) { this.re = re; this.im = im; } }
const isC = v => v instanceof C;
const isNum = v => typeof v === 'number' || isC(v) || v instanceof Q;
const re = v => isC(v) ? v.re : v;
const im = v => isC(v) ? v.im : 0;
function nq(a, f) { if (a instanceof Q) throw err('Аргумент ' + f + ' должен быть безразмерным (сейчас ' + dimText(a.d) + ')'); }
function mk(r, i) { return (i === 0 || Math.abs(i) < 1e-300) ? r : new C(r, i); }
function cadd(a, b) { if (typeof a === 'number' && typeof b === 'number') return a + b; if (a instanceof Q || b instanceof Q) return qadd(a, b); return mk(re(a) + re(b), im(a) + im(b)); }
function csub(a, b) { if (typeof a === 'number' && typeof b === 'number') return a - b; if (a instanceof Q || b instanceof Q) return qadd(a, b, true); return mk(re(a) - re(b), im(a) - im(b)); }
function cmul(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a * b;
  if (a instanceof Q || b instanceof Q) return q(cmul(qv(a), qv(b)), dAdd(qd(a), qd(b), 1));
  return mk(re(a) * re(b) - im(a) * im(b), re(a) * im(b) + im(a) * re(b));
}
function cdiv(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { if (b === 0) throw err('Деление на ноль'); return a / b; }
  if (a instanceof Q || b instanceof Q) return q(cdiv(qv(a), qv(b)), dAdd(qd(a), qd(b), -1));
  const d = re(b) * re(b) + im(b) * im(b); if (d === 0) throw err('Деление на ноль');
  return mk((re(a) * re(b) + im(a) * im(b)) / d, (im(a) * re(b) - re(a) * im(b)) / d);
}
function cabs(a) { if (typeof a === 'number') return Math.abs(a); if (a instanceof Q) return new Q(cabs(a.v), a.d); return Math.hypot(a.re, a.im); }
function carg(a) { if (a instanceof Q) a = a.v; return Math.atan2(im(a), re(a)); }
function cexp(a) { if (typeof a === 'number') return Math.exp(a); nq(a, 'exp'); const e = Math.exp(a.re); return mk(e * Math.cos(a.im), e * Math.sin(a.im)); }
function cln(a) {
  nq(a, 'ln');
  if (typeof a === 'number' && a > 0) return Math.log(a);
  if (typeof a === 'number' && a === 0) throw err('ln(0) не определён');
  return mk(Math.log(cabs(a)), carg(a));
}
function cpow(a, b) {
  if (b instanceof Q && cabs(b.v) === 0) b = 0; // e^(0·с⁻¹) = 1: нулевой показатель с единицами допустим (Mathcad)
  if (b instanceof Q) throw err('Показатель степени должен быть безразмерным');
  if (a instanceof Q) { const p = toNum(b, 'Показатель степени величины с единицами'); return q(cpow(a.v, p), dScale(a.d, p)); }
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
  if (a instanceof Q) return q(csqrt(a.v), dScale(a.d, 0.5));
  if (typeof a === 'number') return a >= 0 ? Math.sqrt(a) : mk(0, Math.sqrt(-a));
  const r = cabs(a), t = carg(a) / 2, s = Math.sqrt(r); return mk(s * Math.cos(t), s * Math.sin(t));
}
function cneg(a) { if (typeof a === 'number') return -a; if (a instanceof Q) return new Q(cneg(a.v), a.d); return mk(-a.re, -a.im); }
function csin(a) { if (typeof a === 'number') return Math.sin(a); nq(a, 'sin'); return mk(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im)); }
function ccos(a) { if (typeof a === 'number') return Math.cos(a); nq(a, 'cos'); return mk(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im)); }

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

