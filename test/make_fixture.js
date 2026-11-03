// Публичный учебный лист для сценариев в браузере: 24 региона, 3 результата, 4 знака, порог 5, ORIGIN 1.
// node test/make_fixture.js → test/fixtures/sample24.xmcd (тот же формат, что пишет Mathcad 15)
const fs = require('fs'); const E = require('../src/engine.js'); const X = require('../src/xmcd.js');
const R = [], T = (y, text) => R.push({ kind: 'text', x: 16, y, text }), M = (y, latex, x) => R.push({ kind: 'math', x: x || 16, y, latex });
let y = 10;
T(y, 'Учебный лист: расход пара через сечение'); y += 30;
const defs = ['D\\coloneq 120', 'v\\coloneq 0.0213', 'w\\coloneq 35', 'n\\coloneq 4', 'k\\coloneq 1.15', 'p\\coloneq 13.8', 't\\coloneq 545', 'G\\coloneq \\frac{D}{3.6}',
  'F\\coloneq \\frac{G\\cdot v}{w}', 'd\\coloneq \\sqrt{\\frac{4\\cdot F}{n\\cdot π}}', 'i\\coloneq 1..n', 'x_{i}\\coloneq i\\cdot d', 'S\\coloneq \\sum_{j=1}^{n}x_{j}',
  'f(z)\\coloneq z^{2}-2', 'z\\coloneq 1', 'r\\coloneq \\mathrm{root}\\left(f\\left(z\\right),z\\right)', 'A\\coloneq \\begin{bmatrix}2&1\\\\1&3\\end{bmatrix}', 'b\\coloneq \\begin{bmatrix}3\\\\5\\end{bmatrix}', 'q\\coloneq \\mathrm{lsolve}\\left(A,b\\right)'];
for (const d of defs) { M(y, d); y += 28; }
T(y, 'Результаты'); y += 28;
M(y, 'd='); y += 28; M(y, 'r='); y += 28; M(y, 'S='); y += 28;
const { xml, notes } = X.exportXmcd(R, { title: 'Учебный лист', decimals: 4, expThreshold: 5, origin: 1 }, E.parse);
if (notes.length) console.log(notes);
fs.writeFileSync(__dirname + '/fixtures/sample24.xmcd', xml); console.log('регионов:', R.length);
