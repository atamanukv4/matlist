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
    // прочие выражения внутри Given (подписи, промежуточные выводы) Mathcad в решение не берёт
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
