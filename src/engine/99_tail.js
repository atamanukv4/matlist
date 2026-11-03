const api = { Sol, solveSystem, SheetRunner, SOLVE_FNS, parse, parseList, Parser, tokenize, Env, Ctx, execStatement, evalNode, fmtValue, fmtScalar, fmtReal, DEFAULT_FMT, toTex, stmtToTex, nameToTex,
  C, Mat, Rng, Fn, Str, MathErr, Q, UNITS, TEMP, TempScale, unitless, dimTex, inUnits, toNum, isNum, re, im, cabs, B, BUILTIN_NAMES, CONSTS, freeRanges, vecOf, asMat, integrate, brent, calcOrder, budget, budgetExpired, TimeoutErr, serVal, deserVal, envDelta };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatEngine = api;
})(typeof self !== 'undefined' ? self : this);
