// ───────────────────────── Лист: выполнение определений ─────────────────────────
function markUnits(n) { if (!n || typeof n !== 'object') return n; if (Array.isArray(n)) return n.map(markUnits); if (n.type === 'id') return Object.assign({}, n, { unit: true }, (UNITS.has(n.name) || TEMP[n.name]) ? { u: true } : {}); const o = {}; for (const k in n) o[k] = markUnits(n[k]); return o; }
function execStatement(st, env, opts) {
  const res = execStatement0(st, env, opts);
  if (st.unit && res.value !== undefined && res.value !== null && !(res.value instanceof Fn)) {
    const ctx = new Ctx(env, opts); let u; ctxPure.on = true; try { u = evalNode(markUnits(st.unit), env, ctx); } finally { ctxPure.on = false; } const ut = tex(markUnits(st.unit), 0);
    if (res.value instanceof Rng) { let t = ut; const vals = res.value.vals.map(x => { const r = inUnits(x, u, ut); t = r.unitTex; return r.value; }); res.shown = new Rng(vals); res.unitTex = t; }
    else { const r = inUnits(res.value, u, ut); res.shown = r.value; res.unitTex = r.unitTex; }
  }
  return res;
}
function execStatement0(st, env, opts) {
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
      value = new Rng(vals); newEnv.set(keyOf(lhs), value);
      return { env: newEnv, value: st.show ? value : undefined, name: lhs.name };
    }
    if (lhs.type === 'id') {
      const fr = freeRanges(st.rhs, env, new Set(), []);
      if (fr.length) throw err('Справа ранжированная переменная «' + fr[0] + '» — используйте индекс: ' + lhs.name + '_' + fr[0] + ' := …');
      value = evalNode(st.rhs, env, ctx);
      if (value instanceof Fn && st.rhs.type === 'id') value = new Fn(value.params, value.body, value.env, lhs.name);
      newEnv.set(keyOf(lhs), value); return { env: newEnv, value: st.show ? value : undefined, name: lhs.name };
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
      const name = keyOf(lhs.e); const o = ORIGIN(env);
      const fr = freeRanges(lhs.ix || [], env, new Set(), []);
      let cur = env.get(name); let M = cur instanceof Mat ? new Mat(cur.r, cur.c, cur.a.slice()) : new Mat(0, 1, []); let lastV;
      const assign = (local) => {
        tick();
        const idx = lhs.ix.map(x => toInt(evalNode(x, local, ctx)) - o);
        if (cur !== undefined || M.r) local.set(name, M); // x_i := x_{i-1} + h — справа видны уже вычисленные элементы (как в Mathcad)
        const v = toScalar(evalNode(st.rhs, local, ctx));
        const i = idx[0], j = idx.length > 1 ? idx[1] : 0;
        if (i < 0 || j < 0) throw err('Отрицательный индекс');
        if (i >= M.r || j >= M.c) { const nr = Math.max(M.r, i + 1), nc = Math.max(M.c, j + 1); const N = new Mat(nr, nc); for (let p = 0; p < M.r; p++) for (let q = 0; q < M.c; q++) N.set(p, q, M.get(p, q)); M = N; }
        M.set(i, j, v); lastV = v;
      };
      if (!lhs.ix) throw err('Неверный индекс в левой части');
      if (fr.length) {
        const local = env.child();
        const loop = (k) => { if (k === fr.length) return assign(local); for (const v of env.get(fr[k]).vals) { local.set(fr[k], v); loop(k + 1); } };
        loop(0);
      } else assign(env.child());
      newEnv.set(name, M); return { env: newEnv, value: st.show ? (fr.length ? M : lastV) : undefined, name };
    }
    throw err('Неверная левая часть определения');
  }
  if (st.type === 'eval' || st.type === 'expr') {
    if (st.type === 'expr') return { env };
    const fr = freeRanges(st.expr, env, new Set(), []);
    if (fr.length) { // таблица значений по ранжированной переменной
      const rv = env.get(fr[0]).vals; const local = env.child(); const out = [];
      if (rv.length > 2000) throw err('Слишком длинная таблица');
      for (const v of rv) { tick(); local.set(fr[0], v); const r = evalNode(st.expr, local, ctx); out.push(r); }
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
    this.env = out.env.depth > 6 ? out.env.flat() : out.env; out.before = before; return out;
  }
}

