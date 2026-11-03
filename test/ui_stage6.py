"""Этап 6: пересчёт с места правки (выше — не считается), фоновый поток не пересчитывает тяжёлое выше правки; масштаб по ширине; разделитель клавиатуры; рукописная панель помещается."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8793', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
HEAVY = r'A\coloneq\sum_{i=1}^{4000000}\frac{1}{i^{2}}'
SHEET = [HEAVY, r'A=', r'a\coloneq 2', r'b\coloneq a+1', r'b=', r'B\coloneq\sum_{i=1}^{%d}\frac{1}{i^{2}}', r'B+b=']
def regs(pg): return pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').map(r => ({ latex: r.latex, res: r.res, err: r.err, pending: r.pending }))")
def wait_done(pg, ms=30000):
    t = time.time()
    while time.time() - t < ms / 1000:
        if not any(r['pending'] for r in regs(pg)) and not pg.evaluate("document.getElementById('busy') && document.getElementById('busy').classList.contains('on')"): return time.time() - t
        pg.wait_for_timeout(50)
    return None
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8793/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(400)
        L = [x % 1000 if '%d' in x else x for x in SHEET]
        pg.evaluate("(L) => { const D = MATLIST_DEBUG; D.setSheet('Этап 6', L.map((l, i) => ({ id: i + 1, kind: 'math', x: 16, y: 16 + i * 40, latex: l })), 380); D.recompute(); D.render(); }", L)
        t_full = wait_done(pg); R = regs(pg)
        check('первый расчёт: тяжёлая сумма в фоне', t_full is not None and R[1]['res'] and R[1]['res'].startswith('1.645'), (t_full, R[1]))
        # правка ниже тяжёлой суммы: пересчёт с места правки, сумма не считается заново
        t0 = time.time(); pg.evaluate("(() => { const r = MATLIST_DEBUG.S.regions[2]; r.latex = 'a\\\\coloneq 5'; MATLIST_DEBUG.recompute(); MATLIST_DEBUG.render(); })()")
        dt = time.time() - t0; R = regs(pg); reused = pg.evaluate("MATLIST_DEBUG.recompute.reused")
        check('правка ниже — выше ничего не пересчитано', reused == 2 and dt < 0.25, (reused, dt))
        check('зависимые обновились: b = 6', R[4]['res'] == '6', R[4])
        check('сумма выше осталась', R[1]['res'] and R[1]['res'].startswith('1.645') and not R[1]['pending'], R[1])
        # правка тяжёлого региона ниже: поток повторяет верх по готовым значениям, не считая сумму A
        pg.evaluate("(() => { const r = MATLIST_DEBUG.S.regions[5]; r.latex = 'B\\\\coloneq\\\\sum_{i=1}^{1500000}\\\\frac{1}{i^{2}}'; MATLIST_DEBUG.recompute(); MATLIST_DEBUG.render(); })()")
        t_part = wait_done(pg); R = regs(pg)
        check('тяжёлое ниже — поток не считает A заново (быстрее полного)', t_part is not None and t_full and t_part < t_full * 0.75, (t_part, t_full))
        check('B + b верно', R[6]['res'] and R[6]['res'].startswith('7.64'), R[6])
        # правка верха: всё ниже пересчитывается
        pg.evaluate("(() => { const r = MATLIST_DEBUG.S.regions[0]; r.latex = 'A\\\\coloneq 1'; MATLIST_DEBUG.recompute(); MATLIST_DEBUG.render(); })()"); wait_done(pg); R = regs(pg)
        check('правка верха — пересчёт всего', pg.evaluate("MATLIST_DEBUG.recompute.reused") == 0 and R[1]['res'] == '1', R[1])
        # перенос региона выше — порядок меняется, считается с нужного места
        pg.evaluate("(() => { const S = MATLIST_DEBUG.S; S.regions[2].latex = 'a\\\\coloneq 7'; MATLIST_DEBUG.recompute(); MATLIST_DEBUG.render(); })()"); wait_done(pg)
        check('b = 8 после правки a', regs(pg)[4]['res'] == '8', regs(pg)[4])
        # масштаб по ширине
        st = pg.evaluate("(() => { const p = document.getElementById('page').getBoundingClientRect(), w = document.getElementById('sheetwrap').getBoundingClientRect(); return { pr: p.right, wr: w.right, auto: MATLIST_DEBUG.S.zoomAuto }; })()")
        check('лист помещается по ширине экрана', st['pr'] <= st['wr'] + 1 and st['auto'], st)
        # рукописная панель: кнопки и палитра внутри экрана даже при большом холсте
        pg.evaluate("MATLIST_DEBUG.inkOpen()"); pg.wait_for_timeout(300); pg.evaluate("document.getElementById('inkCv').height = 4000"); pg.wait_for_timeout(100)
        ib = pg.evaluate("(() => { const t = document.querySelector('.inktools').getBoundingClientRect(), g = document.getElementById('inkGreek').getBoundingClientRect(); return { tb: t.bottom, gb: g.bottom, h: innerHeight }; })()")
        check('рукописная панель помещается в экран', ib['tb'] <= ib['h'] and ib['gb'] <= ib['h'] + 1, ib)
        pg.locator('#inkClose').click(); pg.wait_for_timeout(200)
        # разделитель: вертикально — высота клавиш
        h0 = pg.evaluate("document.querySelector('#keys button').getBoundingClientRect().height"); a = pg.evaluate("(() => { const s = document.getElementById('kSplit').getBoundingClientRect(); return [s.left + s.width / 2, s.top + s.height / 2]; })()")
        pg.evaluate("([x, y]) => { const sp = document.getElementById('kSplit'); const f = (t, yy) => sp.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: yy, pointerId: 1 })); f('pointerdown', y); f('pointermove', y - 60); f('pointerup', y - 60); }", a); pg.wait_for_timeout(200)
        h1 = pg.evaluate("document.querySelector('#keys button').getBoundingClientRect().height")
        check('разделитель увеличивает клавиатуру', h1 > h0 + 8, (h0, h1))
        # большой лист: далёкие регионы рисуются при прокрутке
        pg.evaluate("(() => { const D = MATLIST_DEBUG; const L = []; for (let i = 0; i < 600; i++) L.push({ id: i + 1, kind: 'math', x: 16, y: 16 + i * 40, latex: i ? 'v_{' + i + '}\\coloneq v_{' + (i - 1) + '}+1' : 'v_{0}\\coloneq 0' }); L.push({ id: 700, kind: 'math', x: 16, y: 16 + 600 * 40, latex: 'v_{599}=' }); D.setSheet('Большой', L, 380); D.S.zoomAuto = false; D.S.zoom = 1; D.render(); })()")
        pg.wait_for_timeout(300)
        n_lazy = pg.evaluate("document.querySelectorAll('.rg.lazy').length")
        check('далёкие регионы — заготовки', n_lazy > 400, n_lazy)
        pg.evaluate("document.getElementById('sheetwrap').scrollTop = 1e6"); pg.wait_for_timeout(400)
        last = pg.evaluate("(() => { const el = document.querySelector('[data-id=\"700\"]'); return { lazy: el.classList.contains('lazy'), txt: el.textContent }; })()")
        check('после прокрутки вниз последний регион нарисован', not last['lazy'] and '599' in last['txt'], last)
        x = pg.evaluate("MATLIST_DEBUG.saveXmcd()")
        check('сохранение .xmcd рисует все регионы', pg.evaluate("document.querySelectorAll('.rg.lazy').length") == 0)
        check('нет ошибок JS', not logs, logs[:3])
        ctx.close()
        # альбомная: разделитель меняет ширину
        ctx = b.new_context(viewport={'width': 1100, 'height': 600}, has_touch=True); pg = ctx.new_page()
        pg.goto('http://localhost:8793/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(400)
        w0 = pg.evaluate("document.getElementById('kbd').getBoundingClientRect().width"); a = pg.evaluate("(() => { const s = document.getElementById('kSplit').getBoundingClientRect(); return [s.left + s.width / 2, s.top + s.height / 2]; })()")
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(a[0] - 120, a[1], steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
        w1 = pg.evaluate("document.getElementById('kbd').getBoundingClientRect().width")
        check('альбомная: разделитель расширяет клавиатуру', abs(w1 - w0 - 120) < 4, (w0, w1))
        pg.screenshot(path=f'{OUT}/s6_land.png')
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + x) for x in ok]
print('FAIL:'); [print('  ' + x) for x in bad]
