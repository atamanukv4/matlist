const SOLVE_FNS = new Set(['Find', 'find', 'Minerr', 'minerr', 'Minimize', 'minimize', 'Maximize', 'maximize', 'Odesolve', 'odesolve']);
def('concat', a => new Str(a.map(x => x instanceof Str ? x.s : fmtPlain(x)).join('')));
def('strlen', a => (a[0] instanceof Str ? a[0].s.length : 0));
def('num2str', a => new Str(fmtPlain(a[0])));
def('str2num', a => { const v = parseFloat(String(a[0].s).replace(',', '.')); if (isNaN(v)) throw err('str2num: не число'); return v; });
def('error', a => { throw err(a[0] instanceof Str ? a[0].s : 'Ошибка'); });
def('time', () => Date.now() / 1000);
def('rnd', a => Math.random() * toNum(a[0]));
def('fact', a => factorial(toNum(a[0])));
function factorial(n) { if (n < 0 || !Number.isInteger(n)) return gammaFn(n + 1); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; }
function gammaFn(x) { // Ланцош
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  x -= 1; const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
def('Γ Gamma', a => gammaFn(toNum(a[0])));
def('erf', realFn(x => { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : -y; }));
def('erfc', a => 1 - B['erf'].fn(a));
def('pnorm', a => { const x = toNum(a[0]), m = toNum(a[1]), s = toNum(a[2]); return 0.5 * (1 + B['erf'].fn([(x - m) / (s * Math.SQRT2)])); });
def('dnorm', a => { const x = toNum(a[0]), m = toNum(a[1]), s = toNum(a[2]); return Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)); });

// Контекст вычисления
