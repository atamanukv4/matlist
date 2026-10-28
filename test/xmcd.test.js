// Импорт настоящих листов Mathcad 15 → пересчёт ядром Матлиста → сверка с результатами, сохранёнными Mathcad.
const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');
const E = require('../src/engine.js');
const X = require('../src/xmcd.js');

function runSheet(file) {
  const { regions, warnings, settings } = X.importXmcd(fs.readFileSync(file, 'utf8'), DOMParser);
  const math = regions.filter(r => r.kind === 'math').sort((a, b) => a.y - b.y || a.x - b.x);
  let env = new E.Env(); env.set('ORIGIN', settings.origin || 0); let ok = 0, bad = 0, errs = {}, cmp = 0, cmpBad = 0, mism = [];
  for (const r of math) {
    try {
      const st = E.parse(r.latex); const res = E.execStatement(st, env); env = res.env; ok++;
      if (r.stored != null && res.value !== undefined && typeof res.value === 'number') {
        cmp++; const rel = Math.abs(res.value - r.stored) / Math.max(1e-12, Math.abs(r.stored));
        if (rel > 1e-6) { cmpBad++; if (mism.length < 5) mism.push(r.latex.slice(0, 60) + ' → ' + res.value + ' vs ' + r.stored); }
      }
    } catch (e) { bad++; const k = e.message.replace(/«.*?»/g, '«…»'); errs[k] = (errs[k] || 0) + 1; if (!errs['_ex_' + k]) errs['_ex_' + k] = r.latex.slice(0, 90); }
  }
  return { settings, file, regions: regions.length, math: math.length, ok, bad, cmp, cmpBad, mism, errs, warnings };
}
for (const f of ['test/fixtures/tgmp.xmcd', 'test/fixtures/kes500_part.xmcd']) console.log(JSON.stringify(runSheet(f), null, 1));
