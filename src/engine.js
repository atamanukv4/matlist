// Матлист — ядро. Исходники разбиты на блоки в src/engine/*.js (по порядку имён — это одно замыкание).
// В браузер/APK их склеивает build.js; этот файл — загрузчик для Node (тесты, tools/check_xmcd.js).
// Ошибки показываются как «engine/<блок>.js:<строка>».
const fs = require('fs'), path = require('path'), vm = require('vm'), { createRequire } = require('module');
const dir = path.join(__dirname, 'engine');
const parts = fs.readdirSync(dir).filter(f => /^\d\d_.*\.js$/.test(f)).sort();
const m = { exports: {} }; const req = createRequire(__filename);
// каждый блок компилируется со своим именем файла: стек вызовов указывает на нужный блок
let code = '', map = [];
for (const f of parts) { const src = fs.readFileSync(path.join(dir, f), 'utf8'); map.push([code.split('\n').length, f]); code += src + (src.endsWith('\n') ? '' : '\n'); }
const fn = vm.runInThisContext('(function (module, require) {\n' + code + '\n})', { filename: path.join(dir, 'ALL.js') });
fn.call(globalThis, m, req);
m.exports.__parts = map; // [первая строка в ALL.js, файл] — для перевода номеров строк
module.exports = m.exports;
