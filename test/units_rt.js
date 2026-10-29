// Импорт листа с единицами → экспорт → обратный импорт: значения совпадают
const fs = require('fs'); const { DOMParser } = require('@xmldom/xmldom');
const E = require('../src/engine.js'); const X = require('../src/xmcd.js');
const file = process.argv[2]; const out = process.argv[3];
function run(regs, origin) {
  const R = new E.SheetRunner(origin); const vals = [];
  for (const r of regs.filter(r => r.kind === 'math').sort((a, b) => (a.y + (a.ady || 0)) - (b.y + (b.ady || 0)) || a.x - b.x)) {
    try { const o = R.step(E.parse(r.latex)); const v = o.shown !== undefined ? o.shown : o.value; vals.push(v === undefined ? '-' : E.fmtValue(v, E.DEFAULT_FMT, o.unitTex)); } catch (e) { vals.push('ERR'); }
  }
  return vals;
}
const a = X.importXmcd(fs.readFileSync(file, 'utf8'), DOMParser);
const PT = 4 / 3;
const regs = a.regions.map(r => Object.assign({}, r, { x: r.x * PT, y: r.y * PT, ady: (r.ady || 0) * PT }));
const ex = X.exportXmcd(regs, Object.assign({ title: 't' }, a.settings), E.parse);
const xml = ex.xml || ex; fs.writeFileSync(out, xml);
const b = X.importXmcd(xml, DOMParser);
const va = run(a.regions, a.settings.origin || 0), vb = run(b.regions, b.settings.origin || 0);
let diff = 0; for (let i = 0; i < Math.max(va.length, vb.length); i++) if (va[i] !== vb[i]) { diff++; if (diff < 8) console.log('DIFF', i, va[i] && va[i].slice(0, 60), '|', vb[i] && vb[i].slice(0, 60)); }
console.log('regions', va.length, vb.length, 'diff', diff, 'errA', va.filter(v => v === 'ERR').length, 'errB', vb.filter(v => v === 'ERR').length);
