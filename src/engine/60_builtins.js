const BUILTIN_NAMES = new Set();
function realFn(f) { return (args) => { if (args.length !== 1) throw err('Ожидался один аргумент'); return mapScalar(args[0], x => f(toNum(x))); }; }
function mapScalarU(v, f) { if (v instanceof Mat) return new Mat(v.r, v.c, v.a.map(f)); return f(v); }
function mapScalar(v, f) { const g = x => { if (x instanceof Q) throw err('Нужна безразмерная величина (сейчас ' + dimText(x.d) + ')'); return f(x); }; if (v instanceof Mat) return new Mat(v.r, v.c, v.a.map(g)); return g(v); }
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
def('sqrt', a => mapScalarU(a[0], csqrt));
def('abs', a => mapScalarU(a[0], cabs));
def('floor', realFn(Math.floor)); def('ceil', realFn(Math.ceil)); def('trunc', realFn(Math.trunc));
def('round', a => { const x = toNum(a[0]); const n = a.length > 1 ? toInt(a[1]) : 0; const k = Math.pow(10, n); return Math.round(x * k) / k; });
def('mod', a => { const x = toNum(a[0]), y = toNum(a[1]); if (y === 0) throw err('mod: деление на ноль'); return x - y * Math.trunc(x / y); });
def('sign', realFn(Math.sign)); def('signum', a => { const v = a[0]; const r = cabs(v); return r === 0 ? 0 : cdiv(v, r); });
def('Re', a => mapScalarU(a[0], x => x instanceof Q ? q(re(x.v), x.d) : re(x))); def('Im', a => mapScalarU(a[0], x => x instanceof Q ? q(im(x.v), x.d) : im(x))); def('arg', a => mapScalar(a[0], carg));
def('csgn', a => { const v = a[0]; return re(v) > 0 || (re(v) === 0 && im(v) >= 0) ? 1 : -1; });
def('Φ', a => mapScalar(a[0], x => toNum(x) >= 0 ? 1 : 0)); def('Heaviside', B['Φ'].fn);
def('δ', a => (toNum(a[0]) === toNum(a[1]) ? 1 : 0));
def('if', (a, ctx) => { if (a.length !== 3) throw err('if(условие, если да, если нет)'); const c = toNum(ctx.ev(a[0])); return ctx.ev(c !== 0 ? a[1] : a[2]); }, true);
function flat(args) { const out = []; for (const v of args) { if (v instanceof Mat) out.push(...v.a); else if (v instanceof Rng) out.push(...v.vals); else out.push(v); } return out; }
function sameDims(v, f) { const d = qd(v[0]); if (!v.every(x => dimEq(qd(x), d))) throw err(f + ': значения с разными единицами'); return d; }
def('max', a => { const v = flat(a); if (!v.length) throw err('max: нет значений'); const d = sameDims(v, 'max'); return q(Math.max(...v.map(x => toNum(qv(x)))), d); });
def('min', a => { const v = flat(a); if (!v.length) throw err('min: нет значений'); const d = sameDims(v, 'min'); return q(Math.min(...v.map(x => toNum(qv(x)))), d); });
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
def('interp', a => { const vs = vecOf(a[0]).map(x => toNum(x)), vx = vecOf(a[1]).map(x => toNum(x)), vy = vecOf(a[2]).map(x => toNum(x));
  if (vs.length >= 4 && vs[0] === 3 && vs[1] === 3 && vs.length === vs[2] + 4) { const c = vs.slice(3); return mapScalar(a[3], x => { const t = toNum(x); let r = 0; for (let k = c.length - 1; k >= 0; k--) r = r * t + c[k]; return r; }); } // результат regress
  return mapScalar(a[3], x => splineAt(vs, vx, vy, toNum(x))); });
function polyfit(vx, vy, k) { // МНК: коэффициенты по возрастанию степени
  const n = k + 1; const A = new Mat(n, n), b = new Mat(n, 1);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { let s = 0; for (let p = 0; p < vx.length; p++) s += Math.pow(vx[p], i + j); A.set(i, j, s); } let s = 0; for (let p = 0; p < vx.length; p++) s += vy[p] * Math.pow(vx[p], i); b.a[i] = s; }
  return luSolve(A, b).a;
}
def('regress', a => { const vx = vecOf(a[0]).map(x => toNum(x)), vy = vecOf(a[1]).map(x => toNum(x)), k = toInt(a[2]); if (vx.length !== vy.length) throw err('regress: векторы разной длины'); if (k < 1 || k >= vx.length) throw err('regress: степень от 1 до ' + (vx.length - 1)); return colVec([3, 3, k].concat(polyfit(vx, vy, k))); });
def('slope', a => polyfit(vecOf(a[0]).map(x => toNum(x)), vecOf(a[1]).map(x => toNum(x)), 1)[1]);
def('intercept', a => polyfit(vecOf(a[0]).map(x => toNum(x)), vecOf(a[1]).map(x => toNum(x)), 1)[0]);
def('corr', a => { const x = vecOf(a[0]).map(v => toNum(v)), y = vecOf(a[1]).map(v => toNum(v)); const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); });
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
