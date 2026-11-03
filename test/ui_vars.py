"""Переменные листа: подсказки при наборе, список по кнопке «x=…»; переключатель единиц измерения."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8783', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
SHEET = [r'P_{\mathrm{вх}}\coloneq 2.5', r'P_{\mathrm{вых}}\coloneq 0.5', r'G\coloneq 12', r'f(x)\coloneq x^{2}+1', r'L\coloneq 3\,\mathrm{m}']
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8783/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(500)
        pg.evaluate("(L) => { const D = MATLIST_DEBUG; D.setSheet('Переменные', L.map((l, i) => ({ id: i + 1, kind: 'math', x: 16, y: 16 + i * 36, latex: l })), 380); D.recompute(); D.render(); D.S.cursor = { x: 16, y: 16 + L.length * 36 }; }", SHEET)
        pg.wait_for_timeout(400)
        # 1) подсказки: набрать «P» — появляются P.вх и P.вых
        pg.evaluate("MATLIST_DEBUG.insert(MATLIST_DEBUG.ensureTarget(), 'P')"); pg.wait_for_timeout(400)
        sug = pg.evaluate("[...document.querySelectorAll('#sugg.on button')].map(b => b.textContent)")
        check('подсказки по букве P', len(sug) == 2 and all('P' in s for s in sug), sug)
        pg.screenshot(path=f'{OUT}/vars_1_sugg.png')
        pg.locator('#sugg button').first.dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        lat = pg.evaluate("document.querySelector('.rg.editing math-field').getValue('latex')")
        check('подсказка вставляет полное имя вместо набранной буквы', lat.replace(' ', '') in (r'P_{\mathrm{вх}}', r'P_{\mathrm{вых}}'), lat)
        check('строка подсказок скрылась', not pg.evaluate("document.querySelector('#sugg').classList.contains('on')"))
        # 2) кнопка «x=…»: список, вставка функции с пустыми местами
        pg.evaluate("MATLIST_DEBUG.press('123', '+')")
        pg.locator('#kVars').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        items = pg.evaluate("[...document.querySelectorAll('#varList button')].map(b => b.textContent)")
        check('в списке все 5 имён листа', len(items) == 5, items)
        pg.screenshot(path=f'{OUT}/vars_2_list.png')
        pg.locator('#varQ').fill('f'); pg.wait_for_timeout(150)
        items2 = pg.evaluate("[...document.querySelectorAll('#varList button')].map(b => b.textContent)")
        check('поиск в списке', len(items2) == 1, items2)
        pg.locator('#varList button').first.dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        pg.evaluate("MATLIST_DEBUG.press('123', '3')")
        pg.locator('#kEnd').dispatch_event('pointerdown'); pg.wait_for_timeout(100)
        pg.locator('#kEq').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(500)
        last = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').slice(-1).map(r => [r.latex, r.res, r.err])[0]")
        check('P + f(3) = посчитано', last and last[1] in ('12.5', '12.5'), last)  # 2.5 + 10
        # 3) единицы: выключить — L := 3 m даёт ошибку «m не определена», вкладка «ед.» скрыта; m := 2 работает как переменная
        tabs_on = pg.evaluate("[...document.querySelectorAll('#tabs button')].map(b => b.textContent)")
        pg.evaluate("document.querySelector('#bMenu').click()"); pg.wait_for_timeout(150); pg.evaluate("document.querySelector('#mUnits').click()"); pg.wait_for_timeout(500)
        st = pg.evaluate("({ lab: document.querySelector('#mUnits').textContent, tabs: [...document.querySelectorAll('#tabs button')].map(b => b.textContent), L: MATLIST_DEBUG.S.regions.find(r => /^L/.test(r.latex || '')).err, units: MATLIST_DEBUG.S.fmt.units })")
        check('единицы выключаются', st['units'] is False and 'выкл' in st['lab'] and 'ед.' in tabs_on and 'ед.' not in st['tabs'] and st['L'], st)
        pg.screenshot(path=f'{OUT}/vars_3_units_off.png')
        pg.evaluate("document.querySelector('#bMenu').click()"); pg.wait_for_timeout(150); pg.evaluate("document.querySelector('#mUnits').click()"); pg.wait_for_timeout(500)
        st2 = pg.evaluate("({ L: MATLIST_DEBUG.S.regions.find(r => /^L/.test(r.latex || '')).err, tabs: [...document.querySelectorAll('#tabs button')].map(b => b.textContent) })")
        check('единицы включаются обратно', not st2['L'] and 'ед.' in st2['tabs'], st2)
        check('нет ошибок JS', not logs, logs[:3])
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + x) for x in ok]
print('FAIL:'); [print('  ' + x) for x in bad]
