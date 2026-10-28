"""Сценарии работы с листом в Chromium (экран телефона, сенсорный ввод)."""
import json, sys, subprocess, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
FIX = os.path.join(os.path.dirname(__file__), 'fixtures')
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
ok = []; bad = []
def check(name, cond, info=''):
    (ok if cond else bad).append(name + ('' if cond else f' :: {info}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.goto('http://localhost:8766/index.html')
        pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        pg.wait_for_timeout(800)
        # 1) новый лист, тап по пустому месту, ввод 2+3=
        pg.click('#bMenu'); pg.click('#mNew'); pg.wait_for_timeout(300)
        page_box = pg.locator('#page').bounding_box()
        pg.mouse.click(page_box['x'] + 60, page_box['y'] + 80); pg.wait_for_timeout(200)
        cur = pg.evaluate('MATLIST_DEBUG.S.cursor'); check('курсор ставится тапом', cur['y'] > 40, cur)
        def key(label):
            pg.locator('#keys button', has_text=label).first.dispatch_event('pointerdown'); pg.wait_for_timeout(120)
        for k in ['2', '+', '3']: key(k)
        pg.locator('#kEq').dispatch_event('pointerdown'); pg.wait_for_timeout(400)
        r = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => ({latex: r.latex, res: r.res, err: r.err}))')
        check('ввод 2+3= даёт 5', len(r) == 1 and r[0]['res'] == '5', r)
        # 2) определение через := и шаблон дроби
        pg.mouse.click(page_box['x'] + 60, page_box['y'] + 150); pg.wait_for_timeout(150)
        pg.locator('.tabs button', has_text='abc').dispatch_event('pointerdown'); key('k')
        pg.locator('#kDef').dispatch_event('pointerdown'); pg.wait_for_timeout(100)
        pg.locator('.tabs button', has_text='123').dispatch_event('pointerdown')
        key('a/b'); key('1'); pg.evaluate("MATLIST_DEBUG.S && document.querySelector('.rg math-field').executeCommand('moveToNextPlaceholder')"); key('4')
        pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        pg.mouse.click(page_box['x'] + 60, page_box['y'] + 230); pg.wait_for_timeout(150)
        key('8'); pg.locator('#keys button', has_text='×').first.dispatch_event('pointerdown'); pg.wait_for_timeout(100)
        pg.locator('.tabs button', has_text='abc').dispatch_event('pointerdown'); key('k')
        pg.locator('#kEq').dispatch_event('pointerdown'); pg.wait_for_timeout(400)
        r = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => ({latex: r.latex, res: r.res, err: r.err}))')
        check('k := 1/4, 8·k = 2', any(x['res'] == '2' for x in r), r)
        pg.screenshot(path=f'{OUT}/i1_typed.png')
        # 3) правка существующей формулы: тап по 2+3, дописать ·10
        first = pg.locator('.rg.math').first; fb = first.bounding_box()
        pg.mouse.click(fb['x'] + 5, fb['y'] + fb['height'] / 2); pg.wait_for_timeout(400)
        check('редактор открывается по тапу', pg.locator('.rg math-field').count() == 1)
        pg.evaluate("(() => { const mf = document.querySelector('.rg math-field'); mf.value = '(2+3)\\\\cdot10='; mf.dispatchEvent(new Event('input')); })()")
        pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        r = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => r.res)')
        check('правка пересчитывается (50)', '50' in r, r)
        # 4) график: новая кнопка, ось Y sin(x), X x
        pg.mouse.click(page_box['x'] + 30, page_box['y'] + 320); pg.wait_for_timeout(150)
        pg.locator('#kPlot').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        check('панель графика открылась', pg.locator('#plotpanel.on').count() == 1)
        pg.evaluate("(() => { const y = document.getElementById('py'); y.value = '\\\\sin\\\\left(x\\\\right)\\\\cdot k'; y.dispatchEvent(new Event('input')); const x = document.getElementById('px'); x.value = 'x'; x.dispatchEvent(new Event('input')); })()")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/i2_plotedit.png')
        pg.locator('#kOk').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        perr = pg.evaluate("document.querySelector('.rg.plot .pl').textContent")
        geo = pg.evaluate("!!document.querySelector('.rg.plot canvas')._geo")
        check('график построен без ошибки', perr.strip() == '' and geo, perr)
        pg.screenshot(path=f'{OUT}/i3_plot.png')
        # 5) сохранение и перезапуск
        n_before = pg.evaluate('MATLIST_DEBUG.S.regions.length')
        pg.reload(); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(500)
        n_after = pg.evaluate('MATLIST_DEBUG.S.regions.length')
        check('лист сохраняется после перезапуска', n_before == n_after and n_after >= 4, (n_before, n_after))
        # 6) открытие .xmcd
        pg.click('#bMenu')
        with pg.expect_file_chooser() as fc:
            pg.click('#mOpen')
        fc.value.set_files(os.path.join(FIX, 'tgmp.xmcd')); pg.wait_for_timeout(1200)
        info = pg.evaluate("({ name: MATLIST_DEBUG.S.name, n: MATLIST_DEBUG.S.regions.length, errs: MATLIST_DEBUG.S.regions.filter(r => r.err).length, res: MATLIST_DEBUG.S.regions.filter(r => r.res).map(r => r.res) })")
        check('открывается .xmcd (ТГМП-314)', info['n'] == 24 and info['errs'] == 0 and len(info['res']) == 3, info)
        pg.screenshot(path=f'{OUT}/i4_xmcd.png')
        with pg.expect_file_chooser() as fc:
            pg.click('#bMenu'); pg.click('#mOpen')
        fc.value.set_files(os.path.join(FIX, 'kes500_part.xmcd')); pg.wait_for_timeout(2500)
        info2 = pg.evaluate("({ n: MATLIST_DEBUG.S.regions.length, errs: MATLIST_DEBUG.S.regions.filter(r => r.err).length, stored: MATLIST_DEBUG.S.regions.filter(r => r.err && r.stored != null).length })")
        check('большой лист КЭС открывается', info2['n'] > 200, info2)
        pg.screenshot(path=f'{OUT}/i5_kes.png')
        check('нет ошибок JS', not logs, logs)
        b.close()
finally:
    srv.terminate()
print('OK:', *ok, sep='\n  ')
print('FAIL:', *bad, sep='\n  ')
print(json.dumps(info2 if 'info2' in dir() else {}, ensure_ascii=False))
