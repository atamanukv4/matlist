// Этап 2: индексы (литеральные и массивные, русские), греческие варианты, вложенные интегралы
const E = require('../src/engine.js');
const C = [
  [String.raw`P_{вх}\coloneq 3`, null], [String.raw`P_{вх}=`, 3], [String.raw`P_{\mathrm{вх}}\cdot 2=`, 6], [String.raw`P_{\text{вх}}=`, 3],
  [String.raw`Q_{макс}\coloneq 2`, null], [String.raw`Q_{макс}+1=`, 3],
  [String.raw`a_{b}\coloneq 1`, null], [String.raw`ab\coloneq 5`, null], [String.raw`a_{b}=`, 1], [String.raw`ab=`, 5],
  [String.raw`x_{max}\coloneq 7`, null], [String.raw`x_{max}+1=`, 8], [String.raw`x_{e}\coloneq 2`, null], [String.raw`x_{e}=`, 2], [String.raw`t_{s}\coloneq 4`, null], [String.raw`t_{s}=`, 4],
  [String.raw`i\coloneq 0..2`, null], [String.raw`t_{i}\coloneq i^{2}`, null], [String.raw`t_{2}=`, 4],
  [String.raw`P\coloneq 10`, null], [String.raw`P_{1}\coloneq 5`, null], [String.raw`P_{1}+P=`, 15],
  [String.raw`ϕ\coloneq 0.035`, null], [String.raw`ϕ\cdot 2=`, 0.07],
  [String.raw`\int_{0}^{1}\int_{0}^{2}x\cdot y\,\mathrm{d}y\,\mathrm{d}x=`, 1],
  [String.raw`\int_{0}^{1}\int_{0}^{1}\int_{0}^{1}x+y+z\,\mathrm{d}z\,\mathrm{d}y\,\mathrm{d}x=`, 1.5],
  [String.raw`T_{г1}\coloneq 1000`, null], [String.raw`T_{г1}=`, 1000],
];
const R = new E.SheetRunner(0); let n = 0, fails = 0;
for (const [l, want] of C) {
  n++;
  try { const o = R.step(E.parse(l)); if (want === null) continue; const v = E.toNum(o.value instanceof E.Q ? o.value.v : o.value);
    if (Math.abs(v - want) > 1e-6 * Math.max(1, Math.abs(want))) { fails++; console.log('FAIL', l, '→', v, 'ожидалось', want); } }
  catch (e) { fails++; console.log('ERR ', l, '→', e.message); }
}
console.log((n - fails) + '/' + n + (fails ? ' FAIL' : ' ok'));
process.exitCode = fails ? 1 : 0;
