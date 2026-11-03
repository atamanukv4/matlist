// ───────────────────────── Перенос результатов между фоновым потоком и интерфейсом ─────────────────────────
// Фоновый поток (src/calcworker.js) считает лист и для каждого региона присылает, какие имена он определил (delta).
// Интерфейс повторяет лист без вычислений: SheetRunner.replay ставит эти значения, функции создаёт сам (это дёшево).
function serVal(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof C) return { c: [v.re, v.im] };
  if (v instanceof Q) return { q: serVal(v.v), d: v.d };
  if (v instanceof Mat) return { m: [v.r, v.c, v.a.map(serVal)] };
  if (v instanceof Rng) return { rg: v.vals.map(serVal) };
  if (v instanceof Str) return { s: v.s };
  if (v instanceof Fn) return { fn: 1 };
  if (v instanceof TempScale) return { ts: v.name };
  return { fn: 1 }; // прочее (решения систем и т. п.) — интерфейс пересоздаст сам
}
function deserVal(o) {
  if (o === null || typeof o === 'number') return o;
  if (o.c) return new C(o.c[0], o.c[1]);
  if (o.q !== undefined) return new Q(deserVal(o.q), o.d);
  if (o.m) return new Mat(o.m[0], o.m[1], o.m[2].map(deserVal));
  if (o.rg) return new Rng(o.rg.map(deserVal));
  if (o.s !== undefined) return new Str(o.s);
  if (o.ts) return TEMP[o.ts];
  return undefined;
}
// что регион добавил в окружение: имена, значение которых изменилось
function envDelta(before, after) {
  if (after === before) return {};
  const seen = new Set(), out = {};
  for (let e = after; e && e !== before && e !== before._flat; e = e.parent) for (const [n, v] of e.vars) { if (seen.has(n)) continue; seen.add(n); if (before.get(n) !== v) out[n] = serVal(v); }
  return out;
}
SheetRunner.prototype.replay = function (st, delta) { // как step(), но значения уже посчитаны в фоне
  const before = { env: this.env, given: this.given ? this.given.slice() : null };
  if (st.type === 'expr' && st.expr.type === 'id' && /^given$/i.test(st.expr.name)) { this.given = []; return { before, given: true }; }
  if (this.given && st.type === 'expr') { if (st.expr.type === 'system') this.given.push(...st.expr.eqs); else this.given.push(st.expr); return { before, constraint: true }; }
  const closes = this.given && callsAny(st, SOLVE_FNS);
  try {
    if (!delta) return { before }; // в фоне — ошибка: окружение не меняется
    const keys = Object.keys(delta);
    if (keys.some(k => delta[k] && delta[k].fn)) { const out = execStatement(st, this.env, { given: this.given }); this.env = out.env.depth > 6 ? out.env.flat() : out.env; return { before }; }
    if (keys.length) { const e = this.env.child(); for (const k of keys) e.set(k, deserVal(delta[k])); this.env = e.depth > 6 ? e.flat() : e; }
    return { before };
  } finally { if (closes) this.given = null; }
};
