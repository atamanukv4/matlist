// Матлист — пересчёт листа в фоновом потоке (Web Worker). Интерфейс не зависает, пока считаются тяжёлые регионы
// (вложенные интегралы, длинные программы); «Стоп» просто завершает поток.
// Код потока собирается из текстов скриптов страницы: wsp_data, wsp, ядро, графики и этот файл.
// Протокол:
//   → { cmd: 'run', seq, origin, fmt, from, regions: [{ id, kind, latex, noeval, ys, xs, xmin, xmax, view, logx }] }
//   ← { seq, type: 'res', items: [{ id, res, err, role, tbl, stmt, delta }] }   — порциями, по мере счёта
//   ← { seq, type: 'series', id, key, data }                                    — точки графика
//   ← { seq, type: 'done' }
//   → { cmd: 'series', seq, plot }  — пересчитать точки графика (после прокрутки/масштаба) в окружении последнего прогона
(function () {
'use strict';
const E = self.MatEngine, MP = self.MatPlot;
let plotEnv = new Map(); // id графика → окружение, в котором он строится
function seriesMsg(seq, r) {
  try { const data = MP.seriesOf(r); return { seq, type: 'series', id: r.id, key: MP.seriesKey(r), data: data.map(s => ({ pts: s, quick: !!s.quick })) }; }
  catch (e) { return { seq, type: 'series', id: r.id, key: MP.seriesKey(r), err: e.message || String(e) }; }
}
function run(m) {
  const R = new E.SheetRunner(m.origin || 0); plotEnv = new Map();
  let buf = [], last = Date.now();
  const flush = () => { if (buf.length) { self.postMessage({ seq: m.seq, type: 'res', items: buf }); buf = []; } last = Date.now(); };
  m.regions.forEach((r, i) => {
    if (r.kind === 'plot') { plotEnv.set(r.id, R.env); if (i >= m.from) { r.env = R.env; flush(); self.postMessage(seriesMsg(m.seq, r)); } return; }
    if (r.kind !== 'math') return;
    const it = { id: r.id, res: null, err: null, role: null, tbl: false, stmt: null, delta: null };
    if (!r.latex || !r.latex.trim() || r.noeval) { if (i >= m.from) buf.push(it); return; }
    let st = null; const env0 = R.env;
    try {
      st = E.parse(r.latex); it.stmt = st.type;
      const out = R.step(st);
      if (out.given) it.role = 'given'; else if (out.constraint) it.role = 'cons';
      else if (st.sym && out.value instanceof E.Fn) it.res = E.toTex(st.rhs);
      else if (out.value !== undefined && out.value !== null) { const v = out.shown !== undefined ? out.shown : out.value; it.res = E.fmtValue(v, m.fmt, out.unitTex); it.tbl = v instanceof E.Rng; }
      it.delta = E.envDelta(env0, R.env);
    } catch (e) {
      if (st && st.sym && st.type === 'eval' && /не определена/.test(e.message || '')) it.res = E.toTex(st.expr);
      else it.err = e.message || String(e);
    }
    if (i >= m.from) { buf.push(it); if (Date.now() - last > 120) flush(); }
  });
  flush(); self.postMessage({ seq: m.seq, type: 'done' });
}
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.cmd === 'run') run(m);
  else if (m.cmd === 'series') { const r = m.plot; r.env = plotEnv.get(r.id) || new E.Env(); self.postMessage(seriesMsg(m.seq, r)); }
};
})();
