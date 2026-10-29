// .md → лист: разбор Markdown, превращение записей решения в определения/вывод, экспорт в .xmcd и обратный импорт
const fs = require('fs'); const path = require('path');
const E = require('../src/engine.js'); const X = require('../src/xmcd.js'); const M = require('../src/md.js'); const { DOMParser } = require('@xmldom/xmldom');
let ok = 0, bad = 0; const fails = [];
function eq(name, got, want) { if (JSON.stringify(got) === JSON.stringify(want)) ok++; else { bad++; fails.push(name + ': ' + JSON.stringify(got) + ' ≠ ' + JSON.stringify(want)); } }
const f = t => M.formula(t);
eq('def число', f('x = 5').latex, 'x\\coloneq 5');
eq('def с выводом', f('R = \\frac{\\delta}{\\lambda} = 0.357').latex, 'R\\coloneq \\frac{\\delta}{\\lambda}=');
eq('вывод', f('2 + 3 = 5').latex, '2 + 3=');
eq('уравнение', f('x^2 - 5x + 6 = 0').kind, 'eq');
eq('\\approx', f('q \\approx 84').latex, 'q\\coloneq 84');
eq('десятичная запятая', f('a = 2,5').latex, 'a\\coloneq 2.5');
eq('единицы текстом', [f('v = 12 \\ \\text{м/с}').latex, f('v = 12 \\ \\text{м/с}').unit], ['v\\coloneq 12', 'м/с']);
eq('\\times', f('F = 2 \\times 3').latex, 'F\\coloneq 2 \\cdot  3=');
eq('уже :=', f('a := 1').latex, 'a \\coloneq  1');
eq('текст', M.inline('**Ответ:** $q \\approx 84$ Вт/м$^2$'), 'Ответ: q ≈ 84 Вт/м²');
eq('блоки', M.blocks('# Т\n\nабзац\nстрока\n\n$$a=1$$\n- п1\n- п2').map(b => b.t), ['h', 'p', 'math', 'list']);
const md = fs.readFileSync(path.join(__dirname, 'md/sample.md'), 'utf8');
const sh = M.mdToSheet(md);
eq('заголовок', sh.title, 'Задача 1. Тепловой расчёт стенки');
const R = new E.SheetRunner(0); const vals = {};
for (const r of sh.regions.slice().sort((a, b) => a.y - b.y || a.x - b.x)) if (r.kind === 'math' && !r.noeval) { const o = R.step(E.parse(r.latex)); if (o.value !== undefined && /=$/.test(r.latex)) vals[r.latex.split('\\coloneq')[0].trim()] = E.fmtValue(o.value); }
eq('R', vals.R, '0.357'); eq('Δt', vals['\\Delta t'], '30'); eq('q', vals.q, '84'); eq('D', vals.D, '1');
eq('исходные данные из текста', sh.regions.filter(r => r.kind === 'math' && /coloneq 0\.(25|7)$/.test(r.latex)).length, 2);
eq('подписи единиц', sh.regions.filter(r => r.mdUnit).map(r => r.text), ['м', 'Вт/(м·К)', 'м²·К/Вт']);
eq('уравнение — только показ', sh.regions.filter(r => r.noeval).length, 1);
const ex = X.exportXmcd(sh.regions, { title: 'md' }, E.parse); const xml = ex.xml || ex;
eq('экспорт без ошибок', (ex.notes || []).filter(n => /ошибка/.test(n)), []);
eq('отключённое вычисление', /disable-calc="true"/.test(xml), true);
const back = X.importXmcd(xml, DOMParser).regions;
const R2 = new E.SheetRunner(0); let qv = null;
for (const r of back.slice().sort((a, b) => (a.y + (a.ady || 0)) - (b.y + (b.ady || 0)) || a.x - b.x)) if (r.kind === 'math') { try { const o = R2.step(E.parse(r.latex)); if (/^q\\coloneq/.test(r.latex)) qv = E.fmtValue(o.value); } catch (e) {} }
eq('обратный импорт: q', qv, '84');
eq('обратный импорт: текст', back.some(r => r.kind === 'text' && /Термическое сопротивление/.test(r.text)), true);
console.log(fails.join('\n')); console.log(ok + '/' + (ok + bad) + ' ok'); if (bad) process.exit(1);
