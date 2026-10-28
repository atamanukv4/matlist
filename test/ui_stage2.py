"""Этап 2: несколько листов (создать, переключить, переименовать, удалить), отмена и повтор на листе."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        # перенос старого листа версии 0.1
        pg.goto('http://localhost:8768/index.html'); pg.evaluate("localStorage.clear(); localStorage.setItem('matlist.sheet.v1', JSON.stringify({name:'Старый лист', regions:[{id:1,kind:'math',x:20,y:20,latex:'7\\\\cdot6='}], cursor:{x:16,y:80}, nextId:2, pageW:380, zoom:1}))")
        pg.reload(); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(400)
        st = pg.evaluate("({ name: MATLIST_DEBUG.S.name, res: MATLIST_DEBUG.S.regions.map(r => r.res), n: MATLIST_DEBUG.lib().list.length })")
        check('лист из версии 0.1 переносится', st['name'] == 'Старый лист' and st['res'] == ['42'] and st['n'] == 1, st)
        key = lambda l: (pg.locator('#keys button', has_text=l).first.dispatch_event('pointerdown'), pg.wait_for_timeout(80))
        # новый лист
        pg.click('#bMenu'); pg.click('#mNew'); pg.wait_for_timeout(300)
        bx = pg.locator('#page').bounding_box(); pg.mouse.click(bx['x'] + 40, bx['y'] + 60); pg.wait_for_timeout(150)
        key('9'); pg.locator('#keys button', has_text='+').first.dispatch_event('pointerdown'); key('1'); pg.locator('#kEq').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        n = pg.evaluate('MATLIST_DEBUG.lib().list.length'); check('новый лист появился в списке', n == 2, n)
        # переименование
        pg.click('#title'); pg.fill('#nameIn', 'Котёл ТГМП'); pg.click('#nameOk'); pg.wait_for_timeout(150)
        check('переименование', pg.evaluate('MATLIST_DEBUG.S.name') == 'Котёл ТГМП')
        # список листов и переключение
        pg.click('#bMenu'); pg.click('#mLib'); pg.wait_for_timeout(200)
        pg.screenshot(path=f'{OUT}/s2_lib.png')
        rows = pg.locator('.librow').count(); check('в списке 2 листа', rows == 2, rows)
        pg.locator('.libname', has_text='Старый лист').click(); pg.wait_for_timeout(300)
        check('переключение на другой лист', pg.evaluate('MATLIST_DEBUG.S.name') == 'Старый лист')
        pg.click('#bMenu'); pg.click('#mLib'); pg.locator('.libname', has_text='Котёл ТГМП').click(); pg.wait_for_timeout(300)
        r = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => r.res)'); check('лист сохранил формулы', r == ['10'], r)
        # отмена/повтор: удалить регион и вернуть
        el = pg.locator('.rg.math').first.bounding_box(); pg.mouse.click(el['x'] + 3, el['y'] + 5); pg.wait_for_timeout(300)
        pg.locator('#rbar .del').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        check('регион удалён', pg.evaluate('MATLIST_DEBUG.S.regions.length') == 0)
        pg.locator('#kUndo').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        r = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => r.res)'); check('↶ возвращает удалённый регион', r == ['10'], r)
        pg.locator('#kRedo').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        check('↷ снова удаляет', pg.evaluate('MATLIST_DEBUG.S.regions.length') == 0)
        pg.locator('#kUndo').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        # удаление листа (двойное нажатие)
        pg.click('#bMenu'); pg.click('#mLib'); pg.wait_for_timeout(200)
        d = pg.locator('.librow', has_text='Старый лист').locator('.libdel'); d.click(); d.click(); pg.wait_for_timeout(200)
        n = pg.evaluate('MATLIST_DEBUG.lib().list.length'); check('удаление листа с подтверждением', n == 1, n)
        # после перезапуска открыт последний лист
        pg.reload(); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(300)
        check('после перезапуска открыт последний лист', pg.evaluate('MATLIST_DEBUG.S.name') == 'Котёл ТГМП')
        check('без ошибок JS', not logs, logs)
        b.close()
finally: srv.terminate()
print('OK:', *ok, sep='\n  '); print('FAIL:', *bad, sep='\n  ')
