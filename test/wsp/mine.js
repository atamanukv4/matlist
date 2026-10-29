// Значения встроенных функций WSP Матлиста для набора выражений ref_exprs.json (для сверки с WaterSteamPro).
const W = require('../../src/wsp.js');
const ex = require('./ref_exprs.json');
const out = [];
for (const e of ex) {
  const m = e.match(/^(\w+)\((.*)\)$/);
  let v = null;
  try {
    const args = m[2].split(/,\s*/).map(a => a.startsWith('"') ? a.slice(1, -1) : eval(a.replace(/\^/g, '**')));
    W.reset();
    const r = W.call(m[1], args);
    v = Array.isArray(r) ? r : (typeof r === 'number' && isFinite(r) ? r : null);
  } catch (err) { v = null; }
  out.push(Array.isArray(v) ? v.map(x => +x.toPrecision(12)) : v == null ? null : +v.toPrecision(12));
}
require('fs').writeFileSync('mine.json', JSON.stringify(out));
const z = require('zlib').deflateSync(Buffer.from(JSON.stringify(out)), { level: 9 }).toString('base64');
require('fs').writeFileSync('mine.b64', z);
console.log(out.length, out.filter(x => x === null).length, z.length);
