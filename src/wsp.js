// Матлист — свойства воды и водяного пара (IAPWS-IF97) и идеальных газов в стиле WaterSteamPro 6.6.
// Все функции принимают и возвращают числа в СИ, как функции WSP в Mathcad: Па, К, Дж/кг, Дж/(кг·К), м³/кг.
// Имена совпадают с WSP (wspHPT, wspTPH, wspgHGST…) и с библиотекой iap97 (iapHPT…).
// Основа: уравнения IF-97 для областей 1, 2 (и метастабильного пара), 3, 4, 5; обратные задачи решаются
// итерациями по основным уравнениям (как режим уточнения WSP). Вязкость и теплопроводность — IAPWS-85
// (промышленные уравнения), поверхностное натяжение — IAPWS-94, диэлектрическая проницаемость — IAPWS-97,
// показатель преломления — IAPWS-97. Газы — идеальные, по полиномам NASA, с привязкой к нулю энтальпии при 0 К, как в WSP.
(function (root) {
'use strict';
const DATA = (typeof module !== 'undefined' && module.exports) ? require('./wsp_data.js') : root.MatWSPData;
const K = DATA.if97;

const R = 0.461526;            // кДж/(кг·К)
const Tc = 647.096, Pc = 22.064, rhoc = 322; // К, МПа, кг/м³
const Tt = 273.16, Pt = 611.657e-6;
class WspError extends Error { constructor(m) { super(m); this.name = 'MathErr'; } }
const fail = (m) => { throw new WspError('WSP: ' + m); };

// ───────── основные уравнения ─────────
function sum3(n, I, J, a, b, fn) { let s = 0; for (let k = 0; k < n.length; k++) s += fn(n[k], I[k], J[k], a, b); return s; }
function pw(x, e) { return e === 0 ? 1 : Math.pow(x, e); }
function region1(T, P) {
  const Tr = 1386 / T, Pr = P / 16.53, a = 7.1 - Pr, b = Tr - 1.222;
  const n = K.Region1_n, I = K.Region1_Li, J = K.Region1_Lj;
  let g = 0, gp = 0, gpp = 0, gt = 0, gtt = 0, gpt = 0;
  for (let k = 0; k < n.length; k++) {
    const i = I[k], j = J[k], c = n[k];
    g += c * pw(a, i) * pw(b, j);
    gp -= c * i * pw(a, i - 1) * pw(b, j);
    gpp += c * i * (i - 1) * pw(a, i - 2) * pw(b, j);
    gt += c * j * pw(a, i) * pw(b, j - 1);
    gtt += c * j * (j - 1) * pw(a, i) * pw(b, j - 2);
    gpt -= c * i * j * pw(a, i - 1) * pw(b, j - 1);
  }
  const v = Pr * gp * R * T / P / 1000;
  return fin({ T, P, v, h: Tr * gt * R * T, s: R * (Tr * gt - g), cp: -R * Tr * Tr * gtt,
    cv: R * (-Tr * Tr * gtt + (gp - Tr * gpt) ** 2 / gpp),
    w: Math.sqrt(R * T * 1000 * gp * gp / ((gp - Tr * gpt) ** 2 / (Tr * Tr * gtt) - gpp)),
    alfav: (1 - Tr * gpt / gp) / T, kappa: -Pr * gpp / gp / P, region: 1, x: 0 });
}
function gas2(T, P, Tr0, nr, Ir, Jr, no, Jo, region, xr) {
  const Tr = Tr0 / T, Pr = P, b = Tr - (region === 5 ? 0 : 0.5);
  let go = Math.log(Pr), got = 0, gott = 0;
  for (let k = 0; k < no.length; k++) { go += no[k] * pw(Tr, Jo[k]); got += no[k] * Jo[k] * pw(Tr, Jo[k] - 1); gott += no[k] * Jo[k] * (Jo[k] - 1) * pw(Tr, Jo[k] - 2); }
  const gop = 1 / Pr;
  let gr = 0, grp = 0, grpp = 0, grt = 0, grtt = 0, grpt = 0;
  for (let k = 0; k < nr.length; k++) {
    const i = Ir[k], j = Jr[k], c = nr[k];
    gr += c * pw(Pr, i) * pw(b, j);
    grp += c * i * pw(Pr, i - 1) * pw(b, j);
    grpp += c * i * (i - 1) * pw(Pr, i - 2) * pw(b, j);
    grt += c * j * pw(Pr, i) * pw(b, j - 1);
    grtt += c * j * (j - 1) * pw(Pr, i) * pw(b, j - 2);
    grpt += c * i * j * pw(Pr, i - 1) * pw(b, j - 1);
  }
  const v = Pr * (gop + grp) * R * T / P / 1000;
  const A = 1 + Pr * grp - Tr * Pr * grpt;
  return fin({ T, P, v, h: Tr * (got + grt) * R * T, s: R * (Tr * (got + grt) - (go + gr)), cp: -R * Tr * Tr * (gott + grtt),
    cv: R * (-Tr * Tr * (gott + grtt) - A * A / (1 - Pr * Pr * grpp)),
    w: Math.sqrt(R * T * 1000 * (1 + 2 * Pr * grp + Pr * Pr * grp * grp) / (1 - Pr * Pr * grpp + A * A / Tr / Tr / (gott + grtt))),
    alfav: A / (1 + Pr * grp) / T, kappa: (1 - Pr * Pr * grpp) / (1 + Pr * grp) / P, region, x: xr });
}
const J0_2 = K.Region2_cp0_Jo;
function region2(T, P) { return gas2(T, P, 540, K.Region2_n, K.Region2_Li, K.Region2_Lj, K.Region2_cp0_no, J0_2, 2, 1); }
function region2m(T, P) { return gas2(T, P, 540, K.Region2_nr_m, K.Region2_Ir_m, K.Region2_Jr_m, K.Region2_cp0_no_meta, J0_2, 2, 1); }
function region5(T, P) { return gas2(T, P, 1000, K.Region5_n, K.Region5_Li, K.Region5_Lj, K.Region5_cp0_no, K.Region5_cp0_Jo, 5, 1); }
function region3(rho, T) {
  const d = rho / rhoc, Tr = Tc / T, n = K.Region3_n, I = K.Region3_Li, J = K.Region3_Lj, n1 = 1.0658070028513;
  let g = n1 * Math.log(d), gd = n1 / d, gdd = -n1 / d / d, gt = 0, gtt = 0, gdt = 0;
  for (let k = 0; k < n.length; k++) {
    const i = I[k], j = J[k], c = n[k];
    g += c * pw(d, i) * pw(Tr, j);
    gd += c * i * pw(d, i - 1) * pw(Tr, j);
    gdd += c * i * (i - 1) * pw(d, i - 2) * pw(Tr, j);
    gt += c * j * pw(d, i) * pw(Tr, j - 1);
    gtt += c * j * (j - 1) * pw(d, i) * pw(Tr, j - 2);
    gdt += c * i * j * pw(d, i - 1) * pw(Tr, j - 1);
  }
  const P = d * gd * R * T * rho / 1000, X = 2 * d * gd + d * d * gdd, Y = d * gd - d * Tr * gdt;
  return fin({ T, P, v: 1 / rho, h: R * T * (Tr * gt + d * gd), s: R * (Tr * gt - g), cp: R * (-Tr * Tr * gtt + Y * Y / X), cv: -R * Tr * Tr * gtt,
    w: Math.sqrt(R * T * 1000 * (X - Y * Y / Tr / Tr / gtt)), alfav: (gd - Tr * gdt) / (2 * gd + d * gdd) / T,
    kappa: 1 / X / rho / R / T * 1000, region: 3, x: 1 });
}
function fin(st) { st.u = st.h - st.P * 1000 * st.v; st.rho = 1 / st.v; return st; }

// ───────── границы ─────────
const N4 = [0, 0.11670521452767E+04, -0.72421316703206E+06, -0.17073846940092E+02, 0.12020824702470E+05, -0.32325550322333E+07, 0.14915108613530E+02, -0.48232657361591E+04, 0.40511340542057E+06, -0.23855557567849E+00, 0.65017534844798E+03];
function psat(T) {
  if (!(T >= 273.15 - 1e-9 && T <= Tc + 1e-9)) fail('температура насыщения вне диапазона 273,15…647,096 К');
  const n = N4, th = T + n[9] / (T - n[10]), A = th * th + n[1] * th + n[2], B = n[3] * th * th + n[4] * th + n[5], C = n[6] * th * th + n[7] * th + n[8];
  return Math.pow(2 * C / (-B + Math.sqrt(B * B - 4 * A * C)), 4);
}
function tsat(P) {
  if (!(P >= 611.212677e-6 * (1 - 1e-9) && P <= Pc * (1 + 1e-12))) fail('давление насыщения вне диапазона 611,2 Па…22,064 МПа');
  const n = N4, be = Math.pow(P, 0.25), E = be * be + n[3] * be + n[6], F = n[1] * be * be + n[4] * be + n[7], G = n[2] * be * be + n[5] * be + n[8];
  const D = 2 * G / (-F - Math.sqrt(F * F - 4 * E * G));
  return (n[10] + D - Math.sqrt((n[10] + D) ** 2 - 4 * (n[9] + n[10] * D))) / 2;
}
const p23 = T => 0.34805185628969e3 - 0.11671859879975e1 * T + 0.10192970039326e-2 * T * T;
const t23 = P => 0.57254459862746e3 + Math.sqrt((P - 0.1391883977870e2) / 0.10192970039326e-2);

// ───────── численные методы ─────────
function brent(f, a, b, tol, fa, fb) {
  fa = fa === undefined ? f(a) : fa; fb = fb === undefined ? f(b) : fb;
  if (fa === 0) return a; if (fb === 0) return b;
  if (fa * fb > 0) return NaN;
  let c = a, fc = fa, d = b - a, e = d;
  for (let it = 0; it < 200; it++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const t = 2 * 2.2e-16 * Math.abs(b) + 0.5 * (tol || 1e-13) * Math.max(1, Math.abs(b)), m = 0.5 * (c - b);
    if (Math.abs(m) <= t || fb === 0) return b;
    if (Math.abs(e) >= t && Math.abs(fa) > Math.abs(fb)) {
      let s = fb / fa, p, q;
      if (a === c) { p = 2 * m * s; q = 1 - s; } else { const qq = fa / fc, r = fb / fc; p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1)); q = (qq - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(t * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = m; e = d; }
    } else { d = m; e = d; }
    a = b; fa = fb; b += Math.abs(d) > t ? d : (m > 0 ? t : -t); fb = f(b);
  }
  return b;
}
// корень на отрезке с поиском перемены знака по сетке (функция может быть не определена в части точек → NaN)
function solveScan(f, a, b, n, opts) {
  opts = opts || {}; const xs = []; for (let k = 0; k <= n; k++) xs.push(opts.log ? a * Math.pow(b / a, k / n) : a + (b - a) * k / n);
  if (opts.reverse) xs.reverse();
  let px = null, pf = NaN;
  for (const x of xs) {
    let fx; try { fx = f(x); } catch (e) { fx = NaN; }
    if (isFinite(fx) && isFinite(pf) && (fx === 0 || pf * fx < 0)) {
      if (!opts.dir || (opts.dir > 0 ? fx >= pf : fx <= pf)) return brent(f, px, x, opts.tol || 1e-14, pf, fx);
    }
    px = x; pf = fx;
  }
  return NaN;
}

// ───────── область 3: плотность по p, T ─────────
function rho3(P, T, branch) {
  const f = r => region3(r, T).P - P;
  // жидкая ветвь — ищем сверху вниз, паровая — снизу вверх; dp/dρ > 0 на устойчивой ветви
  let r;
  if (branch === 'liq') r = solveScan(f, 1150, 60, 400, { dir: -1 });
  else r = solveScan(f, 1, 1150, 400, { log: true, dir: 1 });
  if (!isFinite(r)) fail('не удалось найти плотность в области 3');
  return r;
}
function sat3(T, which) { return region3(rho3(psat(T), T, which), T); }

// ───────── состояние по p, T ─────────
const PMAX = 100, TMAX = 2273.15;
let iapRange = false; // функции iap97 работают только в областях 1–3 (T ≤ 1073,15 К)
function regionPT(P, T) {
  if (!(P > 0) || P > PMAX * (1 + 1e-9)) fail('давление вне диапазона (до 100 МПа)');
  if (!(T >= 273.15 - 1e-6) || T > TMAX + 1e-6) fail('температура вне диапазона 273,15…2273,15 К');
  if (T <= 623.15) return P >= psat(T) ? 1 : 2;
  if (T <= 863.15) return P > p23(T) ? 3 : 2;
  if (T <= 1073.15) return 2;
  if (iapRange) fail('iap97: температура до 1073,15 К');
  if (P > 50 * (1 + 1e-9)) fail('при T > 1073,15 К давление не выше 50 МПа');
  return 5;
}
// side: 'liq' | 'vap' — какую фазу брать на самой линии насыщения
function stPT(P, T, side) {
  let reg = regionPT(P, T);
  if (side && T <= Tc) { // на линии насыщения (с точностью итераций) фаза задаётся явно
    if (T <= 623.15) { const ps = psat(T); if (Math.abs(P - ps) <= 1e-12 * ps + 1e-15) reg = side === 'liq' ? 1 : 2; }
  }
  if (reg === 1) return region1(T, P);
  if (reg === 2) return region2(T, P);
  if (reg === 5) return region5(T, P);
  let branch = 'sup';
  if (T < Tc) { const ps = psat(T); branch = Math.abs(P - ps) <= 1e-12 * ps ? (side || 'liq') : (P > ps ? 'liq' : 'vap'); }
  else if (P < Pc && T < Tc + 1e-9) branch = side || 'liq';
  return region3(rho3(P, T, branch === 'sup' ? (P > Pc ? 'liq' : 'vap') : branch), T);
}
// насыщение по температуре: [жидкость, пар]
function satT(T) {
  if (!(T >= 273.15 - 1e-9 && T <= Tc + 1e-9)) fail('температура вне линии насыщения (273,15…647,096 К)');
  if (T > Tc) T = Tc;
  const P = psat(T);
  if (T <= 623.15) return [region1(T, P), region2(T, P)];
  if (T >= Tc - 1e-9) { const c = region3(rhoc, Tc); return [c, c]; }
  return [sat3(T, 'liq'), sat3(T, 'vap')];
}
function mix(L, V, x) {
  const v = L.v + x * (V.v - L.v);
  return { T: L.T, P: L.P, v, rho: 1 / v, h: L.h + x * (V.h - L.h), s: L.s + x * (V.s - L.s), u: L.u + x * (V.u - L.u), x, region: 4, L, V };
}
// метастабильный (переохлаждённый) пар: p до 10 МПа, от линии насыщения до x = 0,95
function meta(P, T) {
  if (!(P > 0 && P <= 10)) fail('метастабильный пар: давление до 10 МПа');
  const Ts = tsat(P), st = region2m(T, P);
  if (T > Ts + 1e-9) fail('метастабильный пар: температура выше температуры насыщения');
  const L = region1(Ts, P), V = region2(Ts, P);
  if (st.h < L.h + 0.95 * (V.h - L.h)) fail('метастабильный пар: точка за границей x = 0,95');
  return st;
}
function stTX(T, x) { if (!(x >= 0 && x <= 1)) fail('степень сухости должна быть от 0 до 1'); const [L, V] = satT(T); return mix(L, V, x); }

// ───────── обратные задачи ─────────
function tMaxP(P) { return P > 50 || iapRange ? 1073.15 : TMAX; }
function solveT(P, key, val, lo, hi, side) {
  const f = T => stPT(P, T, side)[key] - val;
  const flo = f(lo), fhi = f(hi);
  if (!(flo <= 0 && fhi >= 0)) fail((key === 'h' ? 'энтальпия' : 'энтропия') + ' вне диапазона при этом давлении');
  const T = brent(f, lo, hi, 1e-15, flo, fhi);
  return stPT(P, T, side);
}
function stPY(P, key, val) { // key = 'h' | 's'
  if (!(P > 0) || P > PMAX) fail('давление вне диапазона (до 100 МПа)');
  const tmax = tMaxP(P);
  if (P < Pc) {
    const Ts = tsat(P); let L, V;
    if (Ts <= 623.15) { L = region1(Ts, P); V = region2(Ts, P); } else [L, V] = satT(Ts);
    if (val < L[key]) return solveT(P, key, val, 273.15, Ts, 'liq');
    if (val > V[key]) return solveT(P, key, val, Ts, tmax, 'vap');
    const x = (val - L[key]) / (V[key] - L[key]);
    return mix(L, V, x);
  }
  return solveT(P, key, val, 273.15, tmax);
}
const stPH = (P, h) => stPY(P, 'h', h);
const stPS = (P, s) => stPY(P, 's', s);
function stHS(h, s) {
  // s(p, h) монотонно убывает с ростом p (ds = −v dp / T при h = const), и в двухфазной области тоже
  const f = lp => { let st; try { st = stPH(Math.exp(lp), h); } catch (e) { return -1e9; } return st.s - s; };
  const a = Math.log(611.2127e-6), b = Math.log(PMAX * (1 - 1e-12));
  const fa = f(a); if (fa < 0) fail('точка (h, s) вне диапазона');
  const fb = f(b);
  let lp;
  if (fb > 0) fail('точка (h, s) вне диапазона');
  if (fb === -1e9) { // ищем область определения: правая граница, где ещё считается
    let lo = a, hi = b; for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; const fm = f(m); if (fm === -1e9) hi = m; else if (fm < 0) { hi = m; break; } else lo = m; }
    lp = brent(f, lo, hi, 1e-15);
  } else lp = brent(f, a, b, 1e-15, fa, fb);
  if (!isFinite(lp)) fail('не удалось найти состояние по (h, s)');
  return stPH(Math.exp(lp), h);
}
// фазовые состояния: определение по p, T, x (WSP: на линии насыщения в пределах DELTATS — влажный пар)
function stPTX(P, T, x) {
  if (P < Pc && T <= Tc) { const Ts = tsat(P); if (Math.abs(T - Ts) <= S.deltaTs) return stTX(Ts, x); }
  return stPT(P, T);
}

// ───────── производные и свойства ─────────
// однофазное состояние: dv/dp|T [м³/(кг·Па)], dv/dT|p, и т.д.
function derivs(st) {
  const v = st.v, T = st.T, p = st.P * 1e6, cp = st.cp * 1000;
  const dvdp = -v * st.kappa / 1e6, dvdT = v * st.alfav;
  return { dvdp, dvdT, dudp: -T * dvdT - p * dvdp, dsdp: -dvdT, dhdp: v - T * dvdT, dudT: cp - p * dvdT, dsdT: cp / T, dhdT: cp };
}
const isTwo = st => st.region === 4;
function jt(st) { return isTwo(st) ? twoNum(st, 'jt') : st.v * (st.T * st.alfav - 1) / (st.cp * 1000); }
// численные производные для двухфазной области (по температуре насыщения)
function twoNum(st, what) {
  const T = st.T, x = st.x, dT = Math.min(1e-3, (Tc - T) / 4 || 1e-4);
  const at = (TT, xx) => stTX(TT, xx);
  if (what === 'jt') { // (∂T/∂p)_h = dT/dp вдоль линии насыщения
    return 1 / (dpsatdT(T) * 1e6);
  }
  if (what === 'cv') { // (∂u/∂T)_v
    const u = TT => { const [L, V] = satT(TT); const xx = (st.v - L.v) / (V.v - L.v); return L.u + xx * (V.u - L.u); };
    return (u(T + dT) - u(T - dT)) / (2 * dT) * 1000;
  }
  if (what === 'w') { // w² = (∂p/∂ρ)_s
    const r = TT => { const [L, V] = satT(TT); const xx = (st.s - L.s) / (V.s - L.s); return 1 / (L.v + xx * (V.v - L.v)); };
    const dp = (psat(T + dT) - psat(T - dT)) * 1e6, dr = r(T + dT) - r(T - dT);
    return Math.sqrt(dp / dr);
  }
  return NaN;
}
function dpsatdT(T) { const d = Math.min(1e-3, (Tc - T) / 2 || 1e-5); return (psat(T + d) - psat(T - d)) / (2 * d); }
// вязкость IAPWS-2008 (μ0·μ1, без критической добавки — как в промышленных расчётах), Па·с
const VLI = [0, 1, 2, 3, 0, 1, 2, 3, 5, 0, 1, 2, 3, 4, 0, 1, 0, 3, 4, 3, 5], VLJ = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6, 6];
const VH = [0.520094, 0.850895e-1, -0.108374e1, -0.289555, 0.222531, 0.999115, 0.188797e1, 0.126613e1, 0.120573, -0.281378, -0.906851, -0.772479, -0.489837, -0.257040, 0.161913, 0.257399, -0.325372e-1, 0.698452e-1, 0.872102e-2, -0.435673e-2, -0.593264e-3];
function visc(rho, T) {
  const Tr = T / Tc, Dr = rho / rhoc;
  const mu0 = 100 * Math.sqrt(Tr) / (1.67752 + 2.20462 / Tr + 0.6366564 / Tr / Tr - 0.241605 / Tr ** 3);
  let sm = 0; for (let k = 0; k < VH.length; k++) sm += (1 / Tr - 1) ** VLI[k] * VH[k] * (Dr - 1) ** VLJ[k];
  return mu0 * Math.exp(Dr * sm) * 1e-6;
}
// теплопроводность IAPS-85, уравнение для промышленных расчётов, Вт/(м·К)
function tcond(rho, T) {
  const Tb = T / 647.26, rb = rho / 317.7;
  const l0 = Math.sqrt(Tb) * (0.0102811 + 0.0299621 * Tb + 0.0156146 * Tb * Tb - 0.00422464 * Tb ** 3);
  const l1 = -0.39707 + 0.400302 * rb + 1.06 * Math.exp(-0.171587 * (rb + 2.39219) ** 2);
  const dT = Math.abs(Tb - 1) + 0.00308976, Q = 2 + 0.0822994 / dT ** 0.6, Sv = Tb >= 1 ? 1 / dT : 10.0932 / dT ** 0.6;
  const l2 = (0.0701309 / Tb ** 10 + 0.011852) * rb ** 1.8 * Math.exp(0.642857 * (1 - rb ** 2.8)) + 0.00169937 * Sv * rb ** Q * Math.exp((Q / (1 + Q)) * (1 - rb ** (1 + Q))) - 1.02 * Math.exp(-4.11717 * Tb ** 1.5 - 6.17937 / rb ** 5);
  return l0 + l1 + l2;
}
function tension(T) { if (!(T >= 248.15 && T <= Tc)) fail('поверхностное натяжение: T от 248,15 до 647,096 К'); const t = 1 - T / Tc; return 235.8e-3 * t ** 1.256 * (1 - 0.625 * t); }
function dielectric(rho, T) {
  if (!(T >= 238 && T <= 1200)) fail('диэлектрическая проницаемость: T от 238 до 1200 К');
  const k = 1.380658e-23, Na = 6.0221367e23, alfa = 1.636e-40, eps0 = 8.854187817e-12, mu = 6.138e-30, M = 18.015268;
  const d = rho / rhoc, Tr = Tc / T, li = [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 10], lj = [0.25, 1, 2.5, 1.5, 1.5, 2.5, 2, 2, 5, 0.5, 10];
  const ni = [0.978224486826, -0.957771379375, 0.237511794148, 0.714692244396, -0.298217036956, -0.108863472196, 0.949327488264e-1, -0.980469816509e-2, 0.165167634970e-4, 0.937359795772e-4, -0.12317921872e-9, 0.196096504426e-2];
  let g = 1 + ni[11] * d / (Tc / 228 / Tr - 1) ** 1.2; for (let q = 0; q < 11; q++) g += ni[q] * d ** li[q] * Tr ** lj[q];
  const A = Na * mu * mu * rho * g / M * 1000 / eps0 / k / T, B = Na * alfa * rho / 3 / M * 1000 / eps0;
  return (1 + A + 5 * B + Math.sqrt(9 + 2 * A + 18 * B + A * A + 10 * A * B + 9 * B * B)) / 4 / (1 - B);
}
function refractive(rho, T, lam) {
  if (!(rho >= 0 && rho <= 1060 && T >= 261.15 && T <= 773.15 && lam >= 0.2e-6 && lam <= 1.1e-6)) fail('показатель преломления: ρ до 1060 кг/м³, T 261,15…773,15 К, λ 0,2…1,1 мкм');
  const lr = lam * 1e6, Lir = 5.432937, Luv = 0.229202, d = rho / 1000, Tr = T / 273.15, L = lr / 0.589;
  const a = [0.244257733, 0.974634476e-2, -0.373234996e-2, 0.268678472e-3, 0.158920570e-2, 0.245934259e-2, 0.900704920, -0.166626219e-1];
  const A = d * (a[0] + a[1] * d + a[2] * Tr + a[3] * L * L * Tr + a[4] / L / L + a[5] / (L * L - Luv * Luv) + a[6] / (L * L - Lir * Lir) + a[7] * d * d);
  return Math.sqrt((2 * A + 1) / (1 - A));
}
function pKw(rho, T) { // IAPWS R11-07
  if (!(rho >= 0 && rho <= 1250 && T >= 273.15 && T <= 1273.15)) fail('ионное произведение: ρ до 1250 кг/м³, T от 273,15 до 1273,15 К');
  const d = rho / 1000, g = [6.1415e-1, 4.825133e4, -6.770793e4, 1.01021e7]; let pKg = 0; g.forEach((x, i) => { pKg += x / T ** i; });
  const Z = d * Math.exp(-0.702132 + 8681.05 / T - 24145.1 / T / T * d ** (2 / 3));
  return -12 * (Math.log10(1 + Z) - Z / (Z + 1) * d * (0.813876 - 51.4471 / T - 0.46992 * d)) + pKg + 2 * Math.log10(18.015268 / 1000);
}
// свойство состояния по коду
function prop(st, k) {
  const two = isTwo(st);
  switch (k) {
    case 'V': return st.v;
    case 'D': return 1 / st.v;
    case 'U': return st.u * 1000;
    case 'S': return st.s * 1000;
    case 'H': return st.h * 1000;
    case 'T': return st.T;
    case 'P': return st.P * 1e6;
    case 'X': if (!two) fail('степень сухости определена только в двухфазной области'); return st.x;
    case 'X01': return two ? st.x : (st.region === 1 || (st.region === 3 && st.x === 0) ? 0 : 1);
    case 'CP': if (two) noTwo('теплоёмкость cp'); return st.cp * 1000;
    case 'CV': return two ? twoNum(st, 'cv') : st.cv * 1000;
    case 'W': return two ? twoNum(st, 'w') : st.w;
    case 'K': { const w = prop(st, 'W'); return w * w / (st.P * 1e6 * st.v); }
    case 'JOULETHOMPSON': return jt(st);
    case 'DYNVIS': if (two) noTwo('вязкость'); return visc(1 / st.v, st.T);
    case 'KINVIS': return prop(st, 'DYNVIS') * st.v;
    case 'THERMCOND': if (two) noTwo('теплопроводность'); return tcond(1 / st.v, st.T);
    case 'PRANDTLE': return prop(st, 'DYNVIS') * prop(st, 'CP') / prop(st, 'THERMCOND');
    case 'PKW': return pKw(1 / st.v, st.T);
    case 'DC': return dielectric(1 / st.v, st.T);
    case 'DDDPH': { if (two) return numD(st, 'p'); const d = derivs(st), r = 1 / st.v; return -r * r * (d.dvdp + d.dvdT * jt(st)); }
    case 'DDDHP': { if (two) return numD(st, 'h'); const d = derivs(st), r = 1 / st.v; return -r * r * d.dvdT / (st.cp * 1000); }
  }
  fail('неизвестное свойство ' + k);
}
function noTwo(what) { fail(what + ' во влажном паре не определена (двухфазная область)'); }
function numD(st, by) { // производные плотности влажного пара численно по (p, h)
  const p = st.P, h = st.h;
  if (by === 'h') { const dh = 1e-3 * Math.max(1, Math.abs(h)) * 1e-3; return (1 / stPH(p, h + dh).v - 1 / stPH(p, h - dh).v) / (2 * dh * 1000); }
  const dp = p * 1e-6; return (1 / stPH(p + dp, h).v - 1 / stPH(p - dp, h).v) / (2 * dp * 1e6);
}
function vushc(st) {
  const d = derivs(st);
  return [st.v, st.u * 1000, st.s * 1000, st.h * 1000, st.cv * 1000, st.w, d.dvdp, d.dudp, d.dsdp, d.dhdp, d.dvdT, d.dudT, d.dsdT, d.dhdT];
}

// ───────── настройки WSP ─────────
const S = { tolerance: 2e-12, tolMode: 1, checkRange: 1, deltaTs: 1e-6, maxIter: 100, deltaP: 1e-3, initW: 600, initS: 100, lastErr: 0, dissMode: 0 };

// ───────── газы ─────────
// Свойства идеальных газов. Теплоёмкость — ряд Чебышёва по ln T, подобранный по значениям WaterSteamPro 6.6
// (расхождение с WSP < 1e-7); энтальпия и энтропия — интегрированием от нижней границы диапазона, где взяты значения WSP.
const RU = 8.314472, P0 = 1e5;
const GAS_M = { N2: 0.0280134, O2: 0.0319988, CO: 0.0280104, CO2: 0.0440098, H2O: 0.0180152, SO2: 0.064059, NO: 0.0300061, NO2: 0.0460055, Ar: 0.039948, Ne: 0.020179, H2: 0.0020158, CH4: 0.0160426, C2H6: 0.0300694, C3H8: 0.0440962, C4H10: 0.058123, C5H12: 0.0721498 };
// [Tmin, Tmax, h(Tmin), s°(Tmin), коэффициенты cp]
const GASD = {
  N2: [200, 2500, 207491.020708, 6424.90077898, [1144.5648, 147.2448755, 35.10559607, -15.67034705, -8.019987585, 2.962947688, 1.606180283, -0.6511735961, -0.2551736368, 0.145401481, 0.03315362902, -0.02219807542, 0.005748263669, -0.01022992738, 0.0001192015688, -0.001277074409, -2.261466233e-05, -9.203479122e-05]],
  O2: [200, 2500, 181642.926375, 6046.53606568, [1043.158253, 163.3097216, 16.63068423, -13.47014642, 4.688637929, 3.888395651, -1.23045961, -0.5852920388, 0.1809484492, 0.004670653322, -0.02257790264, 0.01262484016, 0.0007110694274, 0.0009857377812, 0.0008075046701, 1.470622321e-05, 9.763650782e-05, -2.261453616e-06]],
  CO: [200, 2500, 207531.522534, 6641.51477081, [1152.218116, 153.1711156, 30.07403321, -18.57152246, -6.293056086, 3.832594863, 1.07609566, -0.8346327803, -0.1010599875, 0.1732727077, -0.01628629459, -0.01010421247, 0.009033715156, -0.008727660497, 0.001826851482, -0.001165830555, 0.0001685464196, -8.616815801e-05]],
  CO2: [200, 2500, 135248.492006, 4543.62509059, [1095.245069, 347.9197632, -32.31170654, -17.91847041, 2.605444937, 1.000200701, 0.5368519465, -0.3043129096, -0.1488565006, 0.04146483038, 0.02826869077, 0.01412343483, 0.005271126678, 0.001204146577, 0.0003064817921, 4.747863468e-05, 5.632915958e-06, 4.621671034e-07]],
  H2O: [200, 2500, 367787.982456, 9740.89552957, [2278.788503, 597.6458081, 171.8599236, -14.5689275, -20.29039354, -4.386630601, 0.927983363, 2.081587889, 0.3516515324, -0.5536761031, -0.1177795987, 0.02729031167, 0.03534979301, 0.02411025708, 0.009112497741, 0.003187525801, 0.0009108929643, 0.0002340907763]],
  SO2: [200, 2500, 106343.981588, 3638.3503752, [761.9949488, 185.2848981, -26.08520504, -12.51938306, 6.042950243, 0.8319217123, -0.9357571187, -0.02886367128, 0.2674741792, -0.1460893552, 0.04309276689, -0.007763438732, 0.0007874754354, 0.001667786525, -0.0002684593181, 0.0002802608376, -3.175555904e-05, 2.183415519e-05]],
  NO: [200, 2500, 207458.985915, 6622.66814876, [1100.141425, 131.7758205, 29.0191533, -23.2335026, -2.003253888, 4.247697859, -0.08094157566, -0.6515211793, 0.01603203071, 0.1988610196, -0.1038419365, 0.02480322047, -0.006328535767, -0.001384308075, 0.0006769939485, -0.0004041682751, 0.000116670943, -3.553157461e-05]],
  NO2: [200, 2500, 145669.545748, 4911.12155495, [1032.703932, 294.6538797, -16.99587737, -23.33587755, 8.645423732, 3.26330481, -0.9783692779, -0.2811658576, 0.3939257809, -0.130481548, 0.005464885744, -0.001880077106, -0.002479894088, 0.001728445738, -6.787180647e-05, 0.0002303609055, 1.232314371e-05, 1.649458087e-05]],
  H2: [200, 2500, 2824188.08305, 59236.5605342, [15262.87992, 1822.755146, 539.5520898, 296.8488796, -114.7975078, -42.16445911, 5.723009965, 4.102057565, 5.269929109, -1.501275996, -1.704626009, 0.8786871792, -0.04931842675, 0.2451235126, 0.02652380052, 0.02763901789, 0.003540921037, 0.001908958102]],
  CH4: [273.15, 773.15, 854830, 6488.2, [2889.77384, 855.3271731, 138.9949452, -9.740176122, -1.651100946, 0.5406558894, -0.1090993657, -0.02339581223, 0.003436047657, -0.001341004165, -0.0002499259848, -4.551130838e-05, -1.311500204e-05, -1.057059431e-06]],
  C2H6: [273.15, 773.15, 625070, 3252.6, [2510.076272, 939.4010479, 79.47286452, -13.53547952, 0.3221051308, 0.2748114203, 0.3874638016, -0.08436783262, 0.02858725489, -0.004790791382, 0.0006347463838, -0.0001345787907, 6.926749241e-06, -2.462478866e-06]],
  C3H8: [273.15, 773.15, 589540, 2704.1, [2445.208995, 939.3644876, 61.81999775, -15.43782405, 1.080013217, 0.4109156593, -0.1249203732, -0.03821217624, 0.01603114478, -0.001748780258, -0.007250972176, -0.0004564552682, -0.0003407118925, -1.695528321e-05]],
  C4H10: [273.15, 773.15, 585450, 2415.5, [2464.877578, 904.9359446, 62.04264051, -17.75777197, 2.158154593, 0.03254275576, -0.08263570606, -0.09508341543, 0.002032803338, -0.005979958036, 6.574989926e-05, -0.0001741995366, 7.618410791e-08, -3.169337172e-06]],
  C5H12: [309, 773.15, 357283.150345, 1156.88134221, [2538.057098, 836.1120135, 45.02194146, -13.72909602, 1.805222861, -0.2595204097, -0.01075115958, -0.0108736181, 0.02063585439, -0.01533019612, 0.003885365129, -0.0006512608196, 0.0001239821567, -1.257272528e-05]],
  // одноатомные газы: cp = 5/2·R/M, привязка — значения WSP при 298,15 К
  Ar: [200, 2500, 155126.664664, 3876.07498, null], Ne: [200, 2500, 307101.442093, 7251.273268, null],
};
// узлы Гаусса — Лежандра (24) для интегрирования по ln T
const GL = (() => { const n = 24, x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = n * (z * p1 - p2) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; })();
function spRange(sp, T) { const d = GASD[sp]; if (!(T >= d[0] - 1e-9 && T <= d[1] + 1e-9)) fail(sp + ': температура вне диапазона ' + d[0] + '…' + d[1] + ' К'); }
function spCp(sp, T) {
  const d = GASD[sp]; if (!d[4]) return 2.5 * RU / GAS_M[sp];
  const la = Math.log(d[0]), lb = Math.log(d[1]), x = (2 * Math.log(T) - la - lb) / (lb - la), c = d[4];
  let b1 = 0, b2 = 0; for (let j = c.length - 1; j > 0; j--) { const t = 2 * x * b1 - b2 + c[j]; b2 = b1; b1 = t; }
  return x * b1 - b2 + c[0];
}
function spInt(sp, T, withT) { // ∫ cp·T^withT d(ln T) от Tmin до T
  const d = GASD[sp], la = Math.log(d[0]), lt = Math.log(T), m = (lt + la) / 2, r = (lt - la) / 2; let s = 0;
  for (let k = 0; k < GL.x.length; k++) { const u = m + r * GL.x[k], t = Math.exp(u); s += GL.w[k] * spCp(sp, t) * (withT ? t : 1); }
  return s * r;
}
function spH(sp, T) { spRange(sp, T); const d = GASD[sp]; if (!d[4]) return d[2] + spCp(sp, T) * (T - 298.15); return d[2] + spInt(sp, T, true); }
function spS0(sp, T) { spRange(sp, T); const d = GASD[sp]; if (!d[4]) return d[3] + spCp(sp, T) * Math.log(T / 298.15); return d[3] + spInt(sp, T, false); }
// газ = набор базовых веществ с мольными долями
function gasOf(comp) { // comp: {sp: моли}
  let n = 0; for (const k in comp) n += comp[k];
  const y = {}; let M = 0; for (const k in comp) { y[k] = comp[k] / n; M += y[k] * GAS_M[k]; }
  const w = {}; for (const k in y) w[k] = y[k] * GAS_M[k] / M;
  let smix = 0; for (const k in y) if (y[k] > 0) smix -= RU / M * y[k] * Math.log(y[k]);
  return { y, w, M, smix };
}
const AIR = { N2: 78.03, O2: 20.99, Ar: 0.94, H2: 0.01, CO2: 0.03 }, N2AIR = { N2: 98.76, Ar: 1.19, H2: 0.01, CO2: 0.04 };
const BUILTIN = ['N2', 'O2', 'CO', 'CO2', 'H2O', 'SO2', 'Air', 'N2Air', 'NO', 'NO2', 'Ar', 'Ne', 'H2', 'CH4', 'C2H6', 'C3H8', 'C4H10', 'C5H12', 'AirMix', 'N2AirMix'];
let userGases = [];
function builtinGas(id) {
  const nm = BUILTIN[id];
  if (nm === 'Air' || nm === 'AirMix') return gasOf(AIR);
  if (nm === 'N2Air' || nm === 'N2AirMix') return gasOf(N2AIR);
  return gasOf({ [nm]: 1 });
}
function gasById(id) {
  id = Math.round(id);
  if (id >= 0 && id < BUILTIN.length) return builtinGas(id);
  const u = userGases[id - BUILTIN.length];
  if (!u) fail('газ с идентификатором ' + id + ' не найден');
  if (!Object.keys(u.comp).length) fail('состав газа ' + id + ' не задан');
  return gasOf(u.comp);
}
function idByName(name) {
  const n = String(name).trim().toLowerCase();
  const b = BUILTIN.findIndex(x => x.toLowerCase() === n); if (b >= 0) return b;
  const u = userGases.findIndex(x => x.name && x.name.toLowerCase() === n); if (u >= 0) return u + BUILTIN.length;
  fail('газ «' + name + '» не найден');
}
// моли базовых веществ в одном моле газа
function molesOf(g) { const r = {}; for (const k in g.y) r[k] = g.y[k]; return r; }
const specCache = new Map();
function gasBySpec(spec) {
  spec = String(spec); if (specCache.has(spec)) return specCache.get(spec);
  const g = gasOf(parseSpec(spec)); specCache.set(spec, g); return g;
}
function parseSpec(s) { // «N2:78.03%;O2:1M;{H2O;CO2:2}:3» → моли базовых веществ
  const parts = []; let depth = 0, cur = '';
  for (const ch of s) { if (ch === '{') depth++; if (ch === '}') depth--; if (ch === ';' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) parts.push(cur);
  const out = {};
  for (let p of parts) {
    p = p.trim(); if (!p) continue;
    let name = p, qty = '1';
    const m = p.match(/^(\{.*\}|[^:]+)(?::(.*))?$/); if (m) { name = m[1].trim(); if (m[2] != null) qty = m[2].trim(); }
    const g = name[0] === '{' ? gasOf(parseSpec(name.slice(1, -1))) : gasById(idByName(name));
    const q = qty.match(/^([-+0-9.eE]+)\s*(%|M|KG|G|V)?$/i); if (!q) fail('спецификация газа: не понимаю «' + qty + '»');
    let val = parseFloat(q[1]); const suf = (q[2] || 'V').toUpperCase();
    let moles;
    if (suf === '%') moles = val / 100; else if (suf === 'V') moles = val;
    else { const mass = suf === 'G' ? val / 1000 : val; moles = mass / g.M; }
    const mm = molesOf(g); for (const k in mm) out[k] = (out[k] || 0) + mm[k] * moles;
  }
  if (!Object.keys(out).length) fail('пустая спецификация газа');
  return out;
}
function gT(g, T) { if (!(typeof T === 'number' && isFinite(T))) fail('температура газа должна быть числом'); for (const k in g.w) spRange(k, T); return T; }
const gCp = (g, T) => { gT(g, T); let s = 0; for (const k in g.w) s += g.w[k] * spCp(k, T); return s; };
const gH = (g, T) => { gT(g, T); let s = 0; for (const k in g.w) s += g.w[k] * spH(k, T); return s; };
const gS0 = (g, T) => { gT(g, T); let s = g.smix; for (const k in g.w) s += g.w[k] * spS0(k, T); return s; };
const gS = (g, P, T) => gS0(g, T) - RU / g.M * Math.log(P / P0);
function gLim(g) { let a = 0, b = Infinity; for (const k in g.w) { a = Math.max(a, GASD[k][0]); b = Math.min(b, GASD[k][1]); } return [a, b]; }
function gInv(g, f, val) { const [a, b] = gLim(g); const T = brent(T => f(T) - val, a, b, 1e-15); if (!isFinite(T)) fail('газ: значение вне диапазона ' + a + '…' + b + ' К'); return T; }
function gFrac(a, b, mass) { // доля газа b в газе a
  const fa = mass ? a.w : a.y, fb = mass ? b.w : b.y; let m = Infinity;
  for (const k in fb) m = Math.min(m, (fa[k] || 0) / fb[k]);
  return isFinite(m) ? m : 0;
}

// ───────── таблица функций ─────────
const F = {};
const Pa = p => p / 1e6;
function num(x, nm) { if (typeof x !== 'number' || !isFinite(x)) fail('аргумент ' + (nm || '') + ' должен быть числом'); return x; }
function reg(name, fn) { F[name] = fn; }
const PROPS_PT = ['V', 'D', 'U', 'S', 'H', 'CP', 'CV', 'W', 'JOULETHOMPSON', 'THERMCOND', 'DYNVIS', 'PRANDTLE', 'KINVIS', 'K', 'DDDPH', 'DDDHP', 'PKW', 'DC', 'X'];
for (const k of PROPS_PT) {
  reg('wsp' + k + 'PT', (p, t) => prop(stPT(Pa(p), t), k));
  reg('wsp' + k + 'PTX', (p, t, x) => prop(stPTX(Pa(p), t, x), k));
  reg('wsp' + k + 'PH', (p, h) => prop(stPH(Pa(p), h / 1000), k));
  reg('wsp' + k + 'PS', (p, s) => prop(stPS(Pa(p), s / 1000), k));
  reg('wsp' + k + 'HS', (h, s) => prop(stHS(h / 1000, s / 1000), k));
  reg('wsp' + k + 'STX', (t, x) => prop(stTX(t, x), k));
  reg('wsp' + k + 'MSPT', (p, t) => prop(meta(Pa(p), t), k));
  reg('wsp' + k + 'EXPANSIONPTPEFF', (p0, t0, p1, e) => prop(expansion(stPT(Pa(p0), t0), Pa(p1), e), k));
  reg('wsp' + k + 'EXPANSIONPTXPEFF', (p0, t0, x0, p1, e) => prop(expansion(stPTX(Pa(p0), t0, x0), Pa(p1), e), k));
}
['T', 'P'].forEach(k => { reg('wsp' + k + 'HS', (h, s) => prop(stHS(h / 1000, s / 1000), k)); });
reg('wspTPH', (p, h) => stPH(Pa(p), h / 1000).T); reg('wspTPS', (p, s) => stPS(Pa(p), s / 1000).T);
reg('wspHPS', (p, s) => stPS(Pa(p), s / 1000).h * 1000);
reg('wspTEXPANSIONPTPEFF', (p0, t0, p1, e) => expansion(stPT(Pa(p0), t0), Pa(p1), e).T);
reg('wspTEXPANSIONPTXPEFF', (p0, t0, x0, p1, e) => expansion(stPTX(Pa(p0), t0, x0), Pa(p1), e).T);
function expansion(s0, p1, eff) {
  const h1s = stPS(p1, s0.s).h;
  const h1 = s0.h - eff * (s0.h - h1s); // как в WSP — одна формула и для расширения, и для сжатия
  return stPH(p1, h1);
}
// линия насыщения
const SATP = { V: 'v', D: 'rho', U: 'u', S: 's', H: 'h' };
for (const k of ['V', 'D', 'U', 'S', 'H', 'CP', 'CV', 'W', 'JOULETHOMPSON', 'THERMCOND', 'DYNVIS', 'PRANDTLE', 'KINVIS', 'K']) {
  reg('wsp' + k + 'SST', t => prop(satT(t)[1], k));
  reg('wsp' + k + 'SWT', t => prop(satT(t)[0], k));
}
for (const k of ['DDDPH', 'DDDHP']) { reg('wsp' + k + 'SST', t => prop(satT(t)[1], k)); reg('wsp' + k + 'SWT', t => prop(satT(t)[0], k)); }
reg('wspCVDPSST', t => prop(stTX(t, 1), 'CV')); reg('wspCVDPSWT', t => prop(stTX(t, 0), 'CV'));
reg('wspPST', t => psat(t) * 1e6); reg('wspTSP', p => tsat(Pa(p)));
reg('wspDPDTST', t => dpsatdT(t) * 1e6);
reg('wspRST', t => { const [L, V] = satT(t); return (V.h - L.h) * 1000; });
reg('wspSURFTENT', t => tension(t));
function roughRho(t, vap) { // вспомогательные уравнения IAPWS-1992 для плотностей на линии насыщения
  if (!(t >= 273.16 && t <= Tc)) fail('температура вне линии насыщения');
  const tau = 1 - t / Tc;
  if (!vap) { const b = [1.99274064, 1.09965342, -0.510839303, -1.75493479, -45.5170352, -6.74694450e5], e = [1 / 3, 2 / 3, 5 / 3, 16 / 3, 43 / 3, 110 / 3]; let r = 1; for (let k = 0; k < 6; k++) r += b[k] * tau ** e[k]; return r * rhoc; }
  const c = [-2.03150240, -2.68302940, -5.38626492, -17.2991605, -44.7586581, -63.9201063], e = [2 / 6, 4 / 6, 8 / 6, 18 / 6, 37 / 6, 71 / 6]; let r = 0; for (let k = 0; k < 6; k++) r += c[k] * tau ** e[k]; return Math.exp(r) * rhoc;
}
reg('wspROUGHRSST', t => roughRho(t, true)); reg('wspROUGHRSWT', t => roughRho(t, false));
reg('wspROUGHHSSS', s => satByS(s / 1000, 1).h * 1000); reg('wspROUGHHSWS', s => satByS(s / 1000, 0).h * 1000);
function satByS(s, side) { const T = brent(T => satT(T)[side].s - s, 273.16, Tc - 1e-9, 1e-14); if (!isFinite(T)) fail('энтропия вне линии насыщения'); return satT(T)[side]; }
reg('wspVUSHCVWDERPTSWT', t => vushc(satT(t)[0])); reg('wspVUSHCVWDERPTSST', t => vushc(satT(t)[1]));
reg('wspVUSHCVWDERPTPT', (p, t) => vushc(stPT(Pa(p), t)));
reg('wspVUSHCVWDERPTMSPT', (p, t) => vushc(meta(Pa(p), t)));
// двухфазная область: степень сухости по температуре и свойству
const XST = { V: 'V', D: 'D', U: 'U', S: 'S', H: 'H', CP: 'CP', CV: 'CV', W: 'W', JOULETHOMPSON: 'JOULETHOMPSON', THERMCOND: 'THERMCOND', DYNVIS: 'DYNVIS', KINVIS: 'KINVIS', PRANDTLE: 'PRANDTLE', K: 'K' };
for (const k in XST) reg('wspXST' + k, (t, val) => {
  if (k === 'V' || k === 'U' || k === 'S' || k === 'H') { const [L, V] = satT(t); const a = prop(L, k), b = prop(V, k); return (val - a) / (b - a); }
  if (k === 'D') { const [L, V] = satT(t); return (1 / val - L.v) / (V.v - L.v); }
  const f = x => prop(stTX(t, x), k) - val; const x = solveScan(f, 0, 1, 50); if (!isFinite(x)) fail('значение вне двухфазной области'); return x;
});
function tsatHS(h, s) { // IAPWS 2004: Tsat(h, s) для влажного пара; уточняется по основным уравнениям, если точка во влажном паре
  try { const st = stHS(h, s); if (isTwo(st)) return st.T; } catch (e) {}
  const nu = h / 2800, sg = s / 9.2; let r = 0; for (let k = 0; k < K.Backward4_T_hs_n.length; k++) r += K.Backward4_T_hs_n[k] * (nu - 0.119) ** K.Backward4_T_hs_Li[k] * (sg - 1.07) ** K.Backward4_T_hs_Lj[k];
  return 550 * r;
}
reg('wspTSHS', (h, s) => tsatHS(h / 1000, s / 1000));
reg('wspTXSHS', (h, s) => { const st = stHS(h / 1000, s / 1000); if (!isTwo(st)) fail('точка не в двухфазной области'); return [st.T, st.x]; });
reg('wspPTHS', (h, s) => { const st = stHS(h / 1000, s / 1000); return [st.P * 1e6, st.T]; });
// границы областей
reg('wspP23T', t => p23(t) * 1e6); reg('wspT23P', p => t23(Pa(p)));
reg('wspP2B2CH', h => { h /= 1000; return (0.90584278514723e3 - 0.67955786399241 * h + 0.12809002730136e-3 * h * h) * 1e6; });
reg('wspH2B2CP', p => (0.26526571908428e4 + Math.sqrt((Pa(p) - 0.45257578905948e1) / 0.12809002730136e-3)) * 1000);
reg('wspHB13S', s => { s /= 1000; const sg = s / 3.8; let r = 0; for (let k = 0; k < K.h13_s_n.length; k++) r += K.h13_s_n[k] * (sg - 0.884) ** K.h13_s_Li[k] * (sg - 0.864) ** K.h13_s_Lj[k]; return r * 1700 * 1000; });
function tb23hs(h, s) { const nu = h / 3000, sg = s / 5.3; let r = 0; for (let k = 0; k < K.t_hs_n.length; k++) r += K.t_hs_n[k] * (nu - 0.727) ** K.t_hs_Li[k] * (sg - 0.864) ** K.t_hs_Lj[k]; return r * 900; }
reg('wspTB23HS', (h, s) => tb23hs(h / 1000, s / 1000)); reg('wspPB23HS', (h, s) => stHS(h / 1000, s / 1000).P * 1e6);
reg('wspPSUBT', t => { if (!(t >= 50 && t <= 273.16)) fail('линия сублимации: T от 50 до 273,16 К'); const th = t / Tt; const a = [-0.212144006e2, 0.273203819e2, -0.61059813e1], e = [0.333333333e-2, 1.20666667, 1.70333333]; let sm = 0; for (let q = 0; q < 3; q++) sm += a[q] * th ** e[q]; return Math.exp(sm / th) * Pt * 1e6; });
reg('wspPMELTIT', t => { if (!(t >= 251.165 && t <= 273.16)) fail('линия плавления льда I: T от 251,165 до 273,16 К'); const th = t / Tt; const a = [0.119539337e7, 0.808183159e5, 0.33382686e4], e = [3, 0.2575e2, 0.10375e3]; let sm = 1; for (let q = 0; q < 3; q++) sm += a[q] * (1 - th ** e[q]); return sm * Pt * 1e6; });
function areaPT(p, t) { const P = Pa(p); if (t <= Tc && P <= Pc) { try { const ps = psat(t); if (Math.abs(t - tsat(P)) <= S.deltaTs && Math.abs(P - ps) / ps < 1e-3) return 4; } catch (e) {} } return regionPT(P, t); }
reg('wspWATERSTATEAREA', areaPT); reg('wspWATERSTATEAREA2', areaPT);
reg('wspPHASESTATEPT', (p, t) => { const P = Pa(p); regionPT(P, t); if (t >= Tc || P >= Pc) return 3; return P >= psat(t) ? 1 : 2; });
const area = st => st.region;
reg('wspWATERSTATEAREAPH', (p, h) => area(stPH(Pa(p), h / 1000))); reg('wspWATERSTATEAREAPS', (p, s) => area(stPS(Pa(p), s / 1000))); reg('wspWATERSTATEAREAHS', (h, s) => area(stHS(h / 1000, s / 1000)));
// свойства по ρ, T (переносные и прочие)
reg('wspTHERMCONDRT', (r, t) => tcond(r, t)); reg('wspDYNVISRT', (r, t) => visc(r, t));
reg('wspPKWRT', (r, t) => pKw(r, t)); reg('wspDCRT', (r, t) => dielectric(r, t)); reg('wspRIRTL', (r, t, l) => refractive(r, t, l));
reg('wspRIPTL', (p, t, l) => refractive(1 / stPT(Pa(p), t).v, t, l));
// уравнения отдельных областей
const REGF = { 1: (p, t) => region1(t, Pa(p)), 2: (p, t) => region2(t, Pa(p)), 5: (p, t) => region5(t, Pa(p)), 3: (p, t) => stPT3(Pa(p), t) };
function stPT3(P, t) { let br = 'liq'; if (t < Tc) br = P > psat(t) ? 'liq' : 'vap'; else br = P > Pc ? 'liq' : 'vap'; return region3(rho3(P, t, br), t); }
for (const n of [1, 2, 3, 5]) {
  for (const k of ['V', 'D', 'U', 'S', 'H', 'CP', 'CV', 'W', 'JOULETHOMPSON']) reg('wsp' + k + n + 'PT', (p, t) => prop(REGF[n](p, t), k));
  reg('wspVUSHCVWDERPT' + n + 'PT', (p, t) => vushc(REGF[n](p, t)));
}
reg('wspR3PT', (p, t) => 1 / stPT3(Pa(p), t).v); reg('wspD3PT', (p, t) => 1 / stPT3(Pa(p), t).v);
reg('wspR3PTR0', (p, t, r0) => { const P = Pa(p); const f = r => region3(r, t).P - P; let r = r0; for (let k = 0; k < 100; k++) { const d = Math.max(1e-6, r * 1e-7); const df = (f(r + d) - f(r - d)) / (2 * d); const dr = f(r) / df; r -= dr; if (Math.abs(dr) < 1e-12 * r) break; } return r; });
for (const k of ['P', 'U', 'S', 'H', 'CP', 'CV', 'W', 'JOULETHOMPSON']) reg('wsp' + k + '3RT', (r, t) => prop(region3(r, t), k));
reg('wspVUSHCVWDERPT3RT', (r, t) => vushc(region3(r, t)));
// обратные уравнения отдельных областей — итерации по основному уравнению области
function regPY(n, P, key, val) {
  const f = T => REGF[n](P * 1e6, T)[key] - val; const lo = n === 5 ? 1073.15 : 273.15, hi = n === 1 ? 623.15 : n === 5 ? 2273.15 : n === 3 ? 863.15 : 1073.15;
  const T = solveScan(f, lo - (n === 1 ? 0 : 0), hi + 50, 200); if (!isFinite(T)) fail('значение вне области ' + n); return REGF[n](P * 1e6, T);
}
for (const n of [1, 2, 3, 5]) {
  reg('wspT' + n + 'PH', (p, h) => regPY(n, Pa(p), 'h', h / 1000).T); reg('wspT' + n + 'PS', (p, s) => regPY(n, Pa(p), 's', s / 1000).T);
}
['2A', '2B', '2C'].forEach(sub => { reg('wspT' + sub + 'PH', (p, h) => regPY(2, Pa(p), 'h', h / 1000).T); reg('wspT' + sub + 'PS', (p, s) => regPY(2, Pa(p), 's', s / 1000).T); });
reg('wspV3PH', (p, h) => regPY(3, Pa(p), 'h', h / 1000).v); reg('wspV3PS', (p, s) => regPY(3, Pa(p), 's', s / 1000).v);
function regHS(n, h, s) { // p, T по h, s в уравнении области n
  let st; try { st = stHS(h, s); } catch (e) { st = null; }
  if (st && st.region === n) return st;
  // ньютон по (ln p, T) от начального приближения
  let lp = Math.log(st ? st.P : 10), T = st ? st.T : 600;
  const F2 = (lp, T) => { const q = REGF[n](Math.exp(lp) * 1e6, T); return [q.h - h, q.s - s, q]; };
  for (let it = 0; it < 60; it++) {
    const [a, b] = F2(lp, T), e1 = 1e-7, e2 = 1e-5 * T;
    const [a1, b1] = F2(lp + e1, T), [a2, b2] = F2(lp, T + e2);
    const J = [[(a1 - a) / e1, (a2 - a) / e2], [(b1 - b) / e1, (b2 - b) / e2]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const dl = (a * J[1][1] - b * J[0][1]) / det, dT = (J[0][0] * b - J[1][0] * a) / det;
    lp -= dl; T -= dT; if (Math.abs(dl) < 1e-13 && Math.abs(dT) < 1e-10 * T) break;
  }
  return F2(lp, T)[2];
}
for (const n of [1, 2, 3, 5]) {
  reg('wspP' + n + 'HS', (h, s) => regHS(n, h / 1000, s / 1000).P * 1e6); reg('wspT' + n + 'HS', (h, s) => regHS(n, h / 1000, s / 1000).T);
  reg('wspPT' + n + 'HS', (h, s) => { const q = regHS(n, h / 1000, s / 1000); return [q.P * 1e6, q.T]; });
}
reg('wspV3HS', (h, s) => regHS(3, h / 1000, s / 1000).v); reg('wspRT3HS', (h, s) => { const q = regHS(3, h / 1000, s / 1000); return [1 / q.v, q.T]; });
reg('wspT3RH', (r, h) => { const T = solveScan(T => region3(r, T).h - h / 1000, 600, 1100, 100); if (!isFinite(T)) fail('значение вне области 3'); return T; });
function regRH(n, r, h) { // p, T по плотности и энтальпии
  let lp = Math.log(n === 1 ? 10 : 1), T = n === 1 ? 400 : n === 5 ? 1500 : 600;
  const F2 = (lp, T) => { const q = REGF[n](Math.exp(lp) * 1e6, T); return [1 / q.v - r, q.h - h, q]; };
  // начальное приближение по температуре — поиск по сетке
  for (let it = 0; it < 80; it++) {
    const [a, b] = F2(lp, T), e1 = 1e-7, e2 = 1e-5 * T;
    const [a1, b1] = F2(lp + e1, T), [a2, b2] = F2(lp, T + e2);
    const J = [[(a1 - a) / e1, (a2 - a) / e2], [(b1 - b) / e1, (b2 - b) / e2]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    let dl = (a * J[1][1] - b * J[0][1]) / det, dT = (J[0][0] * b - J[1][0] * a) / det;
    const sc = Math.min(1, 1 / Math.max(Math.abs(dl), Math.abs(dT) / 100)); lp -= dl * sc; T -= dT * sc;
    if (Math.abs(dl) < 1e-13 && Math.abs(dT) < 1e-10 * T) break;
  }
  const q = F2(lp, T)[2]; return [q.P * 1e6, q.T];
}
reg('wspPT1RH', (r, h) => regRH(1, r, h / 1000)); reg('wspPT2RH', (r, h) => regRH(2, r, h / 1000)); reg('wspPT5RH', (r, h) => regRH(5, r, h / 1000));
// настройки
reg('wspSETTOLERANCE', v => (S.tolerance = v)); reg('wspGETTOLERANCE', () => S.tolerance);
reg('wspSETTOLERANCEMODE', v => (S.tolMode = v)); reg('wspGETTOLERANCEMODE', () => S.tolMode);
reg('wspSETCHECKRANGEMODE', v => (S.checkRange = v)); reg('wspGETCHECKRANGEMODE', () => S.checkRange);
reg('wspSETDELTATS', v => (S.deltaTs = v)); reg('wspGETDELTATS', () => S.deltaTs);
reg('wspSETMAXITERATION', v => (S.maxIter = v)); reg('wspGETMAXITERATION', () => S.maxIter);
reg('wspSETDELTAPRESSURE', v => (S.deltaP = v)); reg('wspGETDELTAPRESSURE', () => S.deltaP);
reg('wspSETINITWATERDENSITY', v => (S.initW = v)); reg('wspGETINITWATERDENSITY', () => S.initW);
reg('wspSETINITSTEAMDENSITY', v => (S.initS = v)); reg('wspGETINITSTEAMDENSITY', () => S.initS);
reg('wspSETLASTERROR', v => (S.lastErr = v)); reg('wspGETLASTERROR', () => S.lastErr); reg('wspGETLASTERRORDESCRIPTION', () => 'Нет ошибок');
reg('wspgSETCALCDISSMODE', v => (S.dissMode = v)); reg('wspgGETCALCDISSMODE', () => S.dissMode);
reg('wspGETWSPVERSION', () => 6.6); reg('wspGETABSOLUTEGASCONSTANT', () => 8.314472);
reg('wspLOCALREGISTRATION', () => 1); reg('wspLOCALREGISTRATIONEXA', () => 1);
// газы
const G = { ID: id => gasById(num(id)), GS: sp => gasBySpec(sp) };
for (const t of ['ID', 'GS']) {
  reg('wspgCP' + t + 'T', (g, T) => gCp(G[t](g), T));
  reg('wspgCV' + t + 'T', (g, T) => { const q = G[t](g); return gCp(q, T) - RU / q.M; });
  reg('wspgH' + t + 'T', (g, T) => gH(G[t](g), T));
  reg('wspgU' + t + 'T', (g, T) => { const q = G[t](g); return gH(q, T) - RU / q.M * T; });
  reg('wspgS' + t + 'T', (g, T) => gS0(G[t](g), T));
  reg('wspgS' + t + 'PT', (g, p, T) => gS(G[t](g), p, T));
  reg('wspgV' + t + 'T', (g, T) => { const q = G[t](g); gT(q, T); return RU * T / q.M / P0; });
  reg('wspgV' + t + 'PT', (g, p, T) => { const q = G[t](g); gT(q, T); return RU * T / q.M / p; });
  reg('wspgT' + t + 'H', (g, h) => { const q = G[t](g); return gInv(q, T => gH(q, T), h); });
  reg('wspgT' + t + 'S', (g, s) => { const q = G[t](g); return gInv(q, T => gS0(q, T), s); });
  reg('wspgT' + t + 'PS', (g, p, s) => { const q = G[t](g); return gInv(q, T => gS(q, p, T), s); });
  reg('wspgP' + t + 'TS', (g, T, s) => { const q = G[t](g); return P0 * Math.exp((gS0(q, T) - s) / (RU / q.M)); });
}
reg('wspgMMID', id => gasById(id).M); reg('wspgMMGS', sp => gasBySpec(sp).M);
reg('wspgGCID', id => RU / gasById(id).M); reg('wspgGCGS', sp => RU / gasBySpec(sp).M);
reg('wspgVFGSGS', (a, b) => gFrac(gasBySpec(a), gasBySpec(b), false)); reg('wspgMFGSGS', (a, b) => gFrac(gasBySpec(a), gasBySpec(b), true));
reg('wspgVFIDID', (a, b) => gFrac(gasById(a), gasById(b), false)); reg('wspgMFIDID', (a, b) => gFrac(gasById(a), gasById(b), true));
reg('wspgIDNAME', name => idByName(name));
reg('wspgNEWID', () => { userGases.push({ comp: {} }); return BUILTIN.length + userGases.length - 1; });
reg('wspgNEWIDNAME', name => { userGases.push({ comp: {}, name: String(name) }); return BUILTIN.length + userGases.length - 1; });
reg('wspgNEWIDGS', sp => { userGases.push({ comp: parseSpec(sp) }); return BUILTIN.length + userGases.length - 1; });
reg('wspgDELETEGASID', id => { const k = Math.round(id) - BUILTIN.length; if (userGases[k]) userGases[k] = null; return 1; });
reg('wspgDELETEGASES', () => { userGases = []; return 1; });
reg('wspgGASESCOUNT', () => BUILTIN.length + userGases.filter(Boolean).length);
function addGas(target, src, amount, mass) {
  const k = Math.round(target) - BUILTIN.length; const u = userGases[k]; if (!u) fail('пользовательский газ ' + target + ' не найден');
  const g = gasById(src); const moles = mass ? amount / g.M : amount; const mm = molesOf(g);
  for (const s in mm) u.comp[s] = (u.comp[s] || 0) + mm[s] * moles; return 1;
}
reg('wspgADDGASM', (t, s, m) => addGas(t, s, m, true)); reg('wspgADDGASV', (t, s, v) => addGas(t, s, v, false));

// ───────── iap97 (библиотека пользователя: те же уравнения IF-97) ─────────
const IAP = { HPT: 'HPT', SPT: 'SPT', VPT: 'VPT', DPT: 'DPT', UPT: 'UPT', CPPT: 'CPPT', CVPT: 'CVPT', WPT: 'WPT', KPT: 'KPT', DYNVISPT: 'DYNVISPT', KINVISPT: 'KINVISPT', THERMCONDPT: 'THERMCONDPT', PRANDTLEPT: 'PRANDTLEPT',
  TPH: 'TPH', SPH: 'SPH', VPH: 'VPH', DPH: 'DPH', XPH: 'XPH', TPS: 'TPS', HPS: 'HPS', VPS: 'VPS', DPS: 'DPS', XPS: 'XPS', PHS: 'PHS', THS: 'THS', VHS: 'VHS', XHS: 'XHS',
  HPTX: 'HPTX', SPTX: 'SPTX', VPTX: 'VPTX', HEXPANSIONPTPEFF: 'HEXPANSIONPTPEFF', TEXPANSIONPTPEFF: 'TEXPANSIONPTPEFF', SEXPANSIONPTPEFF: 'SEXPANSIONPTPEFF', XEXPANSIONPTPEFF: 'XEXPANSIONPTPEFF',
  PST: 'PST', TSP: 'TSP', HSWT: 'HSWT', HSST: 'HSST', SSWT: 'SSWT', SSST: 'SSST', VSWT: 'VSWT', VSST: 'VSST', DSWT: 'DSWT', DSST: 'DSST', RST: 'RST' };
for (const k in IAP) { const f = F['wsp' + IAP[k]]; reg('iap' + k, Object.defineProperty((...a) => { iapRange = true; try { return f(...a); } finally { iapRange = false; } }, 'length', { value: f.length })); }
for (const k of ['XPH', 'XPS', 'XHS']) { const g = k === 'XPH' ? (p, h) => stPH(Pa(p), h / 1000) : k === 'XPS' ? (p, s) => stPS(Pa(p), s / 1000) : (h, s) => stHS(h / 1000, s / 1000); reg('iap' + k, (a, b) => { iapRange = true; try { return prop(g(a, b), 'X01'); } finally { iapRange = false; } }); }
reg('iapXEXPANSIONPTPEFF', (p0, t0, p1, e) => { iapRange = true; try { return prop(expansion(stPT(Pa(p0), t0), Pa(p1), e), 'X01'); } finally { iapRange = false; } });
reg('iapREGIONPT', (p, t) => { try { const r = regionPT(Pa(p), t); return r === 5 ? 0 : r; } catch (e) { return 0; } });

// аргументы-заглушки (unused) у функций без параметров
const ARITY = {};
for (const n in F) ARITY[n] = F[n].length;
function call(name, args) {
  const f = F[name]; if (!f) return undefined;
  const a = args.slice(0, Math.max(ARITY[name], 0));
  return f(...a);
}
function reset() { userGases = []; specCache.clear(); Object.assign(S, { tolerance: 2e-12, tolMode: 1, checkRange: 1, deltaTs: 1e-6, maxIter: 100, deltaP: 1e-3, initW: 600, initS: 100, lastErr: 0, dissMode: 0 }); }
const api = { F, call, reset, names: Object.keys(F), _: { stPT, stPH, stPS, stHS, satT, region1, region2, region3, region5, psat, tsat, visc, tcond } };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatWSP = api;
})(typeof window !== 'undefined' ? window : globalThis);
