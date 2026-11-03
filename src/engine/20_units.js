// ───────────────────────── Единицы измерения (как в Mathcad, система СИ) ─────────────────────────
// Размерность — 7 показателей: [м, кг, с, А, К, моль, кд]. Величина с ненулевой размерностью — Q(v, d);
// безразмерные значения остаются обычными числами, поэтому весь остальной код работает как раньше.
class Q { constructor(v, d) { this.v = v; this.d = d; } }
const D0 = [0, 0, 0, 0, 0, 0, 0];
const isQ = x => x instanceof Q;
function q(v, d) { for (let k = 0; k < 7; k++) if (Math.abs(d[k]) > 1e-12) return new Q(v, d); return v; }
const qv = x => isQ(x) ? x.v : x, qd = x => isQ(x) ? x.d : D0;
function dimEq(a, b) { for (let k = 0; k < 7; k++) if (Math.abs(a[k] - b[k]) > 1e-9) return false; return true; }
const dAdd = (a, b, s) => a.map((x, k) => x + s * b[k]);
const dScale = (a, s) => a.map(x => x * s);
function isZeroVal(x) { return x === 0; }
function unitMismatch(a, b) { return err('Несовместимые единицы: ' + dimText(qd(a)) + ' и ' + dimText(qd(b))); }
function qadd(a, b, sub) {
  if (isZeroVal(a)) return sub ? qneg(b) : b; if (isZeroVal(b)) return a; // 0 совместим с любой размерностью (Σ, mean …)
  if (!dimEq(qd(a), qd(b))) throw unitMismatch(a, b);
  return q(sub ? csub(qv(a), qv(b)) : cadd(qv(a), qv(b)), qd(a));
}
function qneg(a) { return isQ(a) ? new Q(cneg(a.v), a.d) : cneg(a); }
// [имя, множитель в СИ, размерность м кг с А К моль кд]
const UNIT_DEFS = [
  ['m', 1, [1]], ['cm', 1e-2, [1]], ['mm', 1e-3, [1]], ['km', 1e3, [1]], ['μm', 1e-6, [1]], ['nm', 1e-9, [1]],
  ['ft', 0.3048, [1]], ['in', 0.0254, [1]], ['yd', 0.9144, [1]], ['mi', 1609.344, [1]], ['nmi', 1852, [1]], ['Å', 1e-10, [1]], ['mil', 2.54e-5, [1]],
  ['kg', 1, [0, 1]], ['gm', 1e-3, [0, 1]], ['mg', 1e-6, [0, 1]], ['μg', 1e-9, [0, 1]], ['tonne', 1e3, [0, 1]], ['mton', 1e3, [0, 1]], ['ton', 907.18474, [0, 1]], ['lb', 0.45359237, [0, 1]], ['oz', 0.028349523125, [0, 1]], ['slug', 14.593902937, [0, 1]], ['amu', 1.66053906660e-27, [0, 1]],
  ['s', 1, [0, 0, 1]], ['ms', 1e-3, [0, 0, 1]], ['μs', 1e-6, [0, 0, 1]], ['ns', 1e-9, [0, 0, 1]], ['ps', 1e-12, [0, 0, 1]], ['min', 60, [0, 0, 1]], ['hr', 3600, [0, 0, 1]], ['day', 86400, [0, 0, 1]], ['wk', 604800, [0, 0, 1]], ['yr', 31557600, [0, 0, 1]],
  ['A', 1, [0, 0, 0, 1]], ['mA', 1e-3, [0, 0, 0, 1]], ['μA', 1e-6, [0, 0, 0, 1]], ['nA', 1e-9, [0, 0, 0, 1]], ['kA', 1e3, [0, 0, 0, 1]],
  ['K', 1, [0, 0, 0, 0, 1]], ['R', 5 / 9, [0, 0, 0, 0, 1]], ['Δ°C', 1, [0, 0, 0, 0, 1]], ['Δ°F', 5 / 9, [0, 0, 0, 0, 1]],
  ['mol', 1, [0, 0, 0, 0, 0, 1]], ['mmol', 1e-3, [0, 0, 0, 0, 0, 1]], ['kmol', 1e3, [0, 0, 0, 0, 0, 1]],
  ['cd', 1, [0, 0, 0, 0, 0, 0, 1]], ['lm', 1, [0, 0, 0, 0, 0, 0, 1]], ['lx', 1, [-2, 0, 0, 0, 0, 0, 1]],
  ['hectare', 1e4, [2]], ['ha', 1e4, [2]], ['acre', 4046.8564224, [2]],
  ['L', 1e-3, [3]], ['l', 1e-3, [3]], ['liter', 1e-3, [3]], ['mL', 1e-6, [3]], ['ml', 1e-6, [3]], ['cc', 1e-6, [3]], ['gal', 3.785411784e-3, [3]], ['qt', 9.46352946e-4, [3]], ['pt', 4.73176473e-4, [3]], ['fl_oz', 2.95735295625e-5, [3]],
  ['mph', 0.44704, [1, 0, -1]], ['kph', 1 / 3.6, [1, 0, -1]], ['knot', 1852 / 3600, [1, 0, -1]],
  ['g', 9.80665, [1, 0, -2]],
  ['N', 1, [1, 1, -2]], ['kN', 1e3, [1, 1, -2]], ['MN', 1e6, [1, 1, -2]], ['mN', 1e-3, [1, 1, -2]], ['dyne', 1e-5, [1, 1, -2]], ['lbf', 4.4482216152605, [1, 1, -2]], ['kgf', 9.80665, [1, 1, -2]], ['kip', 4448.2216152605, [1, 1, -2]], ['tonf', 8896.443230521, [1, 1, -2]],
  ['Pa', 1, [-1, 1, -2]], ['kPa', 1e3, [-1, 1, -2]], ['MPa', 1e6, [-1, 1, -2]], ['GPa', 1e9, [-1, 1, -2]], ['hPa', 100, [-1, 1, -2]], ['bar', 1e5, [-1, 1, -2]], ['mbar', 100, [-1, 1, -2]], ['atm', 101325, [-1, 1, -2]],
  ['psi', 6894.757293168, [-1, 1, -2]], ['ksi', 6894757.293168, [-1, 1, -2]], ['torr', 101325 / 760, [-1, 1, -2]], ['mmHg', 133.322387415, [-1, 1, -2]], ['inHg', 3386.388640341, [-1, 1, -2]], ['in_Hg', 3386.388640341, [-1, 1, -2]], ['mm_Hg', 133.322387415, [-1, 1, -2]], ['mmH2O', 9.80665, [-1, 1, -2]], ['ftH2O', 2989.06692, [-1, 1, -2]], ['inH2O', 249.08891, [-1, 1, -2]],
  ['J', 1, [2, 1, -2]], ['kJ', 1e3, [2, 1, -2]], ['MJ', 1e6, [2, 1, -2]], ['GJ', 1e9, [2, 1, -2]], ['mJ', 1e-3, [2, 1, -2]], ['cal', 4.1868, [2, 1, -2]], ['kcal', 4186.8, [2, 1, -2]], ['Gcal', 4.1868e9, [2, 1, -2]], ['BTU', 1055.05585262, [2, 1, -2]], ['erg', 1e-7, [2, 1, -2]], ['eV', 1.602176634e-19, [2, 1, -2]], ['keV', 1.602176634e-16, [2, 1, -2]], ['MeV', 1.602176634e-13, [2, 1, -2]], ['kWh', 3.6e6, [2, 1, -2]], ['Wh', 3600, [2, 1, -2]], ['MWh', 3.6e9, [2, 1, -2]],
  ['W', 1, [2, 1, -3]], ['kW', 1e3, [2, 1, -3]], ['MW', 1e6, [2, 1, -3]], ['GW', 1e9, [2, 1, -3]], ['mW', 1e-3, [2, 1, -3]], ['μW', 1e-6, [2, 1, -3]], ['hp', 745.69987158227, [2, 1, -3]],
  ['Hz', 1, [0, 0, -1]], ['kHz', 1e3, [0, 0, -1]], ['MHz', 1e6, [0, 0, -1]], ['GHz', 1e9, [0, 0, -1]], ['rpm', 1 / 60, [0, 0, -1]], ['Bq', 1, [0, 0, -1]],
  ['C', 1, [0, 0, 1, 1]], ['mC', 1e-3, [0, 0, 1, 1]], ['μC', 1e-6, [0, 0, 1, 1]],
  ['V', 1, [2, 1, -3, -1]], ['mV', 1e-3, [2, 1, -3, -1]], ['μV', 1e-6, [2, 1, -3, -1]], ['kV', 1e3, [2, 1, -3, -1]], ['MV', 1e6, [2, 1, -3, -1]],
  ['Ω', 1, [2, 1, -3, -2]], ['ohm', 1, [2, 1, -3, -2]], ['kΩ', 1e3, [2, 1, -3, -2]], ['MΩ', 1e6, [2, 1, -3, -2]], ['mΩ', 1e-3, [2, 1, -3, -2]],
  ['S', 1, [-2, -1, 3, 2]], ['mS', 1e-3, [-2, -1, 3, 2]], ['μS', 1e-6, [-2, -1, 3, 2]], ['mho', 1, [-2, -1, 3, 2]],
  ['F', 1, [-2, -1, 4, 2]], ['mF', 1e-3, [-2, -1, 4, 2]], ['μF', 1e-6, [-2, -1, 4, 2]], ['nF', 1e-9, [-2, -1, 4, 2]], ['pF', 1e-12, [-2, -1, 4, 2]],
  ['H', 1, [2, 1, -2, -2]], ['mH', 1e-3, [2, 1, -2, -2]], ['μH', 1e-6, [2, 1, -2, -2]], ['nH', 1e-9, [2, 1, -2, -2]],
  ['Wb', 1, [2, 1, -2, -1]], ['T', 1, [0, 1, -2, -1]], ['mT', 1e-3, [0, 1, -2, -1]], ['μT', 1e-6, [0, 1, -2, -1]], ['gauss', 1e-4, [0, 1, -2, -1]], ['maxwell', 1e-8, [2, 1, -2, -1]],
  ['Oe', 1000 / (4 * Math.PI), [-1, 0, 0, 1]],
  ['Gy', 1, [2, 0, -2]], ['Sv', 1, [2, 0, -2]],
  ['poise', 0.1, [-1, 1, -1]], ['stokes', 1e-4, [2, 0, -1]],
  
  ['rad', 1, []], ['deg', Math.PI / 180, []], ['°', Math.PI / 180, []], ['sr', 1, []], ['rev', 2 * Math.PI, []], ['arcmin', Math.PI / 10800, []], ['arcsec', Math.PI / 648000, []], ['%', 0.01, []], ['ppm', 1e-6, []], ['ppb', 1e-9, []]
];
const UNITS = new Map();
for (const [n, f, d] of UNIT_DEFS) { const dd = D0.map((_, k) => d[k] || 0); UNITS.set(n, { name: n, v: q(f, dd), f, d: dd }); }
// °C и °F — постфиксные функции Mathcad: 20 °C = 293.15 K
class TempScale { constructor(name, k, off) { this.name = name; this.k = k; this.off = off; } }
const TEMP = { '°C': new TempScale('°C', 1, 273.15), '°F': new TempScale('°F', 5 / 9, 459.67 * 5 / 9) };
const DK = [0, 0, 0, 0, 1, 0, 0];
function tempApply(a, ts) { // x °C → кельвины
  const one = x => { if (isQ(x)) throw err('Перед ' + ts.name + ' — число без единиц'); return q(cadd(cmul(x, ts.k), ts.off), DK); };
  if (a instanceof Mat) return new Mat(a.r, a.c, a.a.map(one));
  return one(a);
}
function unitOf(name) { const u = UNITS.get(name); return u ? u.v : undefined; }
// имена производных единиц, которыми Mathcad показывает результат в СИ
const SI_SHOW = [['N', [1, 1, -2]], ['J', [2, 1, -2]], ['W', [2, 1, -3]], ['Pa', [-1, 1, -2]], ['C', [0, 0, 1, 1]], ['V', [2, 1, -3, -1]], ['Ω', [2, 1, -3, -2]], ['F', [-2, -1, 4, 2]], ['S', [-2, -1, 3, 2]], ['H', [2, 1, -2, -2]], ['Wb', [2, 1, -2, -1]], ['T', [0, 1, -2, -1]], ['Hz', [0, 0, -1]]].map(([n, d]) => [n, D0.map((_, k) => d[k] || 0)]);
const BASE_NAMES = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'], SHOW_ORDER = [1, 0, 2, 3, 4, 5, 6];
function powTex(p) { const r = Math.round(p * 1000) / 1000; return r === 1 ? '' : '^{' + r + '}'; }
function dimTex(d) {
  for (const [n, sd] of SI_SHOW) if (dimEq(d, sd)) return '\\mathrm{' + n + '}';
  const num = [], den = [];
  for (const k of SHOW_ORDER) { const p = d[k]; if (Math.abs(p) < 1e-12) continue; (p > 0 ? num : den).push('\\mathrm{' + BASE_NAMES[k] + '}' + powTex(Math.abs(p))); }
  const n = num.join('\\cdot ') || '1';
  return den.length ? '\\frac{' + n + '}{' + den.join('\\cdot ') + '}' : n;
}
function dimText(d) { const t = []; d.forEach((p, k) => { if (Math.abs(p) > 1e-12) t.push(BASE_NAMES[k] + (p === 1 ? '' : '^' + (Math.round(p * 1000) / 1000))); }); return t.join('·') || 'безразмерная'; }
// значение без единиц (в СИ) — для графиков, таблиц, внешних функций
function unitless(v) { if (isQ(v)) return v.v; if (v instanceof Mat) return new Mat(v.r, v.c, v.a.map(unitless)); return v; }
// показ значения в заданных единицах (unitOverride Mathcad): { value, unitTex }
function inUnits(v, u, uTex) {
  if (u instanceof TempScale) {
    const one = x => { if (!dimEq(qd(x), DK)) throw err('Результат — не температура, ' + u.name + ' не подходит'); return (toNum(qv(x)) - u.off) / u.k; };
    return { value: v instanceof Mat ? new Mat(v.r, v.c, v.a.map(one)) : one(v), unitTex: uTex };
  }
  const ud = qd(u), uv = qv(u); let rest = null; // как Mathcad: несовпавшая часть размерности дописывается после выбранных единиц
  const one = x => { if (!dimEq(qd(x), ud)) rest = dAdd(qd(x), ud, -1); return cdiv(qv(x), uv); };
  const value = v instanceof Mat ? new Mat(v.r, v.c, v.a.map(one)) : one(v);
  return { value, unitTex: rest ? uTex + '\\cdot ' + dimTex(rest) : uTex };
}

class MathErr extends Error { constructor(msg, node) { super(msg); this.node = node; } }
function err(m, n) { return new MathErr(m, n); }

