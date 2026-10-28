// Решатели: Given/Find, Minerr, Minimize/Maximize, Odesolve — сверка с аналитическими ответами.
const E = require('../src/engine.js');
let fails = 0, n = 0;
function sheet(lines) { const R = new E.SheetRunner(0); let last; for (const l of lines) { last = R.step(E.parse(l)); } return { last, R }; }
function near(name, got, want, tol = 1e-6) {
  n++; const g = Array.isArray(want) ? E.vecOf(got).map(x => E.toNum(x)) : [E.toNum(got)]; const w = Array.isArray(want) ? want : [want];
  const ok = g.length === w.length && g.every((v, i) => Math.abs(v - w[i]) <= tol * Math.max(1, Math.abs(w[i])));
  if (!ok) { fails++; console.log('FAIL', name, g, 'ожидалось', w); }
}
function throws(name, lines, re) { n++; try { sheet(lines); fails++; console.log('NOERR', name); } catch (e) { if (re && !re.test(e.message)) { fails++; console.log('WRONGERR', name, e.message); } } }
function run(name, fn) { try { fn(); } catch (e) { n++; fails++; console.log('ERR ', name, e.message); } }

run('Find: окружность и прямая', () => {
  const { last } = sheet(['x\\coloneq1', 'y\\coloneq1', 'Given', 'x^2+y^2=25', 'y=x+1', '\\operatorname{Find}\\left(x,y\\right)=']);
  near('Find 2×2', last.value, [3, 4]);
});
run('Find: одна неизвестная', () => {
  const { last } = sheet(['x\\coloneq1', '\\mathrm{Given}', '\\cos\\left(x\\right)=x', 's\\coloneq\\operatorname{Find}\\left(x\\right)=']);
  near('Find cos x = x', last.value, 0.7390851332151607, 1e-9);
});
run('Find с неравенством выбирает отрицательный корень', () => {
  const { last } = sheet(['x\\coloneq-1', 'Given', 'x^2=4', 'x<0', '\\operatorname{Find}(x)=']);
  near('Find x<0', last.value, -2);
});
run('Find: тепловой баланс (как в курсовой)', () => {
  // G·(h1 − h2) = Q, Q известна; найти G
  const { last } = sheet(['h_{\\mathrm{1}}\\coloneq3400', 'h_{\\mathrm{2}}\\coloneq2600', 'Q\\coloneq1.2\\cdot10^{5}', 'G\\coloneq100', 'Given', 'G\\cdot\\left(h_{\\mathrm{1}}-h_{\\mathrm{2}}\\right)=Q', '\\operatorname{Find}\\left(G\\right)=']);
  near('Find G', last.value, 150);
});
throws('Find без решения', ['x\\coloneq1', 'Given', 'x^2=-4', '\\operatorname{Find}(x)='], /не найдено/);
throws('Find без приближения', ['Given', 'q=2', '\\operatorname{Find}(q)='], /приближение/);
throws('Find без Given', ['x\\coloneq1', '\\operatorname{Find}(x)='], /Given/);
run('Minerr без решения даёт лучшее приближение', () => {
  const { last } = sheet(['x\\coloneq1', 'Given', 'x^2=-4', '\\operatorname{Minerr}(x)=']);
  near('Minerr', last.value, 0, 1e-3);
});
run('Minimize без ограничений', () => {
  const { last } = sheet(['f(x,y)\\coloneq(x-1)^2+(y+2)^2+3', 'x\\coloneq0', 'y\\coloneq0', '\\operatorname{Minimize}\\left(f,x,y\\right)=']);
  near('Minimize', last.value, [1, -2], 1e-5);
});
run('Maximize с ограничением', () => {
  const { last } = sheet(['g(x)\\coloneq x\\cdot(10-x)', 'x\\coloneq1', 'Given', 'x\\le3', '\\operatorname{Maximize}\\left(g,x\\right)=']);
  near('Maximize x≤3', last.value, 3, 1e-4);
});
run('Odesolve: y′ = −2y, y(0)=1', () => {
  const { R } = sheet(['Given', 'y^{\\prime}\\left(t\\right)=-2\\cdot y\\left(t\\right)', 'y\\left(0\\right)=1', 'y\\coloneq\\operatorname{Odesolve}\\left(t,3\\right)']);
  const v = E.execStatement(E.parse('y(1.5)='), R.env).value; near('exp(-3)', v, Math.exp(-3), 1e-8);
});
run('Odesolve: 2-й порядок, переходная характеристика', () => {
  // y'' + 2ζω y' + ω² y = ω², y(0)=0, y'(0)=0
  const { R } = sheet(['\\omega\\coloneq2', '\\zeta\\coloneq0.25', 'Given',
    "y''\\left(t\\right)+2\\cdot\\zeta\\cdot\\omega\\cdot y'\\left(t\\right)+\\omega^{2}\\cdot y\\left(t\\right)=\\omega^{2}",
    'y\\left(0\\right)=0', "y^{\\prime}\\left(0\\right)=0", 'y\\coloneq\\operatorname{Odesolve}\\left(t,15\\right)']);
  const z = 0.25, w = 2, wd = w * Math.sqrt(1 - z * z);
  const exact = t => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + z / Math.sqrt(1 - z * z) * Math.sin(wd * t));
  for (const t of [0.7, 2.3, 9]) near('y(' + t + ')', E.execStatement(E.parse('y(' + t + ')='), R.env).value, exact(t), 1e-7);
});
run('Odesolve: d/dt в записи и нелинейное уравнение', () => {
  const { R } = sheet(['Given', '\\frac{\\mathrm{d}}{\\mathrm{d}x}u\\left(x\\right)=u\\left(x\\right)^{2}', 'u(0)=0.5', 'u\\coloneq\\operatorname{Odesolve}\\left(x,1\\right)']);
  near('u(1)=1/(2−1)=1', E.execStatement(E.parse('u(1)='), R.env).value, 1, 1e-7);
});
throws('Odesolve: нет начального условия', ['Given', "y''(t)=-y(t)", 'y(0)=1', 'y\\coloneq\\operatorname{Odesolve}(t,1)'], /начальн/);
throws('Odesolve: точка вне интервала', ['Given', "y'(t)=1", 'y(0)=0', 'y\\coloneq\\operatorname{Odesolve}(t,1)', 'y(2)='], /вне интервала/);
run('после Find блок закрыт — следующее равенство не ограничение', () => {
  const { R } = sheet(['x\\coloneq1', 'Given', 'x=2', 'r\\coloneq\\operatorname{Find}(x)']);
  n++; if (R.given !== null) { fails++; console.log('FAIL блок не закрыт'); }
});
run('Система со скриншота: x³+z=y, xʸ+z=1, xˣ=11', () => {
  const { last } = sheet(['\\begin{cases}x^{3}+z=y\\\\x^{y}+z=1\\\\x^{x}=11\\end{cases}=']);
  const v = last.value; n++; if (!(v instanceof E.Sol) || v.names.join() !== 'x,y,z') { fails++; console.log('FAIL имена', v && v.names); return; }
  const [x, y, z] = v.vals; near('x³+z−y', x ** 3 + z - y, 0, 1e-9); near('xʸ+z−1', x ** y + z - 1, 0, 1e-9); near('xˣ', x ** x, 11, 1e-9);
});
run('Линейная система 3×3', () => {
  const { last } = sheet(['\\begin{cases}x+y+z=6\\\\2x-y+z=3\\\\x+2y-z=2\\end{cases}=']);
  near('решение', new E.Mat(3, 1, last.value.vals), [1, 2, 3]);
});
run('Система с выравниванием & и неравенством', () => {
  const { last } = sheet(['\\begin{cases}x^{2}&=9\\\\x&<0\\end{cases}=']);
  near('x<0', last.value.vals[0], -3);
});
run('Известные величины сверху подставляются', () => {
  const { last } = sheet(['k\\coloneq3', '\\begin{cases}k\\cdot u+v=7\\\\u-v=1\\end{cases}=']);
  near('u,v', new E.Mat(2, 1, last.value.vals), [2, 1]);
});
run('Присваивание [p; q] := система', () => {
  const { R } = sheet(['\\begin{bmatrix}p\\\\q\\end{bmatrix}\\coloneq\\begin{cases}p+q=10\\\\p-q=2\\end{cases}']);
  near('p·q', E.execStatement(E.parse('p\\cdot q='), R.env).value, 24);
});
run('Система внутри Given + Find', () => {
  const { last } = sheet(['x\\coloneq1', 'y\\coloneq1', 'Given', '\\begin{cases}x^2+y^2=25\\\\y=x+1\\end{cases}', '\\operatorname{Find}(x,y)=']);
  near('Find', last.value, [3, 4]);
});
throws('Система без решения', ['\\begin{cases}x^{2}=-1\\\\x=x\\end{cases}='], /не решена/);
throws('Все имена известны', ['a\\coloneq1', '\\begin{cases}a=1\\end{cases}='], /нет неизвестных/);
console.log(`${n - fails}/${n} ok`); process.exit(fails ? 1 : 0);
