// Матлист — интерфейс: лист с регионами и курсором-крестиком, шаблонная клавиатура, графики, импорт .xmcd.
(function () {
'use strict';
const E = window.MatEngine, X = window.MatXmcd, ML = window.MathLive, MP = window.MatPlot;
const $ = (s, el) => (el || document).querySelector(s);
const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const PT = 4 / 3; // 1 pt Mathcad = 4/3 px
const STORE = 'matlist.sheet.v1';

// ───────── состояние ─────────
const S = { name: 'Тестовый лист', regions: [], cursor: { x: 16, y: 16 }, fmt: Object.assign({}, E.DEFAULT_FMT), origin: 0, zoom: 1, nextId: 1, pageW: 380 };
let active = null;       // { r, el, mf } — редактируемый регион
let plotEdit = null;     // { r }
let targetMf = null;     // math-field, в который пишет клавиатура
let moveMode = null;     // регион, ждущий тапа «сюда»
let shift = false;

ML.MathfieldElement.soundsDirectory = null;
try { ML.MathfieldElement.keypressSound = null; ML.MathfieldElement.plonkSound = null; } catch (e) {}
if (window.MATLIST_FONTS !== undefined) ML.MathfieldElement.fontsDirectory = window.MATLIST_FONTS;

const tex2html = (t) => { try { return ML.convertLatexToMarkup(t, { mathstyle: 'textstyle' }); } catch (e) { return '<span>' + t + '</span>'; } };

// ───────── пересчёт листа ─────────
function sorted() { return S.regions.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)); }
function recompute() {
  const R = new E.SheetRunner(S.origin || 0);
  for (const r of sorted()) {
    if (r.kind === 'math') {
      r.res = null; r.err = null; r.tbl = false; r.role = null; r.before = { env: R.env, given: R.given ? R.given.slice() : null };
      if (!r.latex || !r.latex.trim()) continue;
      let st = null;
      try {
        st = E.parse(r.latex); r.stmt = st.type;
        const out = R.step(st);
        if (out.given) r.role = 'given'; else if (out.constraint) r.role = 'cons';
        else if (st.sym && out.value instanceof E.Fn) r.res = E.toTex(st.rhs); // f(x) := … → — показываем выражение
        else if (out.value !== undefined && out.value !== null) { r.res = E.fmtValue(out.value, S.fmt); r.tbl = out.value instanceof E.Rng; }
      } catch (e) {
        // «→» над неопределёнными именами: как символьный вывод Mathcad — выражение остаётся как есть
        if (st && st.sym && st.type === 'eval' && /не определена/.test(e.message || '')) r.res = E.toTex(st.expr);
        else r.err = e.message || String(e);
      }
    } else if (r.kind === 'plot') { r.env = R.env; }
  }
}

// ───────── отрисовка ─────────
const page = $('#page'), wrap = $('#sheetwrap');
function render() {
  page.innerHTML = '';
  let maxX = 0, maxY = 0;
  for (const r of S.regions) {
    const el = regionEl(r); page.appendChild(el);
    const wide = r.kind === 'plot' || r.kind === 'image'; maxX = Math.max(maxX, r.x + (wide ? r.w + 20 : 200)); maxY = Math.max(maxY, r.y + (wide ? r.h + 60 : 60));
  }
  const cr = h('div', 'cross'); cr.style.left = S.cursor.x + 'px'; cr.style.top = S.cursor.y + 'px'; page.appendChild(cr);
  page.style.width = Math.max(S.pageW, maxX + 40) + 'px';
  page.style.height = Math.max(wrap.clientHeight / S.zoom - 24, maxY + 400, S.cursor.y + 300) + 'px';
  page._minH = maxY + 400;
  page.style.zoom = S.zoom;
  if (active) { const el = page.querySelector('[data-id="' + active.r.id + '"]'); if (el) attachEditor(el, active.r); }
  if (plotEdit) markSel(plotEdit.r);
  save();
}
function markSel(r) { const el = page.querySelector('[data-id="' + r.id + '"]'); if (el) el.classList.add('sel'); }
function regionEl(r) {
  const el = h('div', 'rg ' + r.kind); el.dataset.id = r.id; el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
  if (r.hl) { el.style.background = r.hl; el.classList.add('hl'); }
  if (r.kind === 'math') {
    if (r.err) el.classList.add('err');
    if (r.role) el.classList.add(r.role);
    const eq = h('span', 'eq'); eq.innerHTML = tex2html(r.latex || '\\placeholder{}'); el.appendChild(eq);
    if (r.res) { const rs = h('span', 'res' + (r.tbl ? ' tbl' : '')); rs.innerHTML = tex2html(r.res); el.appendChild(rs); }
    if (r.err) {
      if (r.stored != null && /=\s*$/.test(r.latex)) { const rs = h('span', 'res'); rs.style.color = 'var(--stored)'; rs.innerHTML = tex2html(E.fmtValue(r.stored, S.fmt)); el.appendChild(rs); const m = h('span', 'smsg', 'значение из файла · ' + r.err); el.appendChild(m); }
      else { const m = h('span', 'emsg', r.err); el.appendChild(m); }
    }
  } else if (r.kind === 'text') {
    el.textContent = r.text; if (r.bold) el.classList.add('bold');
    if (r.wpt) { el.style.width = Math.round(r.wpt * PT) + 'px'; el.style.maxWidth = 'none'; }
    if (r.fpt) el.style.fontSize = Math.round(r.fpt * PT) + 'px';
  } else if (r.kind === 'note') {
    el.textContent = r.text;
  } else if (r.kind === 'plot') {
    const cv = h('canvas'); el.appendChild(cv); const lab = h('div', 'pl'); el.appendChild(lab);
    paintPlot(cv, r, lab);
  } else if (r.kind === 'image') {
    const im = h('img'); im.src = r.src; im.alt = 'рисунок'; im.style.width = r.w + 'px'; im.style.height = r.h + 'px'; im.draggable = false; el.appendChild(im);
  }
  return el;
}

// ───────── графики (рисование — в plot.js) ─────────
function sizeCanvas(cv, w, h) { const dpr = window.devicePixelRatio || 1; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; return dpr; }
function paintPlot(cv, r, lab, extra) {
  const dpr = sizeCanvas(cv, r.w, r.h);
  try { MP.draw(cv, r, Object.assign({ dpr, onImg: () => paintPlot(cv, r, lab, extra) }, extra || {})); if (lab) { lab.textContent = ''; lab.style.color = ''; } }
  catch (e) { const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, r.w, r.h); g.strokeStyle = '#d0d5dd'; g.strokeRect(0.5, 0.5, r.w - 1, r.h - 1); if (lab) { lab.textContent = e.message; lab.style.color = 'var(--err)'; } }
}

// ───────── редактор формулы ─────────
function newMf(latex) {
  const mf = new ML.MathfieldElement();
  mf.mathVirtualKeyboardPolicy = 'manual'; mf.smartFence = true; mf.smartSuperscript = false;
  try { mf.menuItems = []; } catch (e) {}
  try { mf.inlineShortcuts = Object.assign({}, mf.inlineShortcuts, { ':': '\\coloneq' }); } catch (e) {}
  mf.value = latex || '';
  mf.addEventListener('focusin', () => { targetMf = mf; noNativeKbd(mf); });
  mf.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(true); } });
  mf.addEventListener('input', () => { if (active && active.mf === mf) { active.r.latex = mf.getValue('latex'); livePreview(); } });
  return mf;
}
let nativeKbd = false;
function noNativeKbd(mf) {
  const ta = mf.shadowRoot && mf.shadowRoot.querySelector('textarea');
  if (ta) ta.setAttribute('inputmode', nativeKbd ? 'text' : 'none');
}
function attachEditor(el, r) {
  el.innerHTML = ''; el.classList.add('sel', 'editing'); el.classList.remove('err');
  const mf = newMf(r.latex); el.appendChild(mf);
  const live = h('span', 'live'); el.appendChild(live);
  active.mf = mf; active.el = el; active.live = live; targetMf = mf;
  const tap = active.tap; active.tap = null;
  requestAnimationFrame(() => {
    mf.focus(); noNativeKbd(mf);
    // курсор — туда, куда коснулись; иначе в конец формулы
    if (mf._typed) { livePreview(true); return; } // ввод уже начался (первая клавиша создала регион) — курсор не трогать
    let pos = -1;
    if (tap) { try { pos = mf.getOffsetFromPoint(tap.x, tap.y); } catch (e) { pos = -1; } }
    try { mf.position = pos >= 0 ? pos : mf.lastOffset; } catch (e) { mf.executeCommand('moveToMathfieldEnd'); }
    livePreview(true);
  });
  showBar(el, r);
}
// результат во время набора — считается в окружении, которое было перед этим регионом
let liveT;
function livePreview(now) {
  clearTimeout(liveT);
  liveT = setTimeout(() => {
    if (!active || !active.live) return;
    const r = active.r, live = active.live, latex = active.mf.getValue('latex').trim();
    live.className = 'live'; live.innerHTML = '';
    if (!latex) return;
    try {
      const st = E.parse(latex); const preview = st.type === 'define' && !st.show && st.lhs.type !== 'call';
      if (preview) st.show = true;
      const b = r.before || { env: new E.Env(), given: null };
      if (b.given && st.type === 'expr') return; // ограничение блока Given — без вывода
      const out = E.execStatement(st, b.env, { given: b.given });
      if (out.value !== undefined && out.value !== null) { live.classList.add('ok'); live.innerHTML = tex2html((preview ? '=' : '') + E.fmtValue(out.value, S.fmt)); }
    } catch (e) { if (!/Пустое место|не закончена|Заполните/.test(e.message)) { live.classList.add('bad'); live.textContent = e.message; } }
  }, now ? 0 : 180);
}
function activate(r, tap) {
  if (active && active.r === r) return;
  commit(false);
  closePlot();
  if (r.kind === 'math') { setKbd(true); active = { r, tap }; S.cursor = { x: r.x, y: r.y }; render(); }
  else if (r.kind === 'text') editText(r, tap);
  else if (r.kind === 'plot') openPlot(r);
  else if (r.kind === 'note' || r.kind === 'image') { const el = page.querySelector('[data-id="' + r.id + '"]'); el.classList.add('sel'); showBar(el, r); }
}
function commit(moveDown) {
  hideBar();
  if (!active) return;
  const r = active.r; const mf = active.mf;
  if (mf) r.latex = mf.getValue('latex').trim();
  active = null; targetMf = null;
  if (!r.latex) S.regions = S.regions.filter(x => x !== r);
  else if (moveDown) { const el = page.querySelector('[data-id="' + r.id + '"]'); const hgt = el ? el.offsetHeight : 24; S.cursor = { x: r.x, y: r.y + hgt + 14 }; }
  recompute(); render();
}
function createAt(kind, extra) {
  const r = Object.assign({ id: S.nextId++, kind, x: S.cursor.x, y: S.cursor.y }, extra || {});
  S.regions.push(r); return r;
}
function ensureTarget() {
  if (targetMf && document.body.contains(targetMf)) return targetMf;
  if (plotEdit) { targetMf = $('#py'); return targetMf; }
  commit(false); setKbd(true);
  const r = createAt('math', { latex: '' }); active = { r }; render();
  return active.mf;
}

// ───────── текст ─────────
let textEl = null; // текстовый регион в режиме правки (системная клавиатура)
function editText(r, tap) {
  const el = page.querySelector('[data-id="' + r.id + '"]'); if (!el) return;
  el.contentEditable = 'true'; el.setAttribute('inputmode', 'text'); el.spellcheck = true;
  el.classList.add('sel'); $('#kbd').classList.add('hide'); document.body.classList.add('texting');
  textEl = el;
  el.focus();
  const sel = window.getSelection(); let placed = false;
  if (tap && document.caretRangeFromPoint) { const rg = document.caretRangeFromPoint(tap.x, tap.y); if (rg && el.contains(rg.startContainer)) { sel.removeAllRanges(); sel.addRange(rg); placed = true; } }
  if (!placed) { sel.selectAllChildren(el); sel.collapseToEnd(); }
  showBar(el, r);
  el.addEventListener('blur', () => {
    r.text = el.innerText.replace(/\n$/, ''); el.contentEditable = 'false'; $('#kbd').classList.remove('hide'); document.body.classList.remove('texting');
    textEl = null;
    if (!r.text.trim()) S.regions = S.regions.filter(x => x !== r);
    setTimeout(() => { hideBar(); render(); }, 0);
  }, { once: true });
}

// ───────── панель региона ─────────
const bar = $('#rbar');
function showBar(el, r) {
  bar.innerHTML = ''; bar.style.display = 'flex';
  const b = (t, cls, fn) => { const x = h('button', cls, t); x.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); fn(); }); bar.appendChild(x); };
  b('Переместить', '', () => { moveMode = r; hideBar(); if (active) commitKeep(); toast('Коснитесь места на листе, куда перенести'); });
  b('Копия', '', () => { if (active) commitKeep(); const c = JSON.parse(JSON.stringify(cleanRegion(r))); c.id = S.nextId++; c.y = r.y + (el.offsetHeight || 24) + 12; S.regions.push(c); recompute(); render(); });
  b('Копир.', '', () => { if (active) commitKeep(); clip = JSON.parse(JSON.stringify(cleanRegion(r))); hideBar(); render(); toast('Скопировано. Удерживайте палец на пустом месте → «Вставить»'); });
  if (r.kind !== 'plot') b('Цвет', '', () => { if (active) commitKeep(); palette(r); });
  if (r.kind === 'image') {
    b('−', '', () => { r.w = Math.max(40, Math.round(r.w / 1.2)); r.h = Math.max(30, Math.round(r.h / 1.2)); render(); const e2 = page.querySelector('[data-id="' + r.id + '"]'); if (e2) { e2.classList.add('sel'); showBar(e2, r); } });
    b('+', '', () => { r.w = Math.round(r.w * 1.2); r.h = Math.round(r.h * 1.2); render(); const e2 = page.querySelector('[data-id="' + r.id + '"]'); if (e2) { e2.classList.add('sel'); showBar(e2, r); } });
  }
  if (r.kind === 'plot') b('⤢', '', () => { applyPlot(); openFull(r); });
  b('Удалить', 'del', () => { S.regions = S.regions.filter(x => x !== r); active = null; targetMf = null; closePlot(); hideBar(); recompute(); render(); });
  bar.classList.remove('pal');
  placeBar(el.getBoundingClientRect());
}
// подсветка региона (как Format → Highlight Region в Mathcad)
const HL = [null, '#fff59d', '#c8f0c4', '#bfe3ff', '#ffd0e0', '#ffe0b2', '#e4d4f7', '#e0e0e0'];
function palette(r) {
  render(); const el = page.querySelector('[data-id="' + r.id + '"]'); if (!el) return;
  el.classList.add('sel'); bar.innerHTML = ''; bar.style.display = 'flex'; bar.classList.add('pal');
  for (const c of HL) {
    const x = h('button', 'sw' + (c === (r.hl || null) ? ' on' : '')); x.title = c ? 'подсветить' : 'без подсветки';
    if (c) x.style.background = c; else x.textContent = '✕';
    x.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); if (c) r.hl = c; else delete r.hl; bar.classList.remove('pal'); hideBar(); render(); });
    bar.appendChild(x);
  }
  placeBar(el.getBoundingClientRect());
}
function placeBar(er) {
  const wr = wrap.getBoundingClientRect();
  bar.style.left = Math.max(4, Math.min(er.left - wr.left, wr.width - Math.max(250, bar.offsetWidth) - 4)) + 'px';
  let top = er.top - wr.top - 40; if (top < 4) top = er.bottom - wr.top + 6;
  bar.style.left = (parseFloat(bar.style.left) + wrap.scrollLeft) + 'px'; bar.style.top = (top + wrap.scrollTop) + 'px';
}
function commitKeep() { if (!active) return; const r = active.r; if (active.mf) r.latex = active.mf.getValue('latex').trim(); active = null; targetMf = null; recompute(); }
function hideBar() { bar.style.display = 'none'; bar.classList.remove('pal'); }
let clip = null; // скопированный регион

// ───────── редактор графика ─────────
const pp = $('#plotpanel');
let ptab = 'data', liveCv = null;
function plotEl(r) { return page.querySelector('[data-id="' + r.id + '"]'); }
function redrawPlotRegion(r) { // быстрая перерисовка только холста (жесты, правки панели)
  const el = plotEl(r); if (!el) return; const cv = el.querySelector('canvas'); const lab = el.querySelector('.pl');
  paintPlot(cv, r, lab, r._trace ? { trace: r._trace } : null);
}
function setPtab(t) {
  ptab = t; pp.querySelectorAll('.ptabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  pp.querySelectorAll('.pt').forEach(d => d.classList.toggle('on', d.dataset.t === t));
  $('#kbd').classList.toggle('hide', t !== 'data');
  if (t === 'legend') buildSeriesRows();
  if (t === 'bg') fillBg();
}
function openPlot(r) {
  commit(false); plotEdit = { r }; setKbd(true);
  pp.classList.add('on'); render(); markSel(r);
  const py = $('#py'), px = $('#px'); py.value = r.ys || ''; px.value = r.xs || '';
  const v = x => (x === undefined || x === null || !isFinite(x)) ? '' : x;
  $('#pxmin').value = v(r.xmin); $('#pxmax').value = v(r.xmax); $('#pymin').value = v(r.ymin); $('#pymax').value = v(r.ymax);
  $('#plogx').value = r.logx ? '1' : ''; $('#plogy').value = r.logy ? '1' : '';
  $('#pxl').value = r.xlabel != null ? r.xlabel : ''; $('#pyl').value = r.ylabel != null ? r.ylabel : '';
  $('#pxl').placeholder = MP.texPlain(r.xs) || 'авто'; $('#pyl').placeholder = MP.axisTitle(Object.assign({}, r, { ylabel: undefined }), 'y') || 'авто';
  $('#pfx').value = (r.fx && r.fx.mode) || 'auto'; $('#pfy').value = (r.fy && r.fy.mode) || 'auto';
  $('#pdx').value = (r.fx && r.fx.d != null) ? r.fx.d : 2; $('#pdy').value = (r.fy && r.fy.d != null) ? r.fy.d : 2;
  $('#pgrid').checked = r.grid !== false; $('#pw').value = r.w; $('#ph').value = r.h;
  $('#pleg').value = r.legend === true ? '1' : r.legend === false ? '0' : ''; $('#plegpos').value = r.legendPos || '';
  $('#pBgFit').checked = false;
  setPtab('data'); armPlot(r);
  setTimeout(() => { py.focus(); targetMf = py; noNativeKbd(py); }, 30);
  const el = plotEl(r); if (el) showBar(el, r);
}
function applyPlot() {
  if (!plotEdit) return; const r = plotEdit.r;
  r.ys = $('#py').getValue('latex').trim(); r.xs = $('#px').getValue('latex').trim();
  const nv = id => { const v = $(id).value.trim().replace(',', '.'); return v === '' ? undefined : parseFloat(v); };
  const nx = [nv('#pxmin'), nv('#pxmax'), nv('#pymin'), nv('#pymax')];
  if (nx[0] !== r.xmin || nx[1] !== r.xmax || nx[2] !== r.ymin || nx[3] !== r.ymax) r.view = null; // ручные пределы важнее сдвига пальцем
  [r.xmin, r.xmax, r.ymin, r.ymax] = nx;
  r.logx = $('#plogx').value === '1'; r.logy = $('#plogy').value === '1';
  r.xlabel = $('#pxl').value === '' ? undefined : $('#pxl').value; r.ylabel = $('#pyl').value === '' ? undefined : $('#pyl').value;
  r.fx = { mode: $('#pfx').value, d: parseInt($('#pdx').value) || 0 }; r.fy = { mode: $('#pfy').value, d: parseInt($('#pdy').value) || 0 };
  r.grid = $('#pgrid').checked;
  const w = parseInt($('#pw').value), hh = parseInt($('#ph').value); if (w >= 160 && w <= 1200) r.w = w; if (hh >= 120 && hh <= 1000) r.h = hh;
  r.legend = $('#pleg').value === '1' ? true : $('#pleg').value === '0' ? false : undefined; r.legendPos = $('#plegpos').value || undefined;
}
function closePlot() { if (!plotEdit) return; applyPlot(); plotEdit = null; liveCv = null; pp.classList.remove('on'); $('#kbd').classList.remove('hide'); targetMf = null; hideBar(); recompute(); render(); }
pp.querySelectorAll('.ptabs [data-t]').forEach(b => b.addEventListener('click', () => setPtab(b.dataset.t)));
$('#pDone').addEventListener('click', () => closePlot());
$('#pFull').addEventListener('click', () => { if (plotEdit) { applyPlot(); openFull(plotEdit.r); } });
for (const id of ['#py', '#px']) {
  const mf = $(id); mf.mathVirtualKeyboardPolicy = 'manual'; mf.smartFence = true; try { mf.menuItems = []; } catch (e) {}
  mf.addEventListener('focusin', () => { targetMf = mf; noNativeKbd(mf); document.querySelectorAll('.plotpanel math-field').forEach(m => m.classList.toggle('act', m === mf)); });
  mf.addEventListener('input', () => { if (plotEdit) { applyPlot(); recompute(); refreshPlot(); } });
}
function refreshPlot() { // перерисовать редактируемый график, сохранив выделение и жесты
  const r = plotEdit.r; const el = plotEl(r); if (!el) return; const n = regionEl(r); n.classList.add('sel'); el.replaceWith(n); armPlot(r);
}
['#pxl', '#pyl', '#pxmin', '#pxmax', '#pymin', '#pymax', '#plogx', '#plogy', '#pfx', '#pfy', '#pdx', '#pdy', '#pgrid', '#pw', '#ph', '#pleg', '#plegpos'].forEach(id => {
  const el = $(id); const ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
  el.addEventListener(ev, () => { if (!plotEdit) return; applyPlot(); if (id === '#pw' || id === '#ph') { render(); markSel(plotEdit.r); armPlot(plotEdit.r); } else refreshPlot(); save(); });
});
$('#pReset').addEventListener('click', () => { if (!plotEdit) return; plotEdit.r.view = null; refreshPlot(); save(); });
// легенда: имя, цвет, толщина, стиль каждой кривой
function buildSeriesRows() {
  const r = plotEdit && plotEdit.r; const box = $('#pseries'); box.innerHTML = ''; if (!r) return;
  const n = MP.splitTop(r.ys || '').length; const names = MP.defaultNames(r); r.st = r.st || [];
  if (!n) { box.appendChild(h('p', 'hint', 'Сначала задайте кривые во вкладке «Данные».')); return; }
  for (let k = 0; k < n; k++) {
    const st = r.st[k] = r.st[k] || {}; const row = h('div', 'srow');
    const col = h('input'); col.type = 'color'; col.value = st.color || MP.COLORS[k % MP.COLORS.length];
    const nm = h('input'); nm.type = 'text'; nm.placeholder = names[k] || ('ряд ' + (k + 1)); nm.value = st.name || '';
    const wd = h('select'); [['1', '1 пт'], ['1.8', '2 пт'], ['3', '3 пт']].forEach(([v, t]) => { const o = h('option', '', t); o.value = v; wd.appendChild(o); }); wd.value = String(st.width || 1.8);
    const ds = h('select'); [['solid', 'сплошная'], ['dash', 'штрих'], ['dot', 'точки'], ['points', 'маркеры']].forEach(([v, t]) => { const o = h('option', '', t); o.value = v; ds.appendChild(o); }); ds.value = st.dash || 'solid';
    const upd = () => { st.color = col.value; st.name = nm.value || undefined; st.width = parseFloat(wd.value); st.dash = ds.value; refreshPlot(); save(); };
    col.addEventListener('input', upd); nm.addEventListener('input', upd); wd.addEventListener('change', upd); ds.addEventListener('change', upd);
    row.append(col, nm, wd, ds); box.appendChild(row);
  }
}
// подложка-картинка
function fillBg() {
  const r = plotEdit && plotEdit.r; if (!r) return; const b = r.bg || {};
  const v = x => (x === undefined || !isFinite(x)) ? '' : +(+x).toPrecision(6);
  $('#pbx0').value = v(b.x0); $('#pbx1').value = v(b.x1); $('#pby0').value = v(b.y0); $('#pby1').value = v(b.y1); $('#pBgOp').value = b.op != null ? b.op : 0.85;
}
function curAxes(r) { const cv = plotEl(r) && plotEl(r).querySelector('canvas'); const g = cv && cv._geo; if (!g) return null; const f = (v, log) => log ? Math.pow(10, v) : v; return { x0: f(g.x0, r.logx), x1: f(g.x1, r.logx), y0: f(g.y0, r.logy), y1: f(g.y1, r.logy) }; }
['#pbx0', '#pbx1', '#pby0', '#pby1'].forEach(id => $(id).addEventListener('input', () => {
  const r = plotEdit && plotEdit.r; if (!r || !r.bg) return; const v = parseFloat($(id).value.replace(',', '.')); if (!isFinite(v)) return;
  r.bg[{ '#pbx0': 'x0', '#pbx1': 'x1', '#pby0': 'y0', '#pby1': 'y1' }[id]] = v; redrawPlotRegion(r); save();
}));
$('#pBgOp').addEventListener('input', () => { const r = plotEdit && plotEdit.r; if (!r || !r.bg) return; r.bg.op = parseFloat($('#pBgOp').value); redrawPlotRegion(r); save(); });
$('#pBgDel').addEventListener('click', () => { const r = plotEdit && plotEdit.r; if (!r) return; r.bg = null; fillBg(); redrawPlotRegion(r); save(); });
$('#pBgAxes').addEventListener('click', () => { const r = plotEdit && plotEdit.r; if (!r || !r.bg) return; const a = curAxes(r); if (a) Object.assign(r.bg, a); fillBg(); redrawPlotRegion(r); save(); });
let imgTarget = null; // 'region' | 'bg'
$('#pBgPick').addEventListener('click', () => { imgTarget = 'bg'; $('#imgfile').click(); });
// жесты на холсте редактируемого графика
function armPlot(r) {
  const el = plotEl(r); if (!el) return; const cv = el.querySelector('canvas'); if (!cv) return;
  cv.classList.add('live'); liveCv = cv;
  MP.attachGestures(cv, r, kind => { redrawPlotRegion(r); if (kind === 'end' || kind === 'reset') { save(); if (ptab === 'bg') fillBg(); } }, () => ($('#pBgFit').checked ? 'bg' : 'view'));
}
// полноэкранный просмотр графика
const full = $('#full');
function openFull(r) {
  full.classList.add('on'); $('#fullTitle').textContent = MP.axisTitle(r, 'y') || 'График';
  const cv = $('#fullcv'); const fresh = cv.cloneNode(false); cv.replaceWith(fresh);
  const paint = () => { const b = fresh.getBoundingClientRect(); const dpr = sizeCanvas(fresh, Math.round(b.width), Math.round(b.height)); fresh.style.width = ''; fresh.style.height = '';
    try { MP.draw(fresh, r, { dpr, w: Math.round(b.width), h: Math.round(b.height), trace: r._trace, onImg: paint }); } catch (e) { toast(e.message); } };
  requestAnimationFrame(paint);
  MP.attachGestures(fresh, r, kind => { paint(); if (kind === 'end' || kind === 'reset') save(); }, () => 'view');
  full._paint = paint; full._r = r;
}
$('#fullClose').addEventListener('click', () => { full.classList.remove('on'); const r = full._r; full._r = null; if (r) { if (plotEdit && plotEdit.r === r) refreshPlot(); else render(); } });
$('#fullFit').addEventListener('click', () => { if (full._r) { full._r.view = null; full._paint(); save(); } });
window.addEventListener('resize', () => { if (full.classList.contains('on') && full._paint) full._paint(); });

// ───────── картинки ─────────
function loadImageFile(file, maxSide) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = () => rej(new Error('Не удалось прочитать файл'));
    fr.onload = () => {
      const im = new Image(); im.onerror = () => rej(new Error('Это не картинка или формат не поддерживается'));
      im.onload = () => {
        const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight)); const w = Math.round(im.naturalWidth * k), hh = Math.round(im.naturalHeight * k);
        const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.drawImage(im, 0, 0, w, hh);
        const png = /png|gif|svg/.test(file.type); // схемы и диаграммы — PNG, фото — JPEG
        res({ src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w, h: hh });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
$('#imgfile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    if (imgTarget === 'bg' && plotEdit) {
      const im = await loadImageFile(f, 2000); const r = plotEdit.r; const a = curAxes(r) || { x0: 0, x1: 1, y0: 0, y1: 1 };
      r.bg = Object.assign({ src: im.src, op: 0.85 }, a); fillBg(); redrawPlotRegion(r); save();
      toast('Картинка подложена под оси. Задайте края в единицах осей или включите «подгонять пальцами».');
    } else {
      const im = await loadImageFile(f, 1600); const w = Math.min(340, im.w), hh = Math.round(im.h * w / im.w);
      commit(false); closePlot(); createAt('image', { src: im.src, w, h: hh }); S.cursor = { x: S.cursor.x, y: S.cursor.y + hh + 16 }; recompute(); render();
    }
  } catch (e) { toast(e.message); }
  imgTarget = null;
});
tool('#kImg', () => { imgTarget = 'region'; $('#imgfile').click(); });

// ───────── клавиатура ─────────
const T = (l, t, cls) => ({ l, t, cls }); // подпись, вставляемый LaTeX
const F = (name, std, cls) => ({ l: name, t: (std ? '\\' + name : '\\operatorname{' + name + '}') + '\\left(#0\\right)', cls: 'fn ' + (cls || '') });
const A = (l, a, cls) => ({ l, a, cls }); // действие
// функция WSP: подпись без префикса, аргументы — пустые места
const W = (name, n) => ({ l: name.replace(/^wsp/, '').replace(/^iap/, 'iap·').replace(/EXPANSIONPTPEFF/, 'EXP'), t: '\\operatorname{' + name + '}\\left(' + ['#0'].concat(Array(n - 1).fill('#?')).join(',') + '\\right)', cls: 'fn sm wsp' });
const TABS = {
  '123': [
    T('7', '7'), T('8', '8'), T('9', '9'), T('a/b', '\\frac{#0}{#?}', 'op'), T('(', '\\left(#0\\right)', 'op'), T('√', '\\sqrt{#0}', 'op'), T('x²', '#@^{2}', 'op'), T('xⁿ', '#@^{#?}', 'op'),
    T('4', '4'), T('5', '5'), T('6', '6'), T('×', '\\cdot ', 'op'), T(')', ')', 'op'), T('ⁿ√', '\\sqrt[#?]{#0}', 'op'), T('|x|', '\\left|#0\\right|', 'op'), T('x!', '!', 'op'),
    T('1', '1'), T('2', '2'), T('3', '3'), T('−', '-', 'op'), T('xᵢ', '#@_{#?}', 'op sm'), T('x.н', '#@_{\\mathrm{#?}}', 'op sm'), T(',', ','), T('m..n', '..', 'op sm'),
    T('0', '0'), T('.', '.'), T('π', '\\pi '), T('+', '+', 'op'), T('e', 'e'), T('i', 'i'), T('∞', '\\infty '), T('%', '\\%'),
  ],
  'f(x)': [
    F('sin', 1), F('cos', 1), F('tan', 1), F('cot', 1), F('asin'), F('acos'), F('atan'), F('atan2'),
    F('sinh', 1), F('cosh', 1), F('tanh', 1), F('ln', 1), F('log', 1), F('exp', 1), F('abs'), F('mod', 1),
    F('floor'), F('ceil'), F('round'), F('trunc'), F('Re', 1), F('Im', 1), F('arg', 1), { l: 'if', t: '\\operatorname{if}\\left(#0,#?,#?\\right)', cls: 'fn' },
    F('max', 1), F('min', 1), F('mean'), F('stdev'), { l: 'root', t: '\\operatorname{root}\\left(#0,#?\\right)', cls: 'fn' }, F('polyroots', 0, 'sm'), { l: 'lsolve', t: '\\operatorname{lsolve}\\left(#0,#?\\right)', cls: 'fn' }, { l: 'rkfixed', t: '\\operatorname{rkfixed}\\left(#0,#?,#?,#?,#?\\right)', cls: 'fn sm' },
  ],
  '∫Σ': [
    T('∫ₐᵇ', '\\int_{#?}^{#?}#0\\,\\mathrm{d}#?', 'op'), T('d/dx', '\\frac{\\mathrm{d}}{\\mathrm{d}#?}#0', 'op sm'), T('dⁿ/dxⁿ', '\\frac{\\mathrm{d}^{#?}}{\\mathrm{d}#?^{#?}}#0', 'op sm'), T('Σₖ₌ₐᵇ', '\\sum_{#?=#?}^{#?}#0', 'op sm'), T('Σᵢ', '\\sum_{#?}#0', 'op sm'), T('Πₖ₌ₐᵇ', '\\prod_{#?=#?}^{#?}#0', 'op sm'), T('Πᵢ', '\\prod_{#?}#0', 'op sm'), T('{ сист.', '\\begin{cases}#?\\\\#?\\end{cases}', 'op sm'),
    T('<', '<', 'op'), T('>', '>', 'op'), T('≤', '\\le ', 'op'), T('≥', '\\ge ', 'op'), T('≠', '\\ne ', 'op'), T('=ᵇ', '=', 'op sm'), T('∧', '\\land ', 'op'), T('∨', '\\lor ', 'op'),
    T('¬', '\\neg ', 'op'), T(':=', '\\coloneq ', 'op'), T('≡', '\\equiv ', 'op'), T('a..b', '..', 'op sm'), T('a,b..c', ',#?..#?', 'op sm'), A('→', 'arrowEval', 'op'), T('°', '\\degree ', 'op'), A('+ ур.', 'addRowAfter', 'op sm'),
    T('Given', '\\operatorname{Given}', 'fn sm'), T('Find', '\\operatorname{Find}\\left(#0\\right)', 'fn'), T('Minerr', '\\operatorname{Minerr}\\left(#0\\right)', 'fn sm'), T('Minimize', '\\operatorname{Minimize}\\left(#0,#?\\right)', 'fn sm'),
    T('Maximize', '\\operatorname{Maximize}\\left(#0,#?\\right)', 'fn sm'), T('Odesolve', '\\operatorname{Odesolve}\\left(#0,#?\\right)', 'fn sm'), T("y′", "'", 'op'), T('ORIGIN', '\\mathrm{ORIGIN}', 'fn sm'),
  ],
  '[ ]': [
    T('2×2', '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', 'op sm'), T('3×3', '\\begin{bmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{bmatrix}', 'op sm'), T('2×1', '\\begin{bmatrix}#?\\\\#?\\end{bmatrix}', 'op sm'), T('3×1', '\\begin{bmatrix}#?\\\\#?\\\\#?\\end{bmatrix}', 'op sm'), T('1×3', '\\begin{bmatrix}#?&#?&#?\\end{bmatrix}', 'op sm'), A('m×n…', 'matrix', 'op sm'), A('+стр', 'addRowAfter', 'op sm'), A('+стлб', 'addColumnAfter', 'op sm'),
    T('Mᵀ', '#@^{T}', 'op'), T('M⁻¹', '#@^{-1}', 'op'), T('|M|', '\\left|#0\\right|', 'op'), T('M⟨j⟩', '#@^{\\langle #?\\rangle}', 'op sm'), T('xᵢ', '#@_{#?}', 'op'), T('xᵢ,ⱼ', '#@_{#?,#?}', 'op sm'), A('−стр', 'removeRow', 'op sm'), A('−стлб', 'removeColumn', 'op sm'),
    F('length'), F('rows'), F('cols'), F('identity'), { l: 'augment', t: '\\operatorname{augment}\\left(#0,#?\\right)', cls: 'fn sm' }, { l: 'stack', t: '\\operatorname{stack}\\left(#0,#?\\right)', cls: 'fn' }, F('sort'), F('eigenvals', 0, 'sm'),
    { l: 'linterp', t: '\\operatorname{linterp}\\left(#0,#?,#?\\right)', cls: 'fn sm' }, F('cspline', 0, 'sm'), { l: 'interp', t: '\\operatorname{interp}\\left(#0,#?,#?,#?\\right)', cls: 'fn' }, F('reverse', 0, 'sm'), F('last'), F('tr'), F('rank'), F('diag'),
  ],
  'WSP': [
    W('wspHPT', 2), W('wspSPT', 2), W('wspVPT', 2), W('wspTPH', 2), W('wspTPS', 2), W('wspHPS', 2), W('wspSPH', 2), W('wspPHS', 2),
    W('wspTSP', 1), W('wspPST', 1), W('wspHSWT', 1), W('wspHSST', 1), W('wspSSWT', 1), W('wspSSST', 1), W('wspVSWT', 1), W('wspVSST', 1),
    W('wspXPH', 2), W('wspHPTX', 3), W('wspCPPT', 2), W('wspKPT', 2), W('wspDYNVISPT', 2), W('wspTHERMCONDPT', 2), W('wspHEXPANSIONPTPEFF', 4), W('wspTHS', 2),
    W('wspgHGST', 2), W('wspgSGST', 2), W('wspgCPGST', 2), W('wspgTGSH', 2), W('iapHPT', 2), W('iapTPH', 2), W('iapSPT', 2), { l: '"…"', t: '\\text{"#0"}', cls: 'op sm' },
  ],
  'αβ': 'α β γ δ ε ζ η θ ϑ λ μ ν ξ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Σ Φ Ψ Ω ′'.split(' '),
  'abc': 'q w e r t y u i o p a s d f g h j k l ⇧ z x c v b n m ′ ⌫ ⇧'.split(' '),
  'абв': 'й ц у к е н г ш щ з х ф ы в а п р о л д ж э я ч с м и т ь б ю ё ъ ⇧'.split(' '),
};
const GREEKTEX = { α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta', ϑ: '\\vartheta', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', φ: '\\varphi', χ: '\\chi', ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega' };
let curTab = '123';
function buildKeys() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  for (const t of Object.keys(TABS)) { const b = h('button', t === curTab ? 'on' : '', t); b.addEventListener('pointerdown', ev => { ev.preventDefault(); curTab = t; buildKeys(); }); tabs.appendChild(b); }
  const keys = $('#keys'); keys.innerHTML = ''; const list = TABS[curTab];
  const letters = typeof list[0] === 'string'; keys.className = 'keys' + (letters ? ' c10' : '');
  for (const k of list) {
    const key = letters ? letterKey(k) : k;
    const b = h('button', key.cls || ''); b.textContent = key.l;
    b.addEventListener('pointerdown', ev => { ev.preventDefault(); press(key); });
    keys.appendChild(b);
  }
}
function letterKey(ch) {
  if (ch === '⇧') return { l: shift ? '⇩' : '⇧', a: 'shift', cls: 'op' };
  if (ch === '⌫') return { l: '⌫', a: 'deleteBackward', cls: 'op' };
  if (ch === '′') return { l: '′', t: "'", cls: 'op' };
  const c = shift ? ch.toUpperCase() : ch;
  return { l: c, t: GREEKTEX[c] ? GREEKTEX[c] + ' ' : c };
}
function press(key) {
  if (key.a === 'shift') { shift = !shift; buildKeys(); return; }
  if (key.a === 'matrix') { askMatrix(); return; }
  if (key.a === 'arrowEval') { const mf = ensureTarget(); insert(mf, '\\to '); if (!plotEdit) commit(true); return; }
  const mf = ensureTarget(); if (!mf) return;
  if (key.a) { mf._typed = true; mf.executeCommand(key.a); if (active && active.mf === mf) { active.r.latex = mf.getValue('latex'); livePreview(); } return; }
  insert(mf, key.t);
}
function insert(mf, latex) {
  mf._typed = true; mf.focus();
  let t = latex;
  if (t.includes('#@')) { // «предыдущий атом»: x² и индексы работают с тем, что слева от курсора
    const v = mf.getValue('latex'); const empty = !v || mf.position === 0;
    t = t.replace('#@', empty ? '#?' : '');
    if (!empty) { mf.executeCommand(['insert', t, { format: 'latex', selectionMode: 'placeholder' }]); if (active && active.mf === mf) { active.r.latex = mf.getValue('latex'); livePreview(); } return; }
  }
  let pos0 = 0; try { pos0 = mf.position; } catch (e) {}
  mf.executeCommand(['insert', t, { format: 'latex', selectionMode: 'placeholder' }]);
  if (/\\begin\{/.test(t)) { // матрицы и системы: MathLive оставляет курсор за окружением — перейти в первое пустое место
    try { mf.position = pos0; mf.executeCommand('moveToNextPlaceholder'); } catch (e) {}
  }
  if (active && active.mf === mf) { active.r.latex = mf.getValue('latex'); livePreview(); }
}

// служебная строка
function tool(id, fn) { const b = $(id); b.addEventListener('pointerdown', ev => { ev.preventDefault(); fn(); }); }
const nav = (id, cmd) => tool(id, () => { const mf = targetMf; if (mf) { mf.focus(); mf.executeCommand(cmd); if (active && active.mf === mf) { active.r.latex = mf.getValue('latex'); livePreview(); } } });
nav('#kLeft', 'moveToPreviousChar'); nav('#kRight', 'moveToNextChar');
nav('#kUp', 'moveUp'); nav('#kDown', 'moveDown');
nav('#kHome', 'moveToMathfieldStart'); nav('#kEnd', 'moveToMathfieldEnd');
tool('#kUndo', () => { if (targetMf && document.body.contains(targetMf)) { targetMf.focus(); targetMf.executeCommand('undo'); if (active && active.mf === targetMf) { active.r.latex = targetMf.getValue('latex'); livePreview(); } } else sheetUndo(); });
tool('#kRedo', () => { if (targetMf && document.body.contains(targetMf)) { targetMf.focus(); targetMf.executeCommand('redo'); if (active && active.mf === targetMf) { active.r.latex = targetMf.getValue('latex'); livePreview(); } } else sheetRedo(); });
nav('#kSel', 'extendSelectionBackward');
nav('#kDel', 'deleteBackward');
tool('#kDef', () => { const mf = ensureTarget(); insert(mf, '\\coloneq '); });
tool('#kEq', () => {
  if (plotEdit) { if (targetMf) insert(targetMf, '='); return; }
  const mf = ensureTarget(); let atEnd = true;
  try { atEnd = mf.position >= mf.lastOffset; } catch (e) {}
  const inSystem = /\\begin\{cases\}/.test(mf.getValue('latex'));
  insert(mf, '=');
  if (atEnd || !inSystem) commit(true); // внутри системы «=» — знак уравнения, а не вычисление
});
tool('#kOk', () => { if (plotEdit) { closePlot(); return; } commit(true); });
tool('#kText', () => { commit(false); closePlot(); const r = createAt('text', { text: '' }); render(); editText(r); });
tool('#kPlot', () => { commit(false); closePlot(); const r = createAt('plot', { ys: '', xs: '', w: 300, h: 190 }); recompute(); openPlot(r); });

// ───────── касания листа: курсор, выбор, перенос, перетаскивание, масштаб щипком ─────────
function pagePos(ev) { const r = page.getBoundingClientRect(); return { x: (ev.clientX - r.left) / S.zoom, y: (ev.clientY - r.top) / S.zoom }; }
let pd = null, dragRaf = 0;
const HOLD = 420;
page.addEventListener('contextmenu', ev => ev.preventDefault()); // без системного меню и выделения текста при удержании
page.addEventListener('pointerdown', ev => {
  if (ev.target.closest('math-field') || ev.target.closest('[contenteditable=true]') || ev.target.closest('canvas.live')) return;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  if (pd && pd.drag) return;
  const rgEl = ev.target.closest('.rg'); const r = rgEl ? S.regions.find(x => x.id == rgEl.dataset.id) : null;
  pd = { x: ev.clientX, y: ev.clientY, cx: ev.clientX, cy: ev.clientY, r, el: rgEl, t: Date.now(), drag: false, pos: pagePos(ev) };
  pd.timer = setTimeout(() => {
    if (!pd || pd.moved || pinch) return;
    if (pd.r) startDrag(); else { const p = pd; pd = null; ctxMenu(p); }
  }, HOLD);
});
// перетаскивание региона: удержание → тянуть куда угодно, у краёв лист прокручивается сам
function startDrag() {
  const p = pd, r = p.r;
  if (active && active.r === r) commitKeep();
  hideBar(); p.drag = true; p.off = { x: p.pos.x - r.x, y: p.pos.y - r.y }; p.start = { x: r.x, y: r.y };
  p.el.classList.add('drag'); document.body.classList.add('dragging');
  if (navigator.vibrate) try { navigator.vibrate(18); } catch (e) {}
  const step = () => {
    if (!pd || !pd.drag) return;
    const wr = wrap.getBoundingClientRect(), edge = 64, max = 22;
    let vx = 0, vy = 0;
    if (pd.cy < wr.top + edge) vy = -max * Math.min(1, (wr.top + edge - pd.cy) / edge);
    else if (pd.cy > wr.bottom - edge) vy = max * Math.min(1, (pd.cy - wr.bottom + edge) / edge);
    if (pd.cx < wr.left + edge * 0.6) vx = -max * Math.min(1, (wr.left + edge * 0.6 - pd.cx) / (edge * 0.6));
    else if (pd.cx > wr.right - edge * 0.6) vx = max * Math.min(1, (pd.cx - wr.right + edge * 0.6) / (edge * 0.6));
    if (vy > 0) { const need = (pd.r.y + 300) * S.zoom; if (page.offsetHeight * S.zoom < need + wrap.clientHeight) page.style.height = (need / S.zoom + wrap.clientHeight / S.zoom) + 'px'; }
    if (vx > 0) { const needW = (pd.r.x + 400); if (page.offsetWidth < needW) page.style.width = needW + 'px'; }
    if (vx || vy) { wrap.scrollLeft += vx; wrap.scrollTop += vy; }
    dragTo(); dragRaf = requestAnimationFrame(step);
  };
  dragRaf = requestAnimationFrame(step);
}
function dragTo() {
  const pr = page.getBoundingClientRect();
  const x = (pd.cx - pr.left) / S.zoom - pd.off.x, y = (pd.cy - pr.top) / S.zoom - pd.off.y;
  pd.r.x = Math.max(0, Math.round(x)); pd.r.y = Math.max(0, Math.round(y));
  pd.el.style.left = pd.r.x + 'px'; pd.el.style.top = pd.r.y + 'px';
}
function endDrag() {
  const p = pd; pd = null; cancelAnimationFrame(dragRaf); document.body.classList.remove('dragging');
  p.el.classList.remove('drag');
  const moved = Math.hypot(p.r.x - p.start.x, p.r.y - p.start.y) > 4;
  if (!moved) { // удержание без движения — меню региона
    p.r.x = p.start.x; p.r.y = p.start.y; render();
    const el = page.querySelector('[data-id="' + p.r.id + '"]'); if (el) { el.classList.add('sel'); showBar(el, p.r); }
    return;
  }
  recompute(); render();
}
page.addEventListener('pointermove', ev => {
  if (!pd) return;
  pd.cx = ev.clientX; pd.cy = ev.clientY;
  if (pd.drag) { ev.preventDefault(); return; }
  if (Math.hypot(ev.clientX - pd.x, ev.clientY - pd.y) > 8) { clearTimeout(pd.timer); pd.moved = true; }
});
page.addEventListener('pointerup', ev => {
  if (!pd) return; clearTimeout(pd.timer);
  if (pd.drag) { pd.cx = ev.clientX; pd.cy = ev.clientY; endDrag(); return; }
  const p = pd; pd = null;
  if (p.moved || pinch) return;
  if (moveMode) { const pos = pagePos(ev); moveMode.x = Math.round(pos.x); moveMode.y = Math.round(pos.y); moveMode = null; recompute(); render(); return; }
  if (p.r) { activate(p.r, { x: ev.clientX, y: ev.clientY }); return; }
  commit(false); closePlot(); hideBar();
  S.cursor = { x: Math.round(p.pos.x), y: Math.round(p.pos.y) }; render();
});
page.addEventListener('pointercancel', () => { if (pd && pd.drag) return; if (pd) clearTimeout(pd.timer); pd = null; }); // при перетаскивании отмену от браузера не слушаем
wrap.addEventListener('touchmove', ev => { if (pd && pd.drag && ev.touches.length === 1) { ev.preventDefault(); pd.cx = ev.touches[0].clientX; pd.cy = ev.touches[0].clientY; } }, { passive: false });
wrap.addEventListener('touchend', ev => { if (pd && pd.drag && ev.touches.length === 0) { const t = ev.changedTouches[0]; if (t) { pd.cx = t.clientX; pd.cy = t.clientY; } endDrag(); } });
// меню при удержании пальца на пустом месте
function ctxMenu(p) {
  commit(false); closePlot();
  S.cursor = { x: Math.round(p.pos.x), y: Math.round(p.pos.y) }; render();
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
  bar.innerHTML = ''; bar.style.display = 'flex'; bar.classList.remove('pal');
  const b = (t, fn, cls) => { const x = h('button', cls || '', t); x.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); hideBar(); fn(); }); bar.appendChild(x); };
  b('Формула', () => { ensureTarget(); });
  b('Текст', () => { const r = createAt('text', { text: '' }); render(); editText(r); });
  b('График', () => { const r = createAt('plot', { ys: '', xs: '', w: 300, h: 190 }); recompute(); openPlot(r); });
  b('Рисунок', () => { imgTarget = 'region'; $('#imgfile').click(); });
  if (clip) b('Вставить', () => { const c = JSON.parse(JSON.stringify(clip)); c.id = S.nextId++; c.x = S.cursor.x; c.y = S.cursor.y; S.regions.push(c); recompute(); render(); });
  b('+ строка', () => shiftBelow(S.cursor.y, 40));
  b('− строка', () => { const y = S.cursor.y; if (S.regions.some(r => r.y >= y && r.y < y + 40)) { toast('В этой полосе есть регионы — сначала уберите их'); return; } shiftBelow(y, -40); });
  placeBar({ left: p.x, right: p.x, top: p.y, bottom: p.y + 4 });
}
function shiftBelow(y, dy) { for (const r of S.regions) if (r.y >= y) r.y = Math.max(0, r.y + dy); recompute(); render(); }
let pinch = null;
wrap.addEventListener('touchstart', ev => { if (ev.touches.length === 2) { const [a, b] = ev.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: S.zoom }; if (pd) { clearTimeout(pd.timer); pd = null; } } }, { passive: true });
wrap.addEventListener('touchmove', ev => { if (pinch && ev.touches.length === 2) { ev.preventDefault(); const [a, b] = ev.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); setZoom(pinch.z * d / pinch.d, true); } }, { passive: false });
wrap.addEventListener('touchend', ev => { if (pinch && ev.touches.length < 2) { setTimeout(() => { pinch = null; }, 50); render(); } });
function setKbd(on) { if (document.body.classList.contains('kbd-off') === !on) return; document.body.classList.toggle('kbd-off', !on); }
tool('#kHide', () => { commit(false); setKbd(false); });
$('#kShow').addEventListener('click', () => setKbd(true));
function setZoom(z, light) { S.zoom = Math.max(0.35, Math.min(2.5, z)); page.style.zoom = S.zoom; if (!light) render(); }
function fitZoom() { let maxX = S.pageW; for (const r of S.regions) maxX = Math.max(maxX, r.x + (r.kind === 'plot' ? r.w : 160)); setZoom((wrap.clientWidth - 24) / (maxX + 20)); }

// ───────── хранение ─────────
const TRANSIENT = ['env', 'before', 'envBefore', 'res', 'err', 'stmt', 'tbl', 'role', '_trace'];
function cleanRegion(r) { const c = Object.assign({}, r); for (const k of TRANSIENT) delete c[k]; return c; }
function snapRegions() { return JSON.stringify(S.regions.map(cleanRegion)); }
// библиотека листов: matlist.lib.v1 = { current, list: [{ id, name, updated }] }, лист — matlist.sheet.<id>
const LIB = 'matlist.lib.v1';
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
let lib = lsGet(LIB) || { current: null, list: [] };
let sheetId = null;
function newId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// история действий на листе (в пределах сеанса)
let undoStack = [], redoStack = [], lastSnap = null, restoring = false;
function save() {
  const snap = snapRegions();
  if (lastSnap !== null && snap !== lastSnap && !restoring) { undoStack.push(lastSnap); if (undoStack.length > 60) undoStack.shift(); redoStack = []; }
  lastSnap = snap;
  if (!sheetId) return;
  const okSave = lsSet('matlist.sheet.' + sheetId, { name: S.name, regions: JSON.parse(snap), cursor: S.cursor, fmt: S.fmt, origin: S.origin, zoom: S.zoom, nextId: S.nextId, pageW: S.pageW });
  if (!okSave && !save.warned) { save.warned = true; setTimeout(() => toast('Лист не помещается в память приложения — уменьшите или удалите крупные картинки'), 0); }
  const e = lib.list.find(x => x.id === sheetId); if (e) { e.name = S.name; e.updated = Date.now(); } else lib.list.unshift({ id: sheetId, name: S.name, updated: Date.now() });
  lib.current = sheetId; lsSet(LIB, lib);
}
function restoreSnap(snap) { restoring = true; S.regions = JSON.parse(snap); active = null; plotEdit = null; targetMf = null; pp.classList.remove('on'); hideBar(); lastSnap = snap; recompute(); render(); restoring = false; }
function sheetUndo() { commit(false); if (!undoStack.length) { toast('Нечего отменять'); return; } redoStack.push(lastSnap); restoreSnap(undoStack.pop()); }
function sheetRedo() { commit(false); if (!redoStack.length) { toast('Нечего повторять'); return; } undoStack.push(lastSnap); restoreSnap(redoStack.pop()); }
function loadSheet(id) {
  const d = lsGet('matlist.sheet.' + id); if (!d) return false;
  active = null; plotEdit = null; targetMf = null; pp.classList.remove('on'); hideBar();
  Object.assign(S, { fmt: Object.assign({}, E.DEFAULT_FMT), origin: 0 }, d); sheetId = id;
  undoStack = []; redoStack = []; lastSnap = null;
  $('#title').firstChild.textContent = S.name; recompute(); render(); wrap.scrollTop = 0; return true;
}
function load() {
  const old = lsGet(STORE); // перенос листа из версии 0.1
  if (old && old.regions && !lib.list.length) { const id = newId(); lsSet('matlist.sheet.' + id, old); lib = { current: id, list: [{ id, name: old.name || 'Лист', updated: Date.now() }] }; lsSet(LIB, lib); lsDel(STORE); }
  return !!(lib.current && loadSheet(lib.current));
}
function setSheet(name, regions, pageW, settings) {
  sheetId = newId(); undoStack = []; redoStack = []; lastSnap = null;
  S.fmt = Object.assign({}, E.DEFAULT_FMT); S.origin = 0;
  if (settings) { for (const k of ['decimals', 'expThreshold', 'imagUnit']) if (settings[k] !== undefined) S.fmt[k] = settings[k]; if (settings.origin !== undefined) S.origin = settings.origin; }
  active = null; plotEdit = null; targetMf = null; pp.classList.remove('on'); hideBar();
  S.name = name; S.regions = regions.map(r => Object.assign({ id: S.nextId++ }, r)); S.pageW = pageW || 380;
  let maxY = 0; for (const r of S.regions) maxY = Math.max(maxY, r.y);
  S.cursor = { x: 16, y: maxY + 60 }; $('#title').firstChild.textContent = name;
  recompute(); fitZoom(); render(); wrap.scrollTop = 0;
}

// ───────── меню и диалоги ─────────
const menu = $('#menu');
$('#bMenu').addEventListener('click', () => { commit(false); closePlot(); menu.classList.add('on'); });
menu.addEventListener('click', ev => { if (ev.target === menu) menu.classList.remove('on'); });
function mi(id, fn) { $(id).addEventListener('click', () => { menu.classList.remove('on'); fn(); }); }
mi('#mNew', () => setSheet(uniqueName('Новый лист'), [], 380));
mi('#mLib', () => openLib());
$('#title').addEventListener('click', () => renameSheet());
function uniqueName(base) { const names = new Set(lib.list.map(x => x.name)); if (!names.has(base)) return base; for (let k = 2; ; k++) if (!names.has(base + ' ' + k)) return base + ' ' + k; }
function renameSheet() {
  commit(false); const d = $('#dName'); $('#nameIn').value = S.name; d.classList.add('on'); setTimeout(() => $('#nameIn').select(), 50);
  $('#nameOk').onclick = () => { const v = $('#nameIn').value.trim(); if (v) { S.name = v; $('#title').firstChild.textContent = v; save(); } d.classList.remove('on'); };
}
function fmtDate(t) { try { return new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function openLib() {
  commit(false); const box = $('#libList'); box.innerHTML = '';
  if (!lib.list.length) box.appendChild(h('p', '', 'Листов пока нет.'));
  for (const it of lib.list.slice().sort((a, b) => b.updated - a.updated)) {
    const row = h('div', 'librow' + (it.id === sheetId ? ' cur' : ''));
    const nm = h('button', 'libname'); nm.appendChild(h('span', '', it.name)); nm.appendChild(h('small', '', fmtDate(it.updated) + (it.id === sheetId ? ' · открыт' : '')));
    nm.addEventListener('click', () => { $('#dLib').classList.remove('on'); if (it.id !== sheetId) loadSheet(it.id); });
    const del = h('button', 'libdel', 'Удалить');
    del.addEventListener('click', () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Точно?'; setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Удалить'; }, 3000); return; }
      lsDel('matlist.sheet.' + it.id); lib.list = lib.list.filter(x => x.id !== it.id); lsSet(LIB, lib);
      if (it.id === sheetId) { sheetId = null; if (lib.list.length) loadSheet(lib.list[0].id); else setSheet(uniqueName('Новый лист'), [], 380); }
      openLib();
    });
    row.appendChild(nm); row.appendChild(del); box.appendChild(row);
  }
  $('#dLib').classList.add('on');
}
mi('#mTest', () => setSheet(uniqueName('Тестовый лист'), window.MATLIST_TEST(), 380));
mi('#mOpen', () => $('#file').click());
mi('#mSave', () => saveXmcd());
// возможность downloads на странице Artifact (null — обычный браузер или APK)
let downloadsApi = null;
try { if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloadsApi = d; }).catch(() => {}); } catch (e) {}
// ZIP без сжатия (метод «stored») с одним файлом
function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zipStore(fname, data) {
  const nameB = new TextEncoder().encode(fname), crc = crc32(data), sz = data.length;
  const lh = new DataView(new ArrayBuffer(30)); [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, sz, 4], [22, sz, 4], [26, nameB.length, 2], [28, 0, 2]].forEach(([o, v, n]) => n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
  const ch = new DataView(new ArrayBuffer(46)); [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, sz, 4], [24, sz, 4], [28, nameB.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, 0, 4]].forEach(([o, v, n]) => n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true));
  const cdOff = 30 + nameB.length + sz, cdSize = 46 + nameB.length;
  const end = new DataView(new ArrayBuffer(22)); [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, 1, 2], [10, 1, 2], [12, cdSize, 4], [16, cdOff, 4], [20, 0, 2]].forEach(([o, v, n]) => n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
  const out = new Uint8Array(cdOff + cdSize + 22); let p = 0;
  for (const part of [new Uint8Array(lh.buffer), nameB, data, new Uint8Array(ch.buffer), nameB, new Uint8Array(end.buffer)]) { out.set(part, p); p += part.length; }
  return out;
}
function saveXmcd() {
  commit(false); closePlot();
  // размеры регионов — с экрана (в px при масштабе 1)
  const regs = S.regions.map(r => {
    const el = page.querySelector('[data-id="' + r.id + '"]'); const c = cleanRegion(r);
    if (el && r.kind !== 'image') { const b = el.getBoundingClientRect(); c.w = b.width / S.zoom; c.h = b.height / S.zoom; }
    if (r.kind === 'text' && r.wpt) c.w = r.wpt * PT;
    if (r.kind === 'image') { // Mathcad хранит рисунки в PNG
      if (/^data:image\/png;base64,/.test(r.src)) c.png = r.src.slice(22);
      else { const im = el && el.querySelector('img'); if (im && im.complete && im.naturalWidth) { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0); c.png = cv.toDataURL('image/png').slice(22); } }
    }
    return c;
  });
  const out = X.exportXmcd(regs, { title: S.name, decimals: S.fmt.decimals, expThreshold: S.fmt.expThreshold, imagUnit: S.fmt.imagUnit, origin: S.origin }, E.parse);
  const name = (S.name || 'Лист').replace(/[\\/:*?"<>|]+/g, '_') + '.xmcd';
  let ok = false;
  if (window.MatlistAndroid && window.MatlistAndroid.saveFile) { try { window.MatlistAndroid.saveFile(name, out.xml); ok = true; } catch (e) {} }
  if (!ok && downloadsApi) { // страница Artifact: .xmcd нет в списке разрешённых расширений — отдаём .zip с файлом внутри
    const zip = zipStore(name, new TextEncoder().encode(out.xml));
    downloadsApi.save({ filename: name.replace(/\.xmcd$/, '') + '.zip', data: new Blob([zip]) })
      .then(() => toast('Сохранено: ' + name + ' (в архиве .zip)' + (out.notes.length ? '. ' + out.notes.join('; ') : '')))
      .catch(e => toast(e && e.code === 'declined' ? 'Сохранение отменено' : 'Не удалось сохранить файл: ' + ((e && e.message) || e)));
    return out;
  }
  if (!ok) {
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.xml], { type: 'application/xml' })); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); ok = true;
    } catch (e) {}
  }
  toast((ok ? 'Сохранено: ' + name : 'Не удалось сохранить файл') + (out.notes.length ? '. ' + out.notes.join('; ') : ''));
  return out;
}
// ───────── экспорт: Word (.docx) и PDF ─────────
const XP = window.MatExport;
const b64ToBytes = b64 => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function bytesToB64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function plotPng(r, scale) { // график → PNG
  const k = scale || 2, cv = document.createElement('canvas'); cv.width = r.w * k; cv.height = r.h * k;
  try { MP.draw(cv, r, { dpr: k }); } catch (e) { return null; }
  return { url: cv.toDataURL('image/png'), w: r.w, h: r.h };
}
function imagePng(r) {
  if (/^data:image\/png;base64,/.test(r.src)) return { url: r.src, w: r.w, h: r.h };
  const im = page.querySelector('[data-id="' + r.id + '"] img'); if (!im || !im.complete || !im.naturalWidth) return null;
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0);
  return { url: cv.toDataURL('image/png'), w: r.w, h: r.h };
}
function fileBase() { return (S.name || 'Лист').replace(/[\\/:*?"<>|]+/g, '_'); }
function saveBinary(name, mime, bytes) {
  if (window.MatlistAndroid && window.MatlistAndroid.saveBase64) { try { window.MatlistAndroid.saveBase64(name, mime, bytesToB64(bytes)); return; } catch (e) {} }
  if (downloadsApi) {
    downloadsApi.save({ filename: name, data: new Blob([bytes], { type: mime }) }).then(() => toast('Сохранено: ' + name))
      .catch(e => toast(e && e.code === 'declined' ? 'Сохранение отменено' : 'Не удалось сохранить файл: ' + ((e && e.message) || e)));
    return;
  }
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); toast('Сохранено: ' + name); }
  catch (e) { toast('Не удалось сохранить файл'); }
}
function saveDocx() {
  commit(false); closePlot(); recompute(); render();
  const regs = sorted().filter(r => r.kind !== 'math' || (r.latex && r.latex.trim()));
  const bytes = XP.docx(regs, { title: S.name, png: r => { const im = r.kind === 'plot' ? plotPng(r, 2) : imagePng(r); return im ? { data: b64ToBytes(im.url.split(',')[1]), w: im.w, h: im.h } : null; } });
  saveBinary(fileBase() + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes);
  return bytes;
}
function printSheetHtml() {
  commit(false); closePlot(); recompute(); render();
  const escH = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const regs = [];
  for (const r of sorted()) {
    const el = page.querySelector('[data-id="' + r.id + '"]'); const b = el ? el.getBoundingClientRect() : null;
    const w = b ? b.width / S.zoom : 200, hh = b ? b.height / S.zoom : 24;
    let html = '';
    if (r.kind === 'math') { if (!r.latex) continue; html = el ? el.innerHTML : ''; }
    else if (r.kind === 'text' || r.kind === 'note') html = '<div class="t' + (r.bold ? ' b' : '') + '" style="' + (el && el.style.width ? 'width:' + el.style.width + ';' : 'max-width:340px;') + (el && el.style.fontSize ? 'font-size:' + el.style.fontSize : '') + '">' + escH(r.text || '') + '</div>';
    else if (r.kind === 'plot') { const im = plotPng(r, 3); if (!im) continue; html = '<img src="' + im.url + '" width="' + r.w + '" height="' + r.h + '">'; }
    else if (r.kind === 'image') html = '<img src="' + r.src + '" width="' + r.w + '" height="' + r.h + '">';
    regs.push({ x: r.x, y: r.y, w, h: hh, html, hl: r.hl });
  }
  const css = [...document.querySelectorAll('style')].filter(st => st.id !== 'appcss').map(st => st.textContent).join('\n');
  return XP.printHtml(regs, { title: S.name, css });
}
function savePdf() {
  const html = printSheetHtml(), title = fileBase();
  if (window.MatlistAndroid && window.MatlistAndroid.printHtml) { try { window.MatlistAndroid.printHtml(html, title); toast('Выберите «Сохранить как PDF» в окне печати'); return html; } catch (e) {} }
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(fr);
  fr.onload = () => { setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Печать недоступна: ' + e.message); } setTimeout(() => fr.remove(), 60000); }, 300); };
  fr.srcdoc = html; toast('Выберите «Сохранить как PDF» в окне печати');
  return html;
}
mi('#mDocx', () => saveDocx());
mi('#mPdf', () => savePdf());
mi('#mFmt', () => {
  $('#fDec').value = S.fmt.decimals; $('#fThr').value = S.fmt.expThreshold; $('#fImag').value = S.fmt.imagUnit || 'i'; $('#fOrg').value = S.origin || 0; $('#dFmt').classList.add('on');
});
mi('#mFit', () => fitZoom());
mi('#m100', () => setZoom(1));
mi('#mAbout', () => $('#dAbout').classList.add('on'));
$('#fOk').addEventListener('click', () => { S.fmt.decimals = Math.max(0, Math.min(15, parseInt($('#fDec').value) || 3)); S.fmt.expThreshold = Math.max(0, Math.min(15, parseInt($('#fThr').value) || 3)); S.fmt.imagUnit = $('#fImag').value; S.origin = parseInt($('#fOrg').value) || 0; $('#dFmt').classList.remove('on'); recompute(); render(); });
document.querySelectorAll('.dlg [data-close]').forEach(b => b.addEventListener('click', () => b.closest('.dlg').classList.remove('on')));
$('#bRecalc').addEventListener('click', () => { commit(false); recompute(); render(); toast('Лист пересчитан'); });
$('#bZoomIn').addEventListener('click', () => setZoom(S.zoom * 1.2));
$('#bZoomOut').addEventListener('click', () => setZoom(S.zoom / 1.2));
function openXmcdText(fileName, txt) {
  try {
    const res = X.importXmcd(txt);
    const regs = res.regions.map(r => Object.assign({}, r, { x: Math.round(r.x * PT), y: Math.round(r.y * PT) }));
    setSheet(String(fileName || 'Лист').replace(/\.xmcd$/i, ''), regs, 800, res.settings);
    const errs = S.regions.filter(r => r.err).length;
    toast('Открыто: ' + regs.length + ' регионов' + (errs ? ', с ошибками: ' + errs : '') + (res.warnings.length ? '. ' + res.warnings[0] : ''));
  } catch (e) { toast('Не удалось открыть файл: ' + e.message); }
}
window.MATLIST_OPEN_TEXT = openXmcdText; // вызывается Android-обёрткой при «Открыть с помощью»
// кнопка «Назад» на Android: закрыть верхний открытый элемент; true — закрыли, false — можно выходить
window.MATLIST_BACK = function () {
  if (full.classList.contains('on')) { $('#fullClose').click(); return true; }
  if (textEl) { textEl.blur(); return true; }
  if (pd && pd.drag) { endDrag(); return true; }
  const dlg = document.querySelector('.dlg.on'); if (dlg) { dlg.classList.remove('on'); return true; }
  if (menu.classList.contains('on')) { menu.classList.remove('on'); return true; }
  if (plotEdit) { closePlot(); return true; }
  if (active) { commit(false); return true; }
  if (moveMode) { moveMode = null; return true; }
  if (bar.style.display !== 'none') { hideBar(); render(); return true; }
  return false;
};
$('#file').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  openXmcdText(f.name, await f.text());
});
function askMatrix() {
  const d = $('#dMat'); d.classList.add('on');
  $('#mOk').onclick = () => {
    const r = Math.max(1, Math.min(20, parseInt($('#mRows').value) || 2)), c = Math.max(1, Math.min(20, parseInt($('#mCols').value) || 2));
    d.classList.remove('on');
    const rows = []; for (let i = 0; i < r; i++) rows.push(new Array(c).fill('#?').join('&'));
    const mf = ensureTarget(); insert(mf, '\\begin{bmatrix}' + rows.join('\\\\') + '\\end{bmatrix}');
  };
}
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
$('#kKbd').addEventListener('pointerdown', ev => { ev.preventDefault(); nativeKbd = !nativeKbd; if (targetMf) { noNativeKbd(targetMf); targetMf.blur(); targetMf.focus(); } toast(nativeKbd ? 'Системная клавиатура включена' : 'Системная клавиатура выключена'); });

// ───────── запуск ─────────
buildKeys();
if (!load()) setSheet('Тестовый лист', window.MATLIST_TEST(), 380);
window.addEventListener('resize', () => { page.style.height = Math.max(wrap.clientHeight / S.zoom - 24, page._minH || 0, S.cursor.y + 300) + 'px'; });
$('#loading').remove();
if (window.MatlistAndroid && window.MatlistAndroid.ready) { try { window.MatlistAndroid.ready(); } catch (e) {} }
window.MATLIST_DEBUG = { S, saveXmcd, saveDocx, printSheetHtml, zipStore, setKbd, shiftBelow, clip: () => clip, lib: () => lib, sheetUndo, sheetRedo, openLib, recompute, render, setSheet, commit, ensureTarget, insert, press: (tab, label) => { const k = (TABS[tab] || []).find(x => x.l === label); if (k) press(k); }, activate };
})();
