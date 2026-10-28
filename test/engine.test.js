const E = require('../src/engine.js');
let env = new E.Env(); let fails = 0, n = 0;
function run(latex) { const st = E.parse(latex); const r = E.execStatement(st, env); env = r.env; return r; }
function val(latex) { const r = run(latex); return r.value; }
function num(latex, expect, tol = 1e-9) {
  n++;
  try {
    const v = val(latex); const x = typeof v === 'number' ? v : (v && v.re !== undefined ? v : v);
    const ok = typeof expect === 'function' ? expect(v) : Math.abs(E.toNum(v) - expect) <= tol * Math.max(1, Math.abs(expect));
    if (!ok) { fails++; console.log('FAIL', latex, '→', E.fmtValue(v), 'ожидалось', expect); }
  } catch (e) { fails++; console.log('ERR ', latex, '→', e.message); }
}
function errs(latex, re) { n++; try { run(latex); fails++; console.log('NOERR', latex); } catch (e) { if (re && !re.test(e.message)) { fails++; console.log('WRONGERR', latex, e.message); } } }
function fmt(latex, s) { n++; try { const v = val(latex); const f = E.fmtValue(v); if (f !== s) { fails++; console.log('FMT', latex, '→', f, '≠', s); } } catch (e) { fails++; console.log('ERR ', latex, e.message); } }

// переменные и арифметика
run('a\\coloneq 2.5'); run('b\\coloneq 4');
num('a\\cdot b+\\sqrt{b}=', 12);
num('\\frac{a}{b}=', 0.625);
num('a^{2}+b^2=', 22.25);
num('2a=', 5);
num('-b^2=', -16);
num('\\left(a+b\\right)\\cdot2=', 13);
num('\\sqrt[3]{27}=', 3);
num('\\sqrt[3]{-8}=', -2);
num('5!=', 120);
num('\\left|-3\\right|=', 3);
num('10\\%=', 0.1);
// литеральные индексы
run('G_{\\mathrm{пв}}\\coloneq 266'); run('c_{\\mathrm{р}}\\coloneq 4.19'); run('\\Delta t\\coloneq 65');
num('Q_{\\mathrm{т}}\\coloneq G_{\\mathrm{пв}}\\cdot c_{\\mathrm{р}}\\cdot\\Delta t=', 72445.1, 1e-9);
num('Q_{\\mathrm{т}}=', 72445.1);
fmt('Q_{\\mathrm{т}}=', '7.245\\times10^{4}');
// подстрочный без mathrm, но определённый литерально
run('h_{0}\\coloneq 3400');
num('h_0=', 3400);
// функции
run('f\\left(x\\right)\\coloneq x^2-2');
num('f\\left(3\\right)=', 7);
run('g(x,y)\\coloneq\\sqrt{x^2+y^2}');
num('g(3,4)=', 5);
num('\\sin\\left(\\frac{\\pi}{6}\\right)=', 0.5);
num('\\sin\\frac{\\pi}{2}=', 1);
num('\\ln\\left(e\\right)=', 1);
num('\\log\\left(1000\\right)=', 3);
num('\\log\\left(8,2\\right)=', 3);
num('\\exp(1)=', Math.E);
num('\\operatorname{atan2}\\left(1,1\\right)=', Math.PI / 4);
num('\\cos^2(0)=', 1);
num('\\mathrm{if}\\left(a>b,1,0\\right)=', 0);
num('\\mathrm{if}\\left(a<b,1,0\\right)=', 1);
num('\\max(3,7,2)=', 7);
// уравнения
num('\\operatorname{root}\\left(f\\left(x\\right),x,0,3\\right)=', Math.SQRT2);
run('x\\coloneq 1');
num('\\operatorname{root}\\left(x^3-x-1,x\\right)=', 1.324717957244746);
num('\\operatorname{polyroots}\\left(\\begin{bmatrix}-6\\\\11\\\\-6\\\\1\\end{bmatrix}\\right)=', v => [1, 2, 3].every((r, k) => Math.abs(E.re(v.a[k]) - r) < 1e-9));
// матрицы
run('A\\coloneq\\begin{bmatrix}2&1\\\\1&3\\end{bmatrix}'); run('v\\coloneq\\begin{bmatrix}3\\\\5\\end{bmatrix}');
num('\\left|A\\right|=', 5);
num('A^{-1}=', m => Math.abs(m.get(0, 0) - 0.6) < 1e-12 && Math.abs(m.get(0, 1) + 0.2) < 1e-12);
num('A^{T}=', m => m.get(0, 1) === 1);
num('\\operatorname{lsolve}\\left(A,v\\right)=', m => Math.abs(m.a[0] - 0.8) < 1e-12 && Math.abs(m.a[1] - 1.4) < 1e-12);
num('A\\cdot v=', m => m.a[0] === 11 && m.a[1] === 18);
num('v\\cdot v=', 34);
num('v_{1}=', 5);
num('A_{1,0}=', 1);
num('\\operatorname{rows}(A)=', 2);
num('\\operatorname{eigenvals}(A)=', m => Math.abs(E.re(m.a[0]) - (2.5 - Math.sqrt(5) / 2)) < 1e-9);
// ранжированные переменные и массивы
run('i\\coloneq0..5');
run('y_{i}\\coloneq i^2');
num('y_{4}=', 16);
num('\\operatorname{length}\\left(y\\right)=', 6);
num('\\sum_{i}y_{i}=', 55);
run('t\\coloneq0,0.5..2');
num('\\operatorname{length}(t)=', E => true);
const tab = val('t^2='); n++; if (!(tab instanceof E.Rng) || tab.vals.length !== 5 || tab.vals[4] !== 4) { fails++; console.log('FAIL table', tab); }
// матанализ
num('\\int_{0}^{\\pi}\\sin\\left(x\\right)\\,\\mathrm{d}x=', 2, 1e-10);
num('\\int_0^1 x^2\\,dx=', 1 / 3, 1e-10);
num('\\int_{0}^{\\infty}e^{-x}\\,\\mathrm{d}x=', 1, 1e-7);
run('x\\coloneq2');
num('\\frac{\\mathrm{d}}{\\mathrm{d}x}x^3=', 12, 1e-8);
num('\\frac{d}{dx}\\sin\\left(x\\right)=', Math.cos(2), 1e-9);
num('\\frac{\\mathrm{d}^{2}}{\\mathrm{d}x^{2}}x^3=', 12, 1e-5);
num('\\sum_{k=1}^{100}\\frac{1}{k^2}=', 1.6349839001848923);
num('\\prod_{k=1}^{5}k=', 120);
// комплексные
run('z\\coloneq3+4i');
num('\\left|z\\right|=', 5);
fmt('\\sqrt{-4}=', '2i');
fmt('z\\cdot z=', '-7+24i');
num('\\operatorname{Re}(z)=', 3);
// ОДУ
run('\\omega\\coloneq2'); run('\\zeta\\coloneq0.3');
run('D\\left(t,Y\\right)\\coloneq\\begin{bmatrix}Y_{1}\\\\\\omega^2\\cdot\\left(1-Y_{0}\\right)-2\\zeta\\cdot\\omega\\cdot Y_{1}\\end{bmatrix}');
run('Z\\coloneq\\operatorname{rkfixed}\\left(\\begin{bmatrix}0\\\\0\\end{bmatrix},0,15,300,D\\right)');
num('Z_{300,1}=', 1, 1e-2);
num('\\operatorname{rows}\\left(Z\\right)=', 301);
num('\\max\\left(Z^{\\langle1\\rangle}\\right)=', v => E.toNum(v) > 1.3 && E.toNum(v) < 1.4);
// форматирование
fmt('\\pi=', '3.142');
fmt('1234.5678=', '1.235\\times10^{3}');
fmt('0.0001234=', '1.234\\times10^{-4}');
fmt('0.5=', '0.5');
fmt('100=', '100');
// inline-определение с выводом
num('w\\coloneq a+1=', 3.5);
// ошибки
errs('q=', /не определена/);
errs('1/0=', /ноль/);
errs('f=', /функция/);
errs('\\placeholder{}+1=', /пустое/);
num('\\frac14=', 0.25);
num('\\frac{1}{4}+\\frac34=', 1);
num('2^34=', 32);
// импорт: tex → parse
const st = E.parse('Q_{\\mathrm{МВт}}\\coloneq\\frac{Q_{\\mathrm{т}}}{1000}'); n++; if (E.stmtToTex(st).indexOf('Q_{\\mathrm{МВт}}') !== 0) { fails++; console.log('FAIL tex', E.stmtToTex(st)); }
console.log(`${n - fails}/${n} ok`); process.exit(fails ? 1 : 0);
