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

