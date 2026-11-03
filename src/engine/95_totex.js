// ───────────────────────── Дерево → LaTeX (для импорта .xmcd) ─────────────────────────
function nameToTex(name) {
  if (/^Δ?°[CF]?$/.test(name)) return name.replace('Δ', '\\Delta ');
  // имя: base[_sub], base может содержать греческие буквы и '
  const us = name.indexOf('_');
  const base = us >= 0 ? name.slice(0, us) : name, sub = us >= 0 ? name.slice(us + 1) : null;
  const conv = s => { let o = ''; for (const ch of s) { o += GREEK_TO_TEX[ch] ? GREEK_TO_TEX[ch] + ' ' : (ch === "'" ? "'" : ch); } return o.trim(); };
  const isOne = [...base].length === 1 || GREEK_TO_TEX[base];
  let t = isOne ? conv(base) : (/^[A-Za-z]+$/.test(base.replace(/'/g, '')) ? '\\mathrm{' + base.replace(/'/g, '') + '}' + "'".repeat((base.match(/'/g) || []).length) : conv(base));
  if (sub === '') t += '_{\\,}'; else if (sub !== null) t += '_{\\mathrm{' + conv(sub) + '}}';
  return t;
}
const PREC = { or: 1, and: 2, cmp: 3, add: 4, mul: 5, neg: 6, pow: 7, atom: 9 };
function toTex(n) { return tex(n, 0); }
function tex(n, p) {
  const wrap = (s, q) => (q < p ? '\\left(' + s + '\\right)' : s);
  switch (n.type) {
    case 'num': { let s = String(n.v); if (/e/.test(s)) { const [m, e] = s.split('e'); s = m + '\\cdot10^{' + parseInt(e) + '}'; return wrap(s, PREC.mul); } return n.v < 0 ? wrap(s, PREC.neg) : s; }
    case 'str': return '\\text{"' + n.v + '"}';
    case 'imag': return String(n.v) + 'i';
    case 'id': return (n.unit || n.u) && /^[A-Za-zμÅΩ_]+$/.test(n.name) ? '\\mathrm{' + n.name.replace(/_/g, '\\_') + '}' : nameToTex(n.name);
    case 'paren': return '\\left(' + tex(n.e, 0) + '\\right)';
    case 'neg': return wrap('-' + tex(n.e, PREC.neg), PREC.neg);
    case 'un': return wrap('\\neg ' + tex(n.e, PREC.neg), PREC.neg);
    case 'bin': {
      const o = n.op;
      if (o === '/') return '\\frac{' + tex(n.l, 0) + '}{' + tex(n.r, 0) + '}';
      if (o === '+' || o === '-') return wrap(tex(n.l, PREC.add) + o + tex(n.r, PREC.add + 1), PREC.add);
      if (o === '·' && n.r.type === 'id' && /^Δ?°[CF]?$/.test(n.r.name)) return wrap(tex(n.l, PREC.mul) + '\\,' + n.r.name, PREC.mul);
      if (o === '·') return wrap(tex(n.l, PREC.mul) + '\\cdot ' + tex(n.r, PREC.mul + 1), PREC.mul);
      const cm = { '<': '<', '>': '>', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '==': '=' }[o];
      if (cm) return wrap(tex(n.l, PREC.cmp + 1) + cm + tex(n.r, PREC.cmp + 1), PREC.cmp);
      if (o === '∧') return wrap(tex(n.l, PREC.and) + '\\land ' + tex(n.r, PREC.and + 1), PREC.and);
      if (o === '∨') return wrap(tex(n.l, PREC.or) + '\\lor ' + tex(n.r, PREC.or + 1), PREC.or);
      return tex(n.l, 0) + o + tex(n.r, 0);
    }
    case 'pow': return wrap(tex(n.b, PREC.pow + 1) + '^{' + tex(n.e, 0) + '}', PREC.pow);
    case 'sqrt': return '\\sqrt{' + tex(n.e, 0) + '}';
    case 'root': return '\\sqrt[' + tex(n.n, 0) + ']{' + tex(n.e, 0) + '}';
    case 'abs': return '\\left|' + tex(n.e, 0) + '\\right|';
    case 'fact': return tex(n.e, PREC.atom) + '!';
    case 'transpose': return tex(n.e, PREC.atom) + '^{T}';
    case 'col': return tex(n.e, PREC.atom) + '^{\\langle ' + tex(n.j, 0) + '\\rangle}';
    case 'matrix': return '\\begin{bmatrix}' + n.rows.map(r => r.map(c => tex(c, 0)).join('&')).join('\\\\') + '\\end{bmatrix}';
    case 'sub': { const ixt = n.ix ? n.ix.map(x => tex(x, 0)).join(',') : n.raw; return tex(n.e, PREC.atom) + '_{' + (n.ix && /^\\mathrm/.test(ixt) ? '{' + ixt + '}' : ixt) + '}'; }
    case 'call': {
      const std = { sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1, ln: 1, log: 1, exp: 1, sinh: 1, cosh: 1, tanh: 1, max: 1, min: 1, arg: 1, det: 1 };
      const f = std[n.f] ? '\\' + n.f : nameToTex(n.f);
      return f + '\\left(' + n.args.map(a => tex(a, 0)).join(',') + '\\right)';
    }
    case 'range': return tex(n.a, 0) + (n.s ? ',' + tex(n.s, 0) : '') + '..' + tex(n.b, 0);
    case 'int': return '\\int_{' + tex(n.lo, 0) + '}^{' + tex(n.hi, 0) + '}' + tex(n.body, PREC.add) + '\\,\\mathrm{d}' + nameToTex(n.v);
    case 'deriv': return '\\frac{\\mathrm{d}' + (n.order > 1 ? '^{' + n.order + '}' : '') + '}{\\mathrm{d}' + nameToTex(n.v) + (n.order > 1 ? '^{' + n.order + '}' : '') + '}' + tex(n.e, PREC.mul);
    case 'sum': case 'prod': return '\\' + n.type + '_{' + nameToTex(n.v) + (n.from ? '=' + tex(n.from, 0) : '') + '}' + (n.to ? '^{' + tex(n.to, 0) + '}' : '') + tex(n.body, PREC.mul);
    case 'unsupported': return '\\text{' + n.what + '}';
    case 'system': return '\\begin{cases}' + n.eqs.map(e => tex(e, 0)).join('\\\\') + '\\end{cases}';
  }
  return '?';
}
function unitTexOf(u) { return u ? '\\left[' + tex(u, 0) + '\\right]' : ''; }
function stmtToTex(st) {
  if (st.type === 'define') return tex(st.lhs, 0) + (st.global ? '\\equiv ' : '\\coloneq ') + tex(st.rhs, 0) + (st.sym ? '\\to ' : st.show ? '=' + unitTexOf(st.unit) : '');
  if (st.type === 'eval') return tex(st.expr, 0) + (st.sym ? '\\to ' : '=' + unitTexOf(st.unit));
  if (st.type === 'expr') return tex(st.expr, 0);
  return '';
}

