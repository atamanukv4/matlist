// Сверка листа Mathcad с результатами, сохранёнными в файле: node test/sheet_check.js файл.xmcd [-v]
const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');
const E = require('../src/engine.js');
const X = require('../src/xmcd.js');
const file = process.argv[2], verbose = process.argv.includes('-v');
const { regions, warnings, settings } = X.importXmcd(fs.readFileSync(file, 'utf8'), DOMParser);
const R = new E.SheetRunner(settings.origin || 0);
let mcBad = 0, ok = 0, bad = 0, cmp = 0, cmpBad = 0; const errs = {}, mism = [];
const num = v => { try { return E.toNum(E.unitless ? E.unitless(v) : v); } catch (e) { return NaN; } };
regions.filter(r => r.kind === 'math').sort((a, b) => (a.y + (a.ady || 0)) - (b.y + (b.ady || 0)) || a.x - b.x).forEach(r => {
  let st;
  try {
    st = E.parse(r.latex); const out = R.step(st); ok++;
    const shown = out.shown !== undefined ? out.shown : out.value;
    if (r.stored != null && shown !== undefined) {
      const sv = Array.isArray(r.stored) ? r.stored : [r.stored];
      const mv = shown instanceof E.Mat ? shown.a.map(num) : shown instanceof E.Rng ? shown.vals.map(num) : [num(shown)];
      cmp++;
      const badk = sv.findIndex((s, k) => !(Math.abs(mv[k] - s) <= 1e-6 * Math.max(1e-9, Math.abs(s)) + 1e-12));
      if (badk >= 0) { cmpBad++; mism.push(r.latex.slice(0, 80) + ' → ' + mv[badk] + ' vs ' + sv[badk]); }
      else if (verbose) console.log('OK ', r.latex.slice(0, 70), mv.slice(0, 3));
    }
  } catch (e) { if (verbose) console.log('ERR', r.mcErr ? '(и в Mathcad: ' + r.mcErr + ')' : '', r.y, r.latex.slice(0, 120), '::', e.message); if (r.mcErr) { mcBad++; return; } bad++; const k = e.message.replace(/«.*?»/g, '«…»'); errs[k] = (errs[k] || 0) + 1; if (!errs['_ex_' + k]) errs['_ex_' + k] = r.latex.slice(0, 100); }
});
console.log(JSON.stringify({ file, regions: regions.length, ok, bad, mcBad, cmp, cmpBad, mism: mism.slice(0, 40), errs, warnings }, null, 1));
