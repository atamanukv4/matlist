// Лимит времени на вычисление (интерфейс не должен зависать): budget(мс) — включить, budget(null) — снять.
// tick() вызывается в тяжёлых циклах; по истечении бросает TimeoutErr, и дальше каждый tick() бросает сразу,
// поэтому даже циклы, которые глотают ошибки, быстро завершаются.
class TimeoutErr extends Error { constructor() { super('Вычисление прервано: слишком долго'); this.timeout = true; } }
const BUDGET = { until: 0, dead: false, n: 0 };
function budget(ms) { BUDGET.until = ms == null ? 0 : Date.now() + ms; BUDGET.dead = false; BUDGET.n = 0; }
const budgetExpired = () => BUDGET.dead || (BUDGET.until > 0 && Date.now() > BUDGET.until);
function tick() { if (!BUDGET.until) return; if (BUDGET.dead) throw new TimeoutErr(); if ((++BUDGET.n & 127) === 0 && Date.now() > BUDGET.until) { BUDGET.dead = true; throw new TimeoutErr(); } }
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
// ∫ f от a до b. Глобально-адаптивная квадратура Гаусса–Кронрода 7-15 (делится отрезок с наибольшей ошибкой)
// с лимитом работы, как в Mathcad: точность — относительная TOL_INT, при исчерпании лимита — лучшая оценка.
// Бесконечный предел: участки растущей длины [a, a+L], [a+L, a+3L]…, пока вклад не станет пренебрежимым.
let INT_RTOL = 1e-7, INT_DEPTH = 0; const INT_NESTED_RTOL = 1e-4, INT_STACK = [];
const intRtol = () => { const fr = INT_STACK[INT_STACK.length - 1]; return fr && fr.nested ? Math.max(INT_RTOL, INT_NESTED_RTOL) : INT_RTOL; }; const INT_MAXSEG = 300, INT_INF = 1e300; // вложенные интегралы считаются грубее (как TOL в Mathcad)
const GK_X = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0];
const GK_WK = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728];
const GK_WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];
function gk15(f, a, b) {
  tick(); const c = (a + b) / 2, h = (b - a) / 2; const fc = f(c); let k = GK_WK[7] * fc, g = GK_WG[3] * fc, ka = GK_WK[7] * Math.abs(fc);
  for (let i = 0; i < 7; i++) { const dx = h * GK_X[i]; const f1 = f(c - dx), f2 = f(c + dx); const s = f1 + f2; k += GK_WK[i] * s; ka += GK_WK[i] * (Math.abs(f1) + Math.abs(f2)); if (i % 2 === 1) g += GK_WG[(i - 1) / 2] * s; }
  if (!isFinite(k)) throw err('Подынтегральная функция не определена на отрезке (деление на ноль?)');
  return { a, b, v: k * h, e: Math.abs((k - g) * h), va: ka * Math.abs(h) };
}
// точность: относительно |∫f| и (для знакопеременных, где ∫f ≈ 0) относительно ∫|f|
function integrateFinite(f, a, b, maxSeg, absTol) {
  const segs = [gk15(f, a, b)]; let tot = segs[0].v, er = segs[0].e, ab = segs[0].va;
  while (segs.length < maxSeg && er > Math.max(absTol || 0, intRtol() * Math.abs(tot), intRtol() * 1e-3 * ab, 1e-300)) {
    let w = 0; for (let i = 1; i < segs.length; i++) if (segs[i].e > segs[w].e) w = i;
    const s0 = segs[w], m = (s0.a + s0.b) / 2; if (m === s0.a || m === s0.b) break;
    const L = gk15(f, s0.a, m), R = gk15(f, m, s0.b);
    segs[w] = L; segs.push(R); tot += L.v + R.v - s0.v; er += L.e + R.e - s0.e; ab += L.va + R.va - s0.va;
  }
  return { v: tot, e: er, va: ab };
}
function integrateInf(f, a, dir) { // ∫ от a до ±∞ (знак: dir = −1 даёт ∫ от a до −∞)
  let sum = 0, asum = 0, L = Math.max(1, Math.abs(a)), x = a, small = 0;
  for (let k = 0; k < 80; k++) {
    const y = x + dir * L; const scale = Math.max(Math.abs(sum), 1e-3 * asum);
    const r = integrateFinite(f, Math.min(x, y), Math.max(x, y), 120, intRtol() * 0.1 * scale); const part = dir * r.v; // хвост: точность относительно всей суммы
    sum += part; asum += r.va;
    if (Math.abs(part) <= intRtol() * 0.1 * Math.max(Math.abs(sum), 1e-3 * asum) && r.va <= intRtol() * asum || r.va < 1e-300) { if (++small >= 2) break; } else small = 0;
    x = y; L *= 2; if (Math.abs(x) > 1e150) break;
  }
  return sum;
}
function integrate(f, a, b) {
  // вложенный интеграл (∫∫, переходная характеристика через ВЧХ): и внутренний, и внешний — с точностью 1e-4,
  // иначе внешний пытается добиться точности, которой нет у внутреннего, и считает бесконечно долго
  const save = INT_RTOL; INT_DEPTH++; if (INT_DEPTH > 1) { INT_RTOL = Math.max(save, INT_NESTED_RTOL); INT_STACK.forEach(fr => { fr.nested = true; }); }
  const frame = { nested: false }; INT_STACK.push(frame);
  try { return integrate0(f, a, b); } finally { INT_STACK.pop(); INT_DEPTH--; INT_RTOL = save; }
}
function integrate0(f, a, b) {
  if (a === b) return 0;
  if (a > b) return -integrate0(f, b, a);
  const ia = a <= -INT_INF, ib = b >= INT_INF;
  if (ia && ib) return integrateInf(f, 0, 1) - integrateInf(f, 0, -1);
  if (ib) return integrateInf(f, a, 1);
  if (ia) return -integrateInf(f, b, -1);
  return integrateFinite(f, a, b, INT_MAXSEG).v;
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

