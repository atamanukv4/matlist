// Импорт настоящих листов Mathcad 15 → пересчёт ядром Матлиста → сверка с результатами, сохранёнными Mathcad.
// Берёт все .xmcd из test/fixtures (публичные, лежат в git). Если есть corpus/user (личные файлы, вне git) —
// их можно прогнать через tools/check_xmcd.js; этот тест от них не зависит.
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const E = require('../src/engine.js');
const X = require('../src/xmcd.js');

function runSheet(file) {
  const { regions, warnings, settings } = X.importXmcd(fs.readFileSync(file, 'utf8'), DOMParser);
  const math = regions.filter(r => r.kind === 'math').sort((a, b) => a.y - b.y || a.x - b.x);
  let env = new E.Env(); env.set('ORIGIN', settings.origin || 0);
  let ok = 0, bad = 0, cmp = 0, cmpBad = 0; const errs = [], mism = [];
  for (const r of math) {
    try {
      const st = E.parse(r.latex); const res = E.execStatement(st, env); env = res.env; ok++;
      if (r.stored != null && res.value !== undefined && typeof res.value === 'number') {
        cmp++; const rel = Math.abs(res.value - r.stored) / Math.max(1e-12, Math.abs(r.stored));
        if (rel > 1e-6) { cmpBad++; mism.push(r.latex.slice(0, 60) + ' → ' + res.value + ' вместо ' + r.stored); }
      }
    } catch (e) { bad++; errs.push(e.message + ' :: ' + r.latex.slice(0, 90)); }
  }
  return { file: path.basename(file), math: math.length, ok, bad, cmp, cmpBad, errs, mism, warnings };
}

const dir = path.join(__dirname, 'fixtures');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xmcd')).map(f => path.join(dir, f));
let fails = 0;
for (const f of files) {
  const r = runSheet(f);
  const good = r.bad === 0 && r.cmpBad === 0 && r.math > 0;
  if (!good) fails++;
  console.log((good ? 'ok  ' : 'FAIL') + ' ' + r.file + ': регионов ' + r.math + ', посчитано ' + r.ok + ', сверено с Mathcad ' + r.cmp + ', расхождений ' + r.cmpBad);
  for (const m of r.errs) console.log('     ошибка: ' + m);
  for (const m of r.mism) console.log('     расхождение: ' + m);
}
console.log(`${files.length - fails}/${files.length} ok`);
if (fails || !files.length) process.exit(1);
