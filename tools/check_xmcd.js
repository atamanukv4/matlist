// Прогон корпуса .xmcd: импорт → пересчёт ядром (как SheetRunner в app.js) → сверка с результатами, сохранёнными Mathcad.
// node tools/check_xmcd.js <папка или файлы…> [--json out.json] [--timeout 20000]
// Каждый файл — в отдельном процессе с таймаутом: зависание = строка HANG, а не зависший прогон.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const args = process.argv.slice(2);
if (args[0] === '--one') { one(args[1]); return; }
let jsonOut = null, timeout = 20000; const inputs = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--json') jsonOut = args[++i]; else if (args[i] === '--timeout') timeout = +args[++i]; else inputs.push(args[i]); }
const files = inputs.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.xmcd$/i.test(f)).sort().map(f => path.join(p, f)) : [p]);
const all = [], agg = {};
for (const f of files) {
  const t0 = Date.now(); const r = spawnSync(process.execPath, [__filename, '--one', f], { timeout, encoding: 'utf8', maxBuffer: 64 << 20 });
  let res; if (r.error && r.error.code === 'ETIMEDOUT' || r.signal) res = { status: 'HANG', ms: Date.now() - t0 };
  else { try { res = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { res = { status: 'CRASH', msg: (r.stderr || '').split('\n').slice(0, 3).join(' | ') }; } }
  res.file = path.basename(f); all.push(res);
  for (const [k, v] of Object.entries(res.errs || {})) { if (k.startsWith('_ex_')) continue; agg[k] = agg[k] || { n: 0, files: new Set(), ex: res.errs['_ex_' + k] }; agg[k].n += v; agg[k].files.add(res.file); }
  const s = res.status === 'OK' ? `рег ${res.math} ок ${res.ok} ошиб ${res.bad} сверка ${res.cmp - res.cmpBad}/${res.cmp} ${res.ms}мс` : (res.msg || res.ms + 'мс');
  console.log((res.status === 'OK' ? (res.bad || res.cmpBad ? 'PART ' : 'OK   ') : res.status.padEnd(5)) + ' ' + res.file.slice(0, 50).padEnd(50) + ' ' + s);
}
console.log('\nОшибки по частоте:');
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].n - a[1].n).slice(0, 40)) console.log(String(v.n).padStart(5), `[${v.files.size} ф.]`, k.slice(0, 90), '\n        пример:', (v.ex || '').slice(0, 110));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(all, null, 1));

function one(f) {
  const { DOMParser } = require('@xmldom/xmldom'); const E = require('../src/engine.js'); const X = require('../src/xmcd.js');
  const t0 = Date.now(); let imp;
  try { imp = X.importXmcd(fs.readFileSync(f, 'utf8'), DOMParser); } catch (e) { console.log(JSON.stringify({ status: 'NOIMP', msg: 'импорт: ' + e.message })); return; }
  const tImp = Date.now() - t0;
  const math = E.calcOrder(imp.regions).filter(r => r.kind === 'math'); // порядок счёта как в app.js
  const R = new E.SheetRunner(imp.settings.origin || 0);
  let ok = 0, bad = 0, cmp = 0, cmpBad = 0, slow = []; const errs = {}, mism = [];
  const unsup = imp.regions.filter(r => r.kind === 'unsupported' || r.unsupported).length;
  for (const r of math) {
    if (!r.latex || r.noeval) continue; const t1 = Date.now();
    try {
      const out = R.step(E.parse(r.latex)); ok++;
      const v = out.value;
      if (r.stored != null && typeof r.stored === 'number' && v !== undefined) {
        let x = null; try { x = E.toNum(E.unitless ? (out.shown !== undefined ? out.shown : v) : v); } catch (e) { x = null; }
        if (x !== null && isFinite(x)) { cmp++; const rel = Math.abs(x - r.stored) / Math.max(1e-9, Math.abs(r.stored)); if (rel > 1e-4) { cmpBad++; if (mism.length < 8) mism.push(r.latex.slice(0, 70) + ' → ' + x + ' vs ' + r.stored); } }
      }
    } catch (e) { bad++; const m0 = e.message || String(e); const k = /не определена/.test(m0) ? m0 : m0.replace(/«[^»]*»/g, '«…»'); errs[k] = (errs[k] || 0) + 1; if (!errs['_ex_' + k]) errs['_ex_' + k] = r.latex.slice(0, 120); }
    const dt = Date.now() - t1; if (dt > 500) slow.push([dt, r.latex.slice(0, 60)]);
  }
  console.log(JSON.stringify({ status: 'OK', regions: imp.regions.length, math: math.length, unsup, warnings: (imp.warnings || []).slice(0, 10), ok, bad, cmp, cmpBad, mism, errs, slow: slow.slice(0, 5), msImport: tImp, ms: Date.now() - t0 }));
}
