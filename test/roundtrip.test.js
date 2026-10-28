// Тестовый лист → .xmcd → обратный импорт → те же результаты; плюс файл для сверки в Mathcad 15.
const fs = require('fs'); const { DOMParser } = require('@xmldom/xmldom');
global.window = {}; require('../src/testsheet.js');
const E = require('../src/engine.js'), X = require('../src/xmcd.js');
const PT = 4 / 3;
function compute(regs, origin) {
  const R = new E.SheetRunner(origin || 0); const out = [];
  for (const r of regs.filter(r => r.kind === 'math').sort((a, b) => a.y - b.y || a.x - b.x)) {
    try { const res = R.step(E.parse(r.latex)); let v = res.value; if (v instanceof E.Sol) v = new E.Mat(v.vals.length, 1, v.vals); if (v !== undefined && v !== null) out.push(E.fmtValue(v)); }
    catch (e) { out.push('ERR ' + e.message); }
  }
  return out;
}
const regs = window.MATLIST_TEST();
const { xml, notes } = X.exportXmcd(regs, { title: 'Тестовый лист Матлиста' }, E.parse);
fs.writeFileSync('test/out_testsheet.xmcd', xml);
const back = X.importXmcd(xml, DOMParser);
const backRegs = back.regions.map(r => Object.assign({}, r, { x: r.x * PT, y: r.y * PT }));
const a = compute(regs), b = compute(backRegs.filter(r => r.kind === 'math'));
let diff = 0; const n = Math.max(a.length, b.length);
for (let i = 0; i < n; i++) if (a[i] !== b[i]) { diff++; if (diff < 8) console.log('DIFF', i, a[i], '|', b[i]); }
console.log('математических регионов:', a.length, 'после обратного импорта:', b.length, 'расхождений:', diff);
console.log('заметки экспорта:', notes);
process.exit(diff ? 1 : 0);
