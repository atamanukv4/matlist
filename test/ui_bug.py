"""«Сообщить об ошибке»: диалог из меню, сбор отчёта, отправка через мост Android и запасной путь браузера."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8791', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
SHEET = [r'a\coloneq 2', r'b\coloneq a\cdot 3', r'b=']
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8791/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(500)
        pg.evaluate("(L) => { const D = MATLIST_DEBUG; D.setSheet('Отчёт', L.map((l, i) => ({ id: i + 1, kind: 'math', x: 16, y: 16 + i * 36, latex: l })), 380); D.recompute(); D.render(); }", SHEET)
        pg.wait_for_timeout(300)
        n0 = pg.evaluate("MATLIST_DEBUG.S.regions.length")
        # 1) пункт меню открывает диалог
        check('пункт «Сообщить об ошибке» есть в меню', pg.locator('#mBug').count() == 1)
        pg.evaluate("document.querySelector('#menu').classList.add('on')")
        pg.locator('#mBug').click(); pg.wait_for_timeout(200)
        check('диалог открылся', pg.evaluate("document.querySelector('#dBug').classList.contains('on')"))
        info = pg.locator('#bugInfo').text_content()
        check('в отчёте версия, устройство и лист', 'Версия:' in info and 'Устройство:' in info and '«Отчёт», регионов 3' in info, info)
        # 2) набор в поле описания не создаёт регионов на листе
        pg.locator('#bugText').fill('b считается неверно')
        pg.locator('#bugText').press('x')
        check('набор в описании не трогает лист', pg.evaluate("MATLIST_DEBUG.S.regions.length") == n0)
        pg.screenshot(path=f'{OUT}/bug_1_dialog.png')
        # 3) Android: мост получает тему, текст, имя и содержимое листа
        pg.evaluate("window.MatlistAndroid = { version: () => '0.8.test', shareReport: (...a) => { window.__rep = a; } }")
        pg.evaluate("MATLIST_DEBUG.logErr('test', 'пробная запись журнала')")
        pg.select_option('#bugPri', 'P0')
        pg.locator('#bugSend').click(); pg.wait_for_timeout(300)
        rep = pg.evaluate("window.__rep")
        check('мост Android вызван', rep is not None and len(rep) == 4, rep)
        if rep:
            subj, text, fname, xml = rep
            check('тема с приоритетом', subj.endswith('P0'), subj)
            check('текст: описание, версия Android, журнал', 'b считается неверно' in text and '0.8.test (Android)' in text and 'пробная запись журнала' in text, text[:300])
            check('лист приложен как .xmcd', fname == 'Отчёт.xmcd' and '<worksheet' in xml, (fname, xml[:80]))
        check('диалог закрылся после отправки', not pg.evaluate("document.querySelector('#dBug').classList.contains('on')"))
        # 4) без листа: галочка снята — файл не прикладывается
        pg.evaluate("window.__rep = null"); pg.evaluate("MATLIST_DEBUG.openBug()")
        pg.locator('#bugSheet').uncheck(); pg.locator('#bugSend').click(); pg.wait_for_timeout(300)
        rep2 = pg.evaluate("window.__rep")
        check('без галочки лист не прикладывается', rep2 is not None and rep2[2] == '' and rep2[3] == '', rep2 and rep2[2])
        # 5) браузер без моста и без Web Share: текст в буфер обмена
        pg.evaluate("delete window.MatlistAndroid; navigator.share = undefined")
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        pg.evaluate("MATLIST_DEBUG.openBug()"); pg.locator('#bugText').fill('проверка буфера')
        res = pg.evaluate("MATLIST_DEBUG.sendBug()")
        check('браузер: запасной путь сработал', res in ('clipboard', 'share'), res)
        check('лист после отчёта не изменился', pg.evaluate("MATLIST_DEBUG.S.regions.length") == n0)
        check('без ошибок страницы', not logs, logs)
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + s) for s in ok]
print('FAIL:'); [print('  ' + s) for s in bad]
