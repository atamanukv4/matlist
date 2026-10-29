// Сверка встроенных функций WSP с WaterSteamPro 6.6 (значения получены в Mathcad 15 пользователя).
const W = require('../src/wsp.js');
const E = require('../src/engine.js');
const REF = [
  ['wspHPT', [1e6, 500], 2891276.5646355106],
  ['wspPTHS', [3e6, 7000], [1075465.268963353, 550.1891892542094]],
  ['wspVUSHCVWDERPTPT', [1e6, 500], [0.22062672728940236, 2670649.8373461082, 6825.05291239611, 2891276.5646355106, 1671.8283010778043, 535.66670755953851, -2.3154448053559055E-07, -0.034220313616619251, -0.0005315295883044196, -0.045138066862807441, 0.0005315295883044196, 1750.383873494025, 4.5638269235968894, 2281.9134617984446]],
  ['wspDYNVISSST', [300], 9.75957793551427e-06], ['wspDYNVISSWT', [300], 0.0008537511043554653],
  ['wspDYNVISSWT', [647], 4.188306426467064e-05], ['wspKINVISSST', [373.15], 2.0450463230046504e-05],
  ['wspDYNVISRT', [300, 750], 4.318483205881977e-05],
  ['wspTSHS', [2600000, 6000], 476.2726254380753, 1e-6],
  ['wspgHIDT', [0, 500], 520490.1352117609], ['wspgCPIDT', [0, 300], 1039.720263617141], ['wspgHIDT', [4, 500], 934347.4382881022],
  ['wspgHGST', ['N2:0.79;O2:0.21', 500], 506730.5144330463], ['wspgSGST', ['N2:0.79;O2:0.21', 500], 7415.543418],
  ['wspgSGSPT', ['N2:0.79;O2:0.21', 300000, 500], 7098.930754], ['wspgSGST', ['N2:1M;O2:1M', 500], 7330.702998],
  ['wspgSIDT', [6, 500], 7388.689922], ['wspgIDNAME', ['Air'], 6], ['wspgMMID', [6], 0.02896431986],
  ['wspgCPIDT', [10, 300], 520.3309302092721], ['wspgCPIDT', [12, 300], 14311.146850302252], ['wspgCPIDT', [17, 400], 2131.085793918542],
  ['wspGETWSPVERSION', [0], 6.6],
];
let ok = 0, bad = [];
for (const [f, a, want, tol] of REF) {
  let got; try { got = W.call(f, a); } catch (e) { got = e.message; }
  const t = tol || 2e-8;
  const cmp = (g, w) => typeof g === 'number' && Math.abs(g - w) <= t * Math.max(Math.abs(w), 1e-12);
  const good = Array.isArray(want) ? Array.isArray(got) && want.every((w, i) => cmp(got[i], w)) : cmp(got, want);
  if (good) ok++; else bad.push(f + '(' + a.join(', ') + ') = ' + JSON.stringify(got) + ', а WSP: ' + JSON.stringify(want));
}
// формулы на листе
const R = new E.SheetRunner(0);
const sheet = [['h_{0}\\coloneq\\frac{\\operatorname{wspHPT}\\left(13\\cdot10^{6},540+273.15\\right)}{1000}', null],
  ['t_{\\mathrm{s}}\\coloneq\\operatorname{wspTSP}\\left(10^{6}\\right)-273.15=', 179.886],
  ['\\operatorname{wspgHGST}\\left(\\text{"N2:0.79;O2:0.21"},500\\right)=', 506730.514]];
for (const [tx, want] of sheet) {
  try { const o = R.step(E.parse(tx)); if (want == null || Math.abs(o.value - want) < 1e-3 * Math.abs(want)) ok++; else bad.push(tx + ' → ' + o.value); }
  catch (e) { bad.push(tx + ' → ' + e.message); }
}
// ошибки там, где WSP их выдаёт
for (const [f, a] of [['wspCPPH', [16e6, 1.9e6]], ['wspXPH', [1000, 2.6e6]], ['wspVMSPT', [5e6, 500]], ['wspgCPIDT', [13, 250]]]) {
  try { W.call(f, a); bad.push(f + ' должна давать ошибку'); } catch (e) { ok++; }
}
console.log(ok + '/' + (ok + bad.length) + (bad.length ? ' FAIL\n  ' + bad.join('\n  ') : ' ok'));
if (bad.length) process.exitCode = 1;
