// ───────────────────────── Встроенные функции Mathcad: спецфункции, статистика, нормы, подбор ─────────────────────────
// Бессель — приближения из Numerical Recipes (точность ~1e-8), распределения — через неполные гамма- и бета-функции.
const num1 = (a, k, what) => toNum(a[k], what || 'Аргумент');
// обратные тригонометрические под старыми именами Mathcad
def('arcsin', B['asin'].fn); def('arccos', B['acos'].fn); def('arctan', B['atan'].fn); def('arccot', B['acot'].fn);
def('arcsinh', B['asinh'].fn); def('arccosh', B['acosh'].fn); def('arctanh', B['atanh'].fn);
def('sech', realFn(x => 1 / Math.cosh(x))); def('csch', realFn(x => 1 / Math.sinh(x))); def('acoth', realFn(x => 0.5 * Math.log((x + 1) / (x - 1))));
def('asec', realFn(x => Math.acos(1 / x))); def('acsc', realFn(x => Math.asin(1 / x)));
// Ceil(x, y), Floor(x, y), Round(x, y), Trunc(x, y) — кратное y (Mathcad 15); y может быть с единицами
function multipleOf(a, f, name) {
  if (a.length === 1) return B[name.toLowerCase()].fn(a);
  const x = a[0], y = a[1]; if (!dimEq(qd(x), qd(y))) throw unitMismatch(x, y);
  const xv = toNum(qv(x)), yv = toNum(qv(y)); if (yv === 0) throw err(name + ': шаг не может быть нулём');
  return q(f(xv / yv) * yv, qd(x));
}
def('Ceil', a => multipleOf(a, Math.ceil, 'Ceil')); def('Floor', a => multipleOf(a, Math.floor, 'Floor'));
def('Round', a => multipleOf(a, x => Math.sign(x) * Math.round(Math.abs(x)), 'Round')); def('Trunc', a => multipleOf(a, Math.trunc, 'Trunc'));

// ───── функции Бесселя ─────
function bJ0(x) { const ax = Math.abs(x); if (ax < 8) { const y = x * x; return (57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * (-184.9052456)))))) / (57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))))); }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164; const p1 = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6))); const p2 = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2); }
function bJ1(x) { const ax = Math.abs(x); if (ax < 8) { const y = x * x; return x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606)))))) / (144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))))); }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491; const p1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6)))); const p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  return Math.sign(x) * Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2); }
function bY0(x) { if (x <= 0) throw err('Y0: аргумент должен быть > 0'); if (x < 8) { const y = x * x; return (-2957821389.0 + y * (7062834065.0 + y * (-512359803.6 + y * (10879881.29 + y * (-86327.92757 + y * 228.4622733))))) / (40076544269.0 + y * (745249964.8 + y * (7189466.438 + y * (47447.26470 + y * (226.1030244 + y))))) + 0.636619772 * bJ0(x) * Math.log(x); }
  const z = 8 / x, y = z * z, xx = x - 0.785398164; const p1 = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6))); const p2 = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 + y * (-0.934945152e-7))));
  return Math.sqrt(0.636619772 / x) * (Math.sin(xx) * p1 + z * Math.cos(xx) * p2); }
function bY1(x) { if (x <= 0) throw err('Y1: аргумент должен быть > 0'); if (x < 8) { const y = x * x; return x * (-0.4900604943e13 + y * (0.1275274390e13 + y * (-0.5153438139e11 + y * (0.7349264551e9 + y * (-0.4237922726e7 + y * 0.8511937935e4))))) / (0.2499580570e14 + y * (0.4244419664e12 + y * (0.3733650367e10 + y * (0.2245904002e8 + y * (0.1020426050e6 + y * (0.3549632885e3 + y)))))) + 0.636619772 * (bJ1(x) * Math.log(x) - 1 / x); }
  const z = 8 / x, y = z * z, xx = x - 2.356194491; const p1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6)))); const p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  return Math.sqrt(0.636619772 / x) * (Math.sin(xx) * p1 + z * Math.cos(xx) * p2); }
function bI0(x) { const ax = Math.abs(x); if (ax < 3.75) { const y = (x / 3.75) ** 2; return 1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.360768e-1 + y * 0.45813e-2))))); }
  const y = 3.75 / ax; return (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (0.1328592e-1 + y * (0.225319e-2 + y * (-0.157565e-2 + y * (0.916281e-2 + y * (-0.2057706e-1 + y * (0.2635537e-1 + y * (-0.1647633e-1 + y * 0.392377e-2)))))))); }
function bI1(x) { const ax = Math.abs(x); let r; if (ax < 3.75) { const y = (x / 3.75) ** 2; r = ax * (0.5 + y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.2658733e-1 + y * (0.301532e-2 + y * 0.32411e-3)))))); }
  else { const y = 3.75 / ax; r = 0.2282967e-1 + y * (-0.2895312e-1 + y * (0.1787654e-1 - y * 0.420059e-2)); r = 0.39894228 + y * (-0.3988024e-1 + y * (-0.362018e-2 + y * (0.163801e-2 + y * (-0.1031555e-1 + y * r)))); r *= Math.exp(ax) / Math.sqrt(ax); }
  return x < 0 ? -r : r; }
function bK0(x) { if (x <= 0) throw err('K0: аргумент должен быть > 0'); if (x <= 2) { const y = x * x / 4; return -Math.log(x / 2) * bI0(x) + (-0.57721566 + y * (0.42278420 + y * (0.23069756 + y * (0.3488590e-1 + y * (0.262698e-2 + y * (0.10750e-3 + y * 0.74e-5)))))); }
  const y = 2 / x; return Math.exp(-x) / Math.sqrt(x) * (1.25331414 + y * (-0.7832358e-1 + y * (0.2189568e-1 + y * (-0.1062446e-1 + y * (0.587872e-2 + y * (-0.251540e-2 + y * 0.53208e-3)))))); }
function bK1(x) { if (x <= 0) throw err('K1: аргумент должен быть > 0'); if (x <= 2) { const y = x * x / 4; return Math.log(x / 2) * bI1(x) + (1 / x) * (1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.1919402e-1 + y * (-0.110404e-2 + y * (-0.4686e-4))))))); }
  const y = 2 / x; return Math.exp(-x) / Math.sqrt(x) * (1.25331414 + y * (0.23498619 + y * (-0.3655620e-1 + y * (0.1504268e-1 + y * (-0.780353e-2 + y * (0.325614e-2 + y * (-0.68245e-3))))))); }
function bJn(n, x) { // прямая рекурсия при x > n, иначе — обратная (Миллер)
  if (n === 0) return bJ0(x); if (n === 1) return bJ1(x); if (x === 0) return 0;
  const ax = Math.abs(x); let ans;
  if (ax > n) { let bjm = bJ0(ax), bj = bJ1(ax); for (let j = 1; j < n; j++) { const bjp = j * 2 / ax * bj - bjm; bjm = bj; bj = bjp; } ans = bj; }
  else { const m = 2 * Math.floor((n + Math.floor(Math.sqrt(40 * n))) / 2); let jsum = false, bjp = 0, sum = 0, bj = 1; ans = 0;
    for (let j = m; j > 0; j--) { const bjm = j * 2 / ax * bj - bjp; bjp = bj; bj = bjm; if (Math.abs(bj) > 1e10) { bj *= 1e-10; bjp *= 1e-10; ans *= 1e-10; sum *= 1e-10; } if (jsum) sum += bj; jsum = !jsum; if (j === n) ans = bjp; }
    sum = 2 * sum - bj; ans /= sum; }
  return x < 0 && (n & 1) ? -ans : ans;
}
function bYn(n, x) { if (n === 0) return bY0(x); if (n === 1) return bY1(x); let bym = bY0(x), by = bY1(x); for (let j = 1; j < n; j++) { const byp = j * 2 / x * by - bym; bym = by; by = byp; } return by; }
function bIn(n, x) { if (n === 0) return bI0(x); if (n === 1) return bI1(x); if (x === 0) return 0; // обратная рекурсия
  const m = 2 * (n + Math.floor(Math.sqrt(40 * n))); let bip = 0, bi = 1, ans = 0; for (let j = m; j > 0; j--) { const bim = bip + j * 2 / Math.abs(x) * bi; bip = bi; bi = bim; if (Math.abs(bi) > 1e10) { ans *= 1e-10; bi *= 1e-10; bip *= 1e-10; } if (j === n) ans = bip; }
  ans *= bI0(x) / bi; return x < 0 && (n & 1) ? -ans : ans; }
function bKn(n, x) { if (n === 0) return bK0(x); if (n === 1) return bK1(x); let bkm = bK0(x), bk = bK1(x); for (let j = 1; j < n; j++) { const bkp = bkm + j * 2 / x * bk; bkm = bk; bk = bkp; } return bk; }
const besselOrder = (a, f) => { const n = toInt(a[0], 'Порядок функции Бесселя'); if (n < 0 || n > 100) throw err('Порядок функции Бесселя — от 0 до 100'); return mapScalar(a[1], x => f(n, toNum(x))); };
def('J0', a => mapScalar(a[0], x => bJ0(toNum(x)))); def('J1', a => mapScalar(a[0], x => bJ1(toNum(x)))); def('Jn', a => besselOrder(a, bJn));
def('Y0', a => mapScalar(a[0], x => bY0(toNum(x)))); def('Y1', a => mapScalar(a[0], x => bY1(toNum(x)))); def('Yn', a => besselOrder(a, bYn));
def('I0', a => mapScalar(a[0], x => bI0(toNum(x)))); def('I1', a => mapScalar(a[0], x => bI1(toNum(x)))); def('In', a => besselOrder(a, bIn));
def('K0', a => mapScalar(a[0], x => bK0(toNum(x)))); def('K1', a => mapScalar(a[0], x => bK1(toNum(x)))); def('Kn', a => besselOrder(a, bKn));

// ───── распределения ─────
const lnG = x => Math.log(gammaFn(x));
function gammaP(a, x) { // регуляризованная неполная гамма P(a, x)
  if (x <= 0) return 0;
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; } return sum * Math.exp(-x + a * Math.log(x) - lnG(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lnG(a)) * h;
}
function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
  for (let m = 1; m <= 500; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return h; }
function betaI(a, b, x) { // регуляризованная неполная бета I_x(a, b)
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnG(a + b) - lnG(a) - lnG(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
const Phi = x => 0.5 * (1 + (x >= 0 ? 1 : -1) * (1 - gammaQ05(x * x / 2)));
function gammaQ05(y) { return 1 - gammaP(0.5, y); }
function invert(cdf, p, lo, hi, what) { // обратная функция распределения: сужение интервала + Брент
  if (!(p >= 0 && p <= 1)) throw err(what + ': вероятность должна быть от 0 до 1');
  if (p === 0) return lo; if (p === 1) return hi;
  let a = lo, b = hi; if (!isFinite(a)) { a = -1; while (cdf(a) > p) a *= 2; } if (!isFinite(b)) { b = 1; while (cdf(b) < p) b *= 2; }
  return brent(x => cdf(x) - p, a, b, 1e-14 * Math.max(1, Math.abs(a), Math.abs(b)));
}
function qnormStd(p) { // Акклам + уточнение
  if (p <= 0 || p >= 1) throw err('qnorm: вероятность должна быть строго между 0 и 1');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x; const pl = 0.02425;
  if (p < pl) { const qq = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * qq + c[1]) * qq + c[2]) * qq + c[3]) * qq + c[4]) * qq + c[5]) / ((((d[0] * qq + d[1]) * qq + d[2]) * qq + d[3]) * qq + 1); }
  else if (p <= 1 - pl) { const qq = p - 0.5, r = qq * qq; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * qq / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const qq = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * qq + c[1]) * qq + c[2]) * qq + c[3]) * qq + c[4]) * qq + c[5]) / ((((d[0] * qq + d[1]) * qq + d[2]) * qq + d[3]) * qq + 1); }
  for (let k = 0; k < 2; k++) { const e = Phi(x) - p; const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x = x - u / (1 + x * u / 2); }
  return x;
}
const msArgs = (a, k) => ({ m: a.length > k ? num1(a, k) : 0, s: a.length > k + 1 ? num1(a, k + 1) : 1 });
def('cnorm', a => mapScalar(a[0], x => Phi(toNum(x))));
def('qnorm', a => { const { m, s } = msArgs(a, 1); return m + s * qnormStd(num1(a, 0, 'Вероятность')); });
def('rnorm', a => { const n = toInt(a[0]); const { m, s } = msArgs(a, 1); const out = []; for (let i = 0; i < n; i++) out.push(m + s * Math.sqrt(-2 * Math.log(Math.random() || 1e-300)) * Math.cos(2 * Math.PI * Math.random())); return colVec(out); });
const binCdf = (k, n, p) => k < 0 ? 0 : k >= n ? 1 : 1 - betaI(Math.floor(k) + 1, n - Math.floor(k), p);
const lnChoose = (n, k) => lnG(n + 1) - lnG(k + 1) - lnG(n - k + 1);
def('dbinom', a => { const k = num1(a, 0), n = num1(a, 1), p = num1(a, 2); if (k < 0 || k > n || k !== Math.floor(k)) return 0; return Math.exp(lnChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p)); });
def('pbinom', a => binCdf(num1(a, 0), num1(a, 1), num1(a, 2)));
def('qbinom', a => { const pr = num1(a, 0), n = num1(a, 1), p = num1(a, 2); for (let k = 0; k <= n; k++) if (binCdf(k, n, p) >= pr - 1e-14) return k; return n; });
def('dpois', a => { const k = num1(a, 0), l = num1(a, 1); return k < 0 || k !== Math.floor(k) ? 0 : Math.exp(k * Math.log(l) - l - lnG(k + 1)); });
def('ppois', a => { const k = Math.floor(num1(a, 0)), l = num1(a, 1); return k < 0 ? 0 : 1 - gammaP(k + 1, l); });
def('qpois', a => { const pr = num1(a, 0), l = num1(a, 1); for (let k = 0; k < 1e6; k++) if (1 - gammaP(k + 1, l) >= pr - 1e-14) return k; throw err('qpois: не найдено'); });
def('dunif', a => { const x = num1(a, 0), lo = num1(a, 1), hi = num1(a, 2); return x >= lo && x <= hi ? 1 / (hi - lo) : 0; });
def('punif', a => { const x = num1(a, 0), lo = num1(a, 1), hi = num1(a, 2); return Math.min(1, Math.max(0, (x - lo) / (hi - lo))); });
def('qunif', a => { const p = num1(a, 0), lo = num1(a, 1), hi = num1(a, 2); return lo + p * (hi - lo); });
def('dexp', a => { const x = num1(a, 0), r = num1(a, 1); return x < 0 ? 0 : r * Math.exp(-r * x); });
def('pexp', a => { const x = num1(a, 0), r = num1(a, 1); return x < 0 ? 0 : 1 - Math.exp(-r * x); });
def('qexp', a => -Math.log(1 - num1(a, 0)) / num1(a, 1));
const tCdf = (x, d) => { const b = betaI(d / 2, 0.5, d / (d + x * x)) / 2; return x >= 0 ? 1 - b : b; };
def('dt', a => { const x = num1(a, 0), d = num1(a, 1); return Math.exp(lnG((d + 1) / 2) - lnG(d / 2)) / Math.sqrt(d * Math.PI) * Math.pow(1 + x * x / d, -(d + 1) / 2); });
def('pt', a => tCdf(num1(a, 0), num1(a, 1)));
def('qt', a => { const d = num1(a, 1); return invert(x => tCdf(x, d), num1(a, 0), -Infinity, Infinity, 'qt'); });
const chiCdf = (x, d) => x <= 0 ? 0 : gammaP(d / 2, x / 2);
def('dchisq', a => { const x = num1(a, 0), d = num1(a, 1); return x <= 0 ? 0 : Math.exp((d / 2 - 1) * Math.log(x) - x / 2 - (d / 2) * Math.log(2) - lnG(d / 2)); });
def('pchisq', a => chiCdf(num1(a, 0), num1(a, 1)));
def('qchisq', a => { const d = num1(a, 1); return invert(x => chiCdf(x, d), num1(a, 0), 0, Infinity, 'qchisq'); });
const fCdf = (x, d1, d2) => x <= 0 ? 0 : betaI(d1 / 2, d2 / 2, d1 * x / (d1 * x + d2));
def('dF', a => { const x = num1(a, 0), d1 = num1(a, 1), d2 = num1(a, 2); if (x <= 0) return 0; return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (lnG(d1 / 2) + lnG(d2 / 2) - lnG((d1 + d2) / 2))); });
def('pF', a => fCdf(num1(a, 0), num1(a, 1), num1(a, 2)));
def('qF', a => { const d1 = num1(a, 1), d2 = num1(a, 2); return invert(x => fCdf(x, d1, d2), num1(a, 0), 0, Infinity, 'qF'); });
def('dbeta', a => { const x = num1(a, 0), s1 = num1(a, 1), s2 = num1(a, 2); if (x <= 0 || x >= 1) return 0; return Math.exp((s1 - 1) * Math.log(x) + (s2 - 1) * Math.log(1 - x) - (lnG(s1) + lnG(s2) - lnG(s1 + s2))); });
def('pbeta', a => betaI(num1(a, 1), num1(a, 2), num1(a, 0)));
def('qbeta', a => { const s1 = num1(a, 1), s2 = num1(a, 2); return invert(x => betaI(s1, s2, x), num1(a, 0), 0, 1, 'qbeta'); });
def('dgamma', a => { const x = num1(a, 0), s = num1(a, 1); return x <= 0 ? 0 : Math.exp((s - 1) * Math.log(x) - x - lnG(s)); });
def('pgamma', a => gammaP(num1(a, 1), Math.max(0, num1(a, 0))));
def('qgamma', a => { const s = num1(a, 1); return invert(x => gammaP(s, x), num1(a, 0), 0, Infinity, 'qgamma'); });
def('dlnorm', a => { const x = num1(a, 0), { m, s } = msArgs(a, 1); return x <= 0 ? 0 : Math.exp(-((Math.log(x) - m) ** 2) / (2 * s * s)) / (x * s * Math.sqrt(2 * Math.PI)); });
def('plnorm', a => { const x = num1(a, 0), { m, s } = msArgs(a, 1); return x <= 0 ? 0 : Phi((Math.log(x) - m) / s); });
def('qlnorm', a => { const { m, s } = msArgs(a, 1); return Math.exp(m + s * qnormStd(num1(a, 0))); });
def('Beta', a => Math.exp(lnG(num1(a, 0)) + lnG(num1(a, 1)) - lnG(num1(a, 0) + num1(a, 1))));
def('erfinv', a => qnormStd((num1(a, 0) + 1) / 2) / Math.SQRT2);

// ───── нормы и собственные векторы ─────
const absNum = x => toNum(cabs(x));
def('norme', a => { const m = asMat(a[0]); return Math.sqrt(m.a.reduce((s, x) => s + absNum(x) ** 2, 0)); });
def('norm1', a => { const m = asMat(a[0]); let best = 0; for (let j = 0; j < m.c; j++) { let s = 0; for (let i = 0; i < m.r; i++) s += absNum(m.get(i, j)); best = Math.max(best, s); } return best; });
def('normi', a => { const m = asMat(a[0]); let best = 0; for (let i = 0; i < m.r; i++) { let s = 0; for (let j = 0; j < m.c; j++) s += absNum(m.get(i, j)); best = Math.max(best, s); } return best; });
def('norm2', a => { // наибольшее сингулярное число: степенной метод для MᵀM
  const m = asMat(a[0]); const A = transpose(m), AtA = matmul(A, m); let v = colVec(Array(AtA.r).fill(1)), lam = 0;
  for (let k = 0; k < 500; k++) { const w = matmul(AtA, v); const nw = Math.sqrt(w.a.reduce((s, x) => s + toNum(x) ** 2, 0)); if (nw === 0) return 0; v = new Mat(w.r, 1, w.a.map(x => toNum(x) / nw)); if (Math.abs(nw - lam) <= 1e-14 * nw) { lam = nw; break; } lam = nw; }
  return Math.sqrt(lam);
});
def('eigenvec', a => { // обратные итерации: (M − λE)·v = b, нормировка на 1
  const m = asMat(a[0]); if (m.r !== m.c) throw err('eigenvec: нужна квадратная матрица'); const lam = num1(a, 1, 'Собственное значение'); const n = m.r;
  const shift = lam + 1e-10 * Math.max(1, Math.abs(lam)); const S = new Mat(n, n, m.a.map(x => toNum(x))); for (let i = 0; i < n; i++) S.set(i, i, S.get(i, i) - shift);
  let v = colVec(Array.from({ length: n }, (_, i) => 1 + 0.1 * i));
  for (let k = 0; k < 6; k++) { const w = luSolve(S, v); const nw = Math.sqrt(w.a.reduce((s, x) => s + toNum(x) ** 2, 0)); v = new Mat(n, 1, w.a.map(x => toNum(x) / nw)); }
  let big = 0; for (let i = 0; i < n; i++) if (Math.abs(v.a[i]) > Math.abs(v.a[big])) big = i; if (v.a[big] < 0) v = new Mat(n, 1, v.a.map(x => -x)); // знак — как у Mathcad: наибольшая компонента положительна
  return v;
});
def('eigenvecs', a => { const m = asMat(a[0]); const vals = vecOf(B['eigenvals'].fn([m])); const cols = vals.map(l => B['eigenvec'].fn([m, re(l)])); const out = new Mat(m.r, cols.length); cols.forEach((c, j) => { for (let i = 0; i < m.r; i++) out.set(i, j, c.a[i]); }); return out; });
def('cond2', a => { const m = asMat(a[0]); return B['norm2'].fn([m]) * B['norm2'].fn([luSolve(m, identity(m.r))]); });
def('conde', a => { const m = asMat(a[0]); return B['norme'].fn([m]) * B['norme'].fn([luSolve(m, identity(m.r))]); });

// ───── подбор и регрессия ─────
// linfit(vx, vy, F): F(x) — вектор базисных функций; коэффициенты по МНК (нормальные уравнения через QR-устойчивый LU)
def('linfit', (a, ctx) => {
  const vx = vecOf(ctx.ev(a[0])).map(x => toNum(x)), vy = vecOf(ctx.ev(a[1])).map(x => toNum(x)); const F = evalArg(a[2], ctx.env, ctx);
  if (!(F instanceof Fn)) throw err('linfit: третий аргумент — функция, возвращающая вектор базисных функций');
  const rows = vx.map(x => vecOf(ctx.callFn(F, [x])).map(v => toNum(v))); const k = rows[0].length;
  const A = new Mat(vx.length, k); rows.forEach((r, i) => r.forEach((v, j) => A.set(i, j, v)));
  const At = transpose(A); return luSolve(matmul(At, A), matmul(At, colVec(vy)));
}, true);
def('line', a => { const x = vecOf(a[0]).map(v => toNum(v)), y = vecOf(a[1]).map(v => toNum(v)); const c = polyfit(x, y, 1); return colVec([c[0], c[1]]); });
def('stderr', a => { const x = vecOf(a[0]).map(v => toNum(v)), y = vecOf(a[1]).map(v => toNum(v)); const c = polyfit(x, y, 1); const n = x.length; const ss = x.reduce((s, xi, i) => s + (y[i] - c[0] - c[1] * xi) ** 2, 0); return Math.sqrt(ss / (n - 2)); });
def('cumsum', a => { const v = vecOf(a[0]); let s = 0; return colVec(v.map(x => (s = cadd(s, x)))); });
def('rsort', a => { const m = asMat(a[0]); const i0 = toInt(a[1]); const idx = [...Array(m.c).keys()].sort((p, r) => toNum(m.get(i0, p)) - toNum(m.get(i0, r))); const out = new Mat(m.r, m.c); idx.forEach((j, jj) => { for (let i = 0; i < m.r; i++) out.set(i, jj, m.get(i, j)); }); return out; });
// hist(границы, данные): число значений в каждом интервале [b_i, b_(i+1)); hist(n, данные) — n равных интервалов
def('hist', a => {
  const all = v => v instanceof Rng ? v.vals : asMat(v).a; // диапазон, вектор или матрица — все значения
  const data = all(a[1]).map(x => toNum(x)); let edges;
  if (a[0] instanceof Mat || a[0] instanceof Rng) edges = all(a[0]).map(x => toNum(x));
  else { const n = toInt(a[0], 'Число интервалов'); const lo = Math.min(...data), hi = Math.max(...data); edges = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n); }
  const cnt = new Array(edges.length - 1).fill(0);
  for (const x of data) for (let i = 0; i < cnt.length; i++) { const last = i === cnt.length - 1; if (x >= edges[i] && (x < edges[i + 1] || (last && x === edges[i + 1]))) { cnt[i]++; break; } }
  return colVec(cnt);
});
def('histogram', a => { const c = vecOf(B['hist'].fn(a)); const data = vecOf(a[1]).map(x => toNum(x)); let edges; if (a[0] instanceof Mat) edges = vecOf(a[0]).map(x => toNum(x)); else { const n = toInt(a[0]); const lo = Math.min(...data), hi = Math.max(...data); edges = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n); } const m = new Mat(c.length, 2); c.forEach((v, i) => { m.set(i, 0, (edges[i] + edges[i + 1]) / 2); m.set(i, 1, v); }); return m; });

// ───── ОДУ: адаптивные методы и краевая задача ─────
// Рунге–Кутта–Фельберга 4(5) с контролем шага между точками вывода (Rkadapt, Bulstoer, Stiffb, Radau …)
function rk45To(D, x, y, xe, tol) {
  let h = (xe - x) / 8; const dir = Math.sign(xe - x) || 1; let guard = 0;
  while ((xe - x) * dir > 1e-15 * Math.max(1, Math.abs(xe))) {
    if (++guard > 1e6) throw err('ОДУ: слишком много шагов (жёсткая система?)'); tick();
    if ((x + h - xe) * dir > 0) h = xe - x;
    const k1 = D(x, y), y2 = y.map((v, i) => v + h * k1[i] / 4), k2 = D(x + h / 4, y2);
    const y3 = y.map((v, i) => v + h * (3 * k1[i] + 9 * k2[i]) / 32), k3 = D(x + 3 * h / 8, y3);
    const y4 = y.map((v, i) => v + h * (1932 * k1[i] - 7200 * k2[i] + 7296 * k3[i]) / 2197), k4 = D(x + 12 * h / 13, y4);
    const y5 = y.map((v, i) => v + h * (439 / 216 * k1[i] - 8 * k2[i] + 3680 / 513 * k3[i] - 845 / 4104 * k4[i])), k5 = D(x + h, y5);
    const y6 = y.map((v, i) => v + h * (-8 / 27 * k1[i] + 2 * k2[i] - 3544 / 2565 * k3[i] + 1859 / 4104 * k4[i] - 11 / 40 * k5[i])), k6 = D(x + h / 2, y6);
    const yn = y.map((v, i) => v + h * (16 / 135 * k1[i] + 6656 / 12825 * k3[i] + 28561 / 56430 * k4[i] - 9 / 50 * k5[i] + 2 / 55 * k6[i]));
    let e = 0; for (let i = 0; i < y.length; i++) { const ei = Math.abs(h * (1 / 360 * k1[i] - 128 / 4275 * k3[i] - 2197 / 75240 * k4[i] + 1 / 50 * k5[i] + 2 / 55 * k6[i])); e = Math.max(e, ei / (tol * (1 + Math.abs(yn[i])))); }
    if (!isFinite(e)) { h /= 4; continue; }
    if (e <= 1) { x += h; y = yn; }
    h *= Math.min(4, Math.max(0.1, 0.9 * Math.pow(1 / Math.max(e, 1e-10), 0.2)));
  }
  return y;
}
function odeFn(D, ctx, name, n) { return (x, y) => { const r = ctx.callFn(D, [x, colVec(y)]); const v = r instanceof Mat ? r.a.map(t => toNum(t)) : [toNum(r)]; if (v.length !== n) throw err(name + ': D должна возвращать вектор той же длины, что y'); return v; }; }
def('Rkadapt rkadapt Bulstoer bulstoer Stiffb stiffb Stiffr stiffr Radau radau', (a, ctx) => {
  if (a.length < 5) throw err('Rkadapt(y, x1, x2, npoints, D)');
  const y0 = vecOf(a[0]).map(x => toNum(x)), x1 = toNum(a[1]), x2 = toNum(a[2]), n = toInt(a[3]); const D = a[4];
  if (!(D instanceof Fn)) throw err('Rkadapt: D должна быть функцией D(x, y)'); if (n < 1 || n > 200000) throw err('число точек 1…200000');
  const f = odeFn(D, ctx, 'Rkadapt', y0.length); const out = new Mat(n + 1, y0.length + 1); let y = y0;
  for (let s = 0; s <= n; s++) { const x = x1 + (x2 - x1) * s / n; if (s) y = rk45To(f, x1 + (x2 - x1) * (s - 1) / n, y, x, 1e-10); out.set(s, 0, x); y.forEach((v, i) => out.set(s, i + 1, v)); }
  return out;
});
// sbval(v, x1, x2, D, load, score): недостающие начальные условия методом стрельбы
def('sbval', (a, ctx) => {
  if (a.length !== 6) throw err('sbval(v, x1, x2, D, load, score)');
  const v0 = vecOf(a[0]).map(x => toNum(x)), x1 = toNum(a[1]), x2 = toNum(a[2]); const [D, load, score] = a.slice(3);
  if (![D, load, score].every(f => f instanceof Fn)) throw err('sbval: D, load и score — функции');
  const y0 = v => vecOf(ctx.callFn(load, [x1, colVec(v)])).map(x => toNum(x));
  const n = y0(v0).length; const f = odeFn(D, ctx, 'sbval', n);
  const resid = v => { const yend = rk45To(f, x1, y0(v), x2, 1e-10); const r = vecOf(ctx.callFn(score, [x2, colVec(yend)])).map(x => toNum(x)); r.scale = 1; return r; };
  const res = levmar(resid, v0); if (!(Math.sqrt(res.cost) < 1e-6)) throw err('sbval: не удалось подобрать начальные условия — измените приближение v');
  return colVec(res.x);
});
