// ───────────────────────── Форматирование ─────────────────────────
const DEFAULT_FMT = { decimals: 3, expThreshold: 3, imagUnit: 'i' };
function fmtReal(x, f) {
  f = f || DEFAULT_FMT;
  if (!isFinite(x)) return isNaN(x) ? '\\text{NaN}' : (x > 0 ? '\\infty' : '-\\infty');
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e307) return x > 0 ? '\\infty' : '-\\infty';
  if (ax >= Math.pow(10, f.expThreshold) || ax < Math.pow(10, -f.expThreshold)) {
    let e = Math.floor(Math.log10(ax)); let m = x / Math.pow(10, e);
    let ms = trimZeros(roundHalfUp(m, f.decimals));
    if (Math.abs(parseFloat(ms)) >= 10) { e += 1; ms = trimZeros(roundHalfUp(x / Math.pow(10, e), f.decimals)); }
    if (ms === '1' ) return '10^{' + e + '}';
    if (ms === '-1') return '-10^{' + e + '}';
    return ms + '\\times10^{' + e + '}';
  }
  let s = trimZeros(roundHalfUp(x, f.decimals));
  if (s === '-0') s = '0';
  // группы разрядов не ставим (как Mathcad 15)
  return s;
}
function roundHalfUp(x, d) { const k = Math.pow(10, d); const r = Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9) / k; return r.toFixed(d); }
function trimZeros(s) { if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s; }
function fmtScalar(v, f) {
  if (typeof v === 'number') return fmtReal(v, f);
  if (v instanceof Q) return fmtScalar(v.v, f) + '\\,' + dimTex(v.d);
  if (isC(v)) {
    f = f || DEFAULT_FMT; const thr = Math.pow(10, -(f.decimals + 12));
    const r = Math.abs(v.re) < 1e-15 * Math.abs(v.im) ? 0 : v.re, i = Math.abs(v.im) < 1e-15 * Math.abs(v.re) ? 0 : v.im;
    const iu = f.imagUnit || 'i';
    const is = fmtReal(Math.abs(i), f); const ipart = (is === '1' ? '' : is) + iu;
    if (r === 0 && i === 0) return '0';
    if (i === 0) return fmtReal(r, f);
    if (r === 0) return (i < 0 ? '-' : '') + ipart;
    return fmtReal(r, f) + (i < 0 ? '-' : '+') + ipart;
  }
  return '?';
}
function fmtValue(v, f, unitTex) {
  if (unitTex) return fmtValue(v, f) + '\\,' + unitTex;
  if (v instanceof Mat && v.a.length && v.a.some(x => x instanceof Q) && v.a.every(x => x === 0 || dimEq(qd(x), qd(v.a.find(y => y instanceof Q))))) {
    const d = qd(v.a.find(y => y instanceof Q)); return fmtValue(new Mat(v.r, v.c, v.a.map(qv)), f) + '\\,' + dimTex(d);
  }
  if (v instanceof Mat) {
    const MAXR = 14, MAXC = 8;
    const rows = []; for (let i = 0; i < Math.min(v.r, MAXR); i++) { const cells = []; for (let j = 0; j < Math.min(v.c, MAXC); j++) { const x = v.get(i, j); cells.push(x instanceof Mat ? '\\{' + x.r + '\\times ' + x.c + '\\}' : fmtScalar(x, f)); } /* вложенный массив — как в Mathcad: {3×1} */ if (v.c > MAXC) cells.push('\\cdots'); rows.push(cells.join('&')); }
    if (v.r > MAXR) rows.push(new Array(Math.min(v.c, MAXC)).fill('\\vdots').join('&'));
    if (v.r === 0) return '\\text{пустой массив}';
    return '\\begin{bmatrix}' + rows.join('\\\\') + '\\end{bmatrix}';
  }
  if (v instanceof Rng) { const vals = v.vals.slice(0, 16).map(x => (x instanceof Mat ? fmtValue(x, f) : fmtScalar(x, f))); if (v.vals.length > 16) vals.push('\\vdots'); return '\\begin{array}{r}' + vals.join('\\\\') + '\\end{array}'; }
  if (v instanceof Fn) return '\\text{функция}';
  if (v instanceof Sol) return '\\begin{array}{l}' + v.names.map((nm, k) => nameToTex(nm) + '=' + fmtScalar(v.vals[k], f)).join('\\\\') + '\\end{array}';
  if (v instanceof Str) return '\\text{"' + v.s.replace(/[\\{}]/g, '') + '"}';
  return fmtScalar(v, f);
}
function fmtPlain(v) { if (typeof v === 'number') return String(+v.toPrecision(10)); if (isC(v)) return re(v) + (im(v) < 0 ? '-' : '+') + Math.abs(im(v)) + 'i'; if (v instanceof Str) return v.s; return '[массив]'; }

