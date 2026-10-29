// Единицы измерения Mathcad: арифметика размерностей, °C, вывод в заданных единицах, импорт/экспорт .xmcd
const E = require('../src/engine.js'); const X = require('../src/xmcd.js'); const { DOMParser } = require('@xmldom/xmldom');
let ok = 0, bad = 0; const fails = [];
function run(lines) { const R = new E.SheetRunner(0); let o; for (const l of lines) o = R.step(E.parse(l)); return o; }
function shown(lines) { const o = run(lines); const v = o.shown !== undefined ? o.shown : o.value; return E.fmtValue(v, E.DEFAULT_FMT, o.unitTex); }
function eq(name, got, want) { if (got === want) ok++; else { bad++; fails.push(name + ': ' + got + ' ≠ ' + want); } }
function throws(name, lines, re) { try { run(lines); bad++; fails.push(name + ': нет ошибки'); } catch (e) { if (re.test(e.message)) ok++; else { bad++; fails.push(name + ': ' + e.message); } } }
eq('kg', shown(['x\\coloneq 5\\,\\mathrm{kg}', 'x=']), '5\\,\\mathrm{kg}');
eq('площадь', shown(['a\\coloneq 3\\,\\mathrm{m}', 'a\\cdot a=']), '9\\,\\mathrm{m}^{2}');
eq('мощность в W', shown(['q\\coloneq 2\\,\\mathrm{kJ}', 'q/(4\\,\\mathrm{s})=']), '500\\,\\mathrm{W}');
eq('в kW', shown(['N\\coloneq 84.7\\,\\mathrm{MW}', 'N=\\left[\\mathrm{kW}\\right]']), '8.47\\times10^{4}\\,\\mathrm{kW}');
eq('°C → K', shown(['t\\coloneq 60\\,°C', 't=']), '333.15\\,\\mathrm{K}');
eq('K → °C', shown(['t\\coloneq 373.15\\,\\mathrm{K}', 't=\\left[°C\\right]']), '100\\,°C');
eq('разность °C', shown(['d\\coloneq 60\\,°C-20\\,°C', 'd=']), '40\\,\\mathrm{K}');
eq('градусы', shown(['\\phi\\coloneq 30\\,°', '\\sin\\left(\\phi\\right)=']), '0.5');
eq('атмосферы', shown(['p\\coloneq 2\\,\\mathrm{atm}', 'p=\\left[\\mathrm{kPa}\\right]']), '202.65\\,\\mathrm{kPa}');
eq('литры', shown(['V\\coloneq 86\\,\\frac{\\mathrm{L}}{\\mathrm{m}^{2}}', 'V=\\left[\\mathrm{mm}\\right]']), '86\\,\\mathrm{mm}');
eq('скорость', shown(['v\\coloneq \\frac{100\\,\\mathrm{km}}{2\\,\\mathrm{hr}}', 'v=\\left[\\frac{\\mathrm{m}}{\\mathrm{s}}\\right]']), '13.889\\,\\frac{\\mathrm{m}}{\\mathrm{s}}');
eq('корень', shown(['\\sqrt{16\\,\\mathrm{m}^{2}}=']), '4\\,\\mathrm{m}');
eq('вектор', shown(['w\\coloneq \\begin{bmatrix}1\\\\2\\end{bmatrix}\\cdot \\mathrm{m}', 'w=']), '\\begin{bmatrix}1\\\\2\\end{bmatrix}\\,\\mathrm{m}');
eq('min с единицами', shown(['\\min\\left(3\\,\\mathrm{m},2\\,\\mathrm{m}\\right)=']), '2\\,\\mathrm{m}');
eq('min — минуты', shown(['10\\,\\mathrm{min}=\\left[\\mathrm{s}\\right]']), '600\\,\\mathrm{s}');
eq('переменная m затеняет метр', shown(['m\\coloneq 5', 'm\\cdot 2=']), '10');
eq('\\mathrm{m} — метр, даже если m — переменная', shown(['m\\coloneq 1,2..3', 'L\\coloneq 2\\,\\mathrm{m}', 'L=']), '2\\,\\mathrm{m}');
eq('остаток размерности при неверных единицах', shown(['x\\coloneq 5\\,\\mathrm{m}', 'x=\\left[\\mathrm{s}\\right]']), '5\\,\\mathrm{s}\\cdot \\frac{\\mathrm{m}}{\\mathrm{s}}');
eq('скаляр + вектор', shown(['v\\coloneq \\begin{bmatrix}1\\\\2\\end{bmatrix}', 'v+1=']), '\\begin{bmatrix}2\\\\3\\end{bmatrix}');
throws('несовместимые единицы', ['2\\,\\mathrm{m}+3\\,\\mathrm{s}='], /Несовместимые единицы/);
throws('sin от метров', ['\\sin\\left(2\\,\\mathrm{m}\\right)='], /безразмерн/);
// .xmcd: единицы, °C, вывод в единицах
const L = ['A\\coloneq 15\\,\\mathrm{m}^{2}', 'q\\coloneq 4.9\\,\\frac{\\mathrm{W}}{\\mathrm{m}^{2}\\cdot \\mathrm{K}}', 'Q\\coloneq A\\cdot q\\cdot 20\\,\\mathrm{K}=\\left[\\mathrm{kW}\\right]', 't\\coloneq 60\\,°C=', 'm\\coloneq 1,2..3', 'z_{m}\\coloneq m\\cdot \\mathrm{m}'];
const regs = L.map((latex, i) => ({ kind: 'math', x: 20, y: 20 + 40 * i, latex }));
const xml = X.exportXmcd(regs, { title: 'u' }, E.parse); const s = xml.xml || xml;
eq('экспорт °C — постфикс', /<ml:apply fixity="postfix"><ml:id xml:space="preserve">°C<\/ml:id><ml:real>60<\/ml:real>/.test(s), true);
eq('экспорт unitOverride', /<ml:unitOverride><ml:id xml:space="preserve">kW<\/ml:id><\/ml:unitOverride>/.test(s), true);
eq('экспорт: переменная m с пустым индексом', /<ml:id xml:space="preserve" subscript="">m<\/ml:id><ml:range>/.test(s), true);
const back = X.importXmcd(s, DOMParser).regions.filter(r => r.kind === 'math').map(r => r.latex);
eq('обратный импорт', shown(back.slice(0, 3)), '1.47\\,\\mathrm{kW}');
eq('обратный импорт: \\mathrm{m} в z', shown(back.concat(['z='])), '\\begin{bmatrix}0\\\\1\\\\2\\\\3\\end{bmatrix}\\,\\mathrm{m}');
console.log(fails.join('\n')); console.log(ok + '/' + (ok + bad) + ' ok'); if (bad) process.exit(1);
