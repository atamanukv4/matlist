"""Этап 5: альбомная клавиатура (вкладки видны, прокрутка, ширина), все функции, программы с клавиатуры, палитра в рукописном вводе."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8789', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
def key(pg, tab, label):
    pg.evaluate("t => { const b = [...document.querySelectorAll('#tabs button')].find(x => x.textContent === t); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", tab); pg.wait_for_timeout(60)
    pg.evaluate("l => { const b = [...document.querySelectorAll('#keys button')].find(x => x.textContent === l); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", label); pg.wait_for_timeout(80)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, (w, hh) in {'tablet': (1333, 800), 'phone': (844, 390)}.items():
            ctx = b.new_context(viewport={'width': w, 'height': hh}, is_mobile=True, has_touch=True); pg = ctx.new_page(); logs = []
            pg.on('pageerror', lambda e: logs.append(str(e)))
            pg.goto('http://localhost:8789/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(500)
            st = pg.evaluate("""(() => { const t = document.getElementById('tabs').getBoundingClientRect(), k = document.getElementById('kbd').getBoundingClientRect(), keys = document.getElementById('keys');
              return { tabsH: t.height, tabsBottom: t.bottom, kbdBottom: k.bottom, kbdW: k.width, keysScroll: getComputedStyle(keys).overflowY, nav: getComputedStyle(document.querySelector('.tools.nav')).overflowX }; })()""")
            check(f'[{name}] вкладки видны', st['tabsH'] >= 26 and st['tabsBottom'] < st['kbdBottom'], st)
            check(f'[{name}] клавиши и верхняя строка прокручиваются', st['keysScroll'] == 'auto' and st['nav'] == 'auto', st)
            pg.screenshot(path=f'{OUT}/s5_{name}.png')
            for tab in ['f(x)', 'WSP', 'abc', 'прог.']:
                pg.evaluate("t => { const b = [...document.querySelectorAll('#tabs button')].find(x => x.textContent === t); b.scrollIntoView(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", tab); pg.wait_for_timeout(100)
                vis = pg.evaluate("(() => { const k = document.getElementById('keys'); return { n: k.children.length, canScroll: k.scrollHeight >= k.clientHeight }; })()")
                check(f'[{name}] вкладка {tab} открывается', vis['n'] > 5, vis)
            pg.screenshot(path=f'{OUT}/s5_{name}_prog.png')
            ctx.close()
        # ширина клавиатуры
        ctx = b.new_context(viewport={'width': 1333, 'height': 800}, is_mobile=True, has_touch=True); pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8789/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(400)
        for v in ['450', '720']:
            pg.evaluate("document.querySelector('#bMenu').click()"); pg.wait_for_timeout(100); pg.evaluate("document.querySelector('#mKbw').click()"); pg.wait_for_timeout(150)
            pg.evaluate("v => [...document.querySelectorAll('#kbwList button')].find(b => b.textContent.startsWith(v)).click()", v); pg.wait_for_timeout(200)
            wk = pg.evaluate("document.getElementById('kbd').getBoundingClientRect().width")
            check(f'ширина клавиатуры {v} px', abs(wk - int(v)) < 3, wk)
        # все функции: найти J0 и вставить
        pg.evaluate("MATLIST_DEBUG.setSheet('Этап 5', [], 380); MATLIST_DEBUG.recompute(); MATLIST_DEBUG.render(); MATLIST_DEBUG.S.cursor = { x: 20, y: 30 }")
        key(pg, 'f(x)', 'все f…'); pg.wait_for_timeout(200)
        pg.locator('#fnQ').fill('J0'); pg.wait_for_timeout(150)
        n = pg.evaluate("document.querySelectorAll('#fnList button').length")
        check('поиск функции J0', n >= 1, n)
        pg.locator('#fnList button').first.dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        key(pg, '123', '2'); key(pg, '123', '.'); key(pg, '123', '5'); pg.locator('#kEnd').dispatch_event('pointerdown'); pg.locator('#kEq').dispatch_event('pointerdown'); pg.wait_for_timeout(100)
        pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(500)
        last = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').slice(-1).map(r => [r.latex, r.res, r.err])[0]")
        check('J0(2.5) = −0.048', last and last[1] and last[1].startswith('-0.048'), last)
        # программа с клавиатуры: g(x) := | x if x>0 ; −x otherwise
        pg.evaluate("MATLIST_DEBUG.S.cursor = { x: 20, y: 120 }")
        for k in ['g']: pg.evaluate("MATLIST_DEBUG.insert(MATLIST_DEBUG.ensureTarget(), 'g\\\\left(x\\\\right)\\\\coloneq ')")
        key(pg, 'прог.', 'Прогр.')
        pg.evaluate("MATLIST_DEBUG.insert(MATLIST_DEBUG.ensureTarget(), 'x')"); key(pg, 'прог.', 'if'); pg.evaluate("MATLIST_DEBUG.insert(MATLIST_DEBUG.ensureTarget(), 'x>0')")
        pg.evaluate("(() => { const mf = document.querySelector('.rg.editing math-field'); mf.executeCommand('moveToNextPlaceholder'); })()")
        pg.evaluate("MATLIST_DEBUG.insert(MATLIST_DEBUG.ensureTarget(), '-x')"); key(pg, 'прог.', 'otherwise')
        pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(400)
        prog = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').slice(-1).map(r => [r.latex, r.res, r.err])[0]")
        check('программа набрана без ошибок', prog and not prog[2] and 'array' in prog[0], prog)
        pg.evaluate("MATLIST_DEBUG.S.cursor = { x: 20, y: 220 }"); pg.evaluate("MATLIST_DEBUG.insert(MATLIST_DEBUG.ensureTarget(), 'g\\\\left(-3\\\\right)=')"); pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(400)
        res = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').slice(-1).map(r => [r.latex, r.res, r.err])[0]")
        check('g(−3) = 3', res and res[1] == '3', (prog, res))
        pg.screenshot(path=f'{OUT}/s5_prog_sheet.png')
        # рукописный ввод: палитра ω и кнопка «⌨ Клавиатура»
        pg.evaluate("MATLIST_DEBUG.S.cursor = { x: 20, y: 300 }"); pg.evaluate("MATLIST_DEBUG.inkOpen()"); pg.wait_for_timeout(300)
        pg.evaluate("[...document.querySelectorAll('#inkGreek button')].find(b => b.textContent === 'ω').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); pg.wait_for_timeout(200)
        lat = pg.evaluate("(() => { const mf = document.querySelector('.rg.editing math-field'); return mf ? mf.getValue('latex') : null; })()")
        check('палитра вставляет ω', lat and 'omega' in lat, lat)
        pg.screenshot(path=f'{OUT}/s5_ink.png')
        pg.locator('#inkClose').click(); pg.wait_for_timeout(200)
        check('«⌨ Клавиатура» возвращает экранную клавиатуру', not pg.evaluate("document.getElementById('inkpanel').classList.contains('on')") and pg.evaluate("getComputedStyle(document.getElementById('keys')).display") != 'none')
        check('нет ошибок JS', not logs, logs[:3])
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + x) for x in ok]
print('FAIL:'); [print('  ' + x) for x in bad]
