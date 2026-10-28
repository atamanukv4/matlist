"""Графики и картинки: вкладки панели, легенда, подписи и формат осей, жесты, подложка с подгонкой, полный экран, рисунок на листе."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
PNG = sys.argv[2]
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8773', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8773/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(500)
        # 1) рисунок на листе
        pg.click('#bMenu'); pg.click('#mNew'); pg.wait_for_timeout(200)
        bx = pg.locator('#page').bounding_box(); pg.mouse.click(bx['x'] + 30, bx['y'] + 40); pg.wait_for_timeout(100)
        with pg.expect_file_chooser() as fc: pg.locator('#kImg').dispatch_event('pointerdown')
        fc.value.set_files(PNG); pg.wait_for_timeout(600)
        im = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'image').map(r => ({w: r.w, h: r.h, png: r.src.startsWith('data:image/png')}))")
        check('рисунок вставляется на лист', len(im) == 1 and im[0]['w'] > 0 and im[0]['png'], im)
        # увеличить рисунок кнопкой +
        ib = pg.locator('.rg.image').bounding_box(); pg.mouse.click(ib['x'] + 10, ib['y'] + 10); pg.wait_for_timeout(200)
        pg.locator('#rbar button', has_text='+').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        w2 = pg.evaluate("MATLIST_DEBUG.S.regions.find(r => r.kind === 'image').w")
        check('кнопка + увеличивает рисунок', w2 > im[0]['w'], (im[0]['w'], w2))
        # сохранение с рисунком в .xmcd и обратно
        xml = pg.evaluate("MATLIST_DEBUG.saveXmcd().xml")
        check('рисунок попадает в .xmcd (binaryContent)', '<picture><png item-idref="1"' in xml and '<binaryContent>' in xml)
        # 2) график: тестовый лист, первый быстрый график
        pg.click('#bMenu'); pg.click('#mTest'); pg.wait_for_timeout(600)
        pg.evaluate("document.getElementById('sheetwrap').scrollTop = document.querySelectorAll('.rg.plot')[0].offsetTop * MATLIST_DEBUG.S.zoom - 20")
        pg.wait_for_timeout(200)
        pb = pg.locator('.rg.plot').first.bounding_box(); pg.mouse.click(pb['x'] + 60, pb['y'] + 60); pg.wait_for_timeout(500)
        check('панель графика открылась', pg.locator('#plotpanel.on').count() == 1)
        rid = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'plot')[0].id")
        R = lambda expr: pg.evaluate(f"(() => {{ const r = MATLIST_DEBUG.S.regions.find(r => r.id === {rid}); return {expr}; }})()")
        # вкладка «Оси»: подписи, формат
        pg.click('.ptabs [data-t=axes]'); pg.wait_for_timeout(100)
        check('клавиатура скрыта на вкладке «Оси»', pg.locator('#kbd.hide').count() == 1)
        pg.fill('#pxl', 'u, рад'); pg.fill('#pyl', 'Амплитуда'); pg.select_option('#pfy', 'fix'); pg.fill('#pdy', '1'); pg.wait_for_timeout(200)
        st = R("({xl: r.xlabel, yl: r.ylabel, fy: r.fy})")
        check('подписи и формат осей сохраняются', st['xl'] == 'u, рад' and st['yl'] == 'Амплитуда' and st['fy']['mode'] == 'fix' and st['fy']['d'] == 1, st)
        # вкладка «Легенда»: имя и цвет кривой
        pg.click('.ptabs [data-t=legend]'); pg.wait_for_timeout(150)
        rows = pg.locator('.srow').count(); check('строки легенды по числу кривых (2)', rows == 2, rows)
        pg.locator('.srow input[type=text]').first.fill('sin u / u'); pg.locator('.srow select').nth(1).select_option('dash'); pg.wait_for_timeout(150)
        st = R("r.st")
        check('легенда: имя и стиль кривой', st[0]['name'] == 'sin u / u' and st[0]['dash'] == 'dash', st)
        # жесты: сдвиг одним пальцем
        cv = pg.locator('.rg.plot canvas.live').first; cb = cv.bounding_box()
        check('холст графика в режиме жестов', cb is not None)
        def ptr(kind, pid, x, y):
            pg.evaluate(f"(() => {{ const c = document.querySelector('.rg.plot canvas.live'); c.dispatchEvent(new PointerEvent('{kind}', {{pointerId: {pid}, clientX: {x}, clientY: {y}, bubbles: true, pointerType: 'touch', isPrimary: {str(pid == 1).lower()}}})); }})()")
        cx, cy = cb['x'] + cb['width'] * 0.55, cb['y'] + cb['height'] * 0.45
        ptr('pointerdown', 1, cx, cy); ptr('pointermove', 1, cx - 60, cy); ptr('pointermove', 1, cx - 120, cy + 10); ptr('pointerup', 1, cx - 120, cy + 10)
        v = R("r.view"); check('сдвиг пальцем меняет вид', v is not None and v['x0'] > -10 + 1, v)
        # щипок: два пальца разводятся — масштаб растёт
        span0 = v['x1'] - v['x0']
        ptr('pointerdown', 1, cx - 30, cy); ptr('pointerdown', 2, cx + 30, cy)
        ptr('pointermove', 1, cx - 80, cy); ptr('pointermove', 2, cx + 80, cy)
        ptr('pointerup', 1, cx - 80, cy); ptr('pointerup', 2, cx + 80, cy)
        v2 = R("r.view"); check('щипок увеличивает масштаб', (v2['x1'] - v2['x0']) < span0 * 0.6, (span0, v2))
        # удержание — трассировка
        ptr('pointerdown', 1, cx, cy); pg.wait_for_timeout(600)
        check('удержание включает трассировку', R("!!r._trace"))
        pg.screenshot(path=f'{OUT}/pl_trace.png')
        ptr('pointerup', 1, cx, cy)
        # двойной тап — сброс
        ptr('pointerdown', 1, cx, cy); ptr('pointerup', 1, cx, cy); pg.wait_for_timeout(60); ptr('pointerdown', 1, cx, cy); ptr('pointerup', 1, cx, cy)
        check('двойной тап сбрасывает вид', R("r.view") is None)
        # подложка
        pg.click('.ptabs [data-t=bg]'); pg.wait_for_timeout(100)
        with pg.expect_file_chooser() as fc: pg.click('#pBgPick')
        fc.value.set_files(PNG); pg.wait_for_timeout(600)
        bg = R("r.bg && {x0: r.bg.x0, x1: r.bg.x1, y0: r.bg.y0, y1: r.bg.y1}")
        check('подложка ложится по осям', bg is not None and abs(bg['x0'] + 10) < 1e-6 and abs(bg['x1'] - 10) < 1e-6, bg)
        pg.fill('#pbx0', '-5'); pg.wait_for_timeout(100)
        check('край подложки задаётся числом', R("r.bg.x0") == -5)
        pg.check('#pBgFit')
        cb = pg.locator('.rg.plot canvas.live').first.bounding_box(); cx, cy = cb['x'] + cb['width'] * 0.5, cb['y'] + cb['height'] * 0.5
        ptr('pointerdown', 1, cx, cy); ptr('pointermove', 1, cx + 40, cy); ptr('pointerup', 1, cx + 40, cy)
        bg2 = R("({x0: r.bg.x0, view: r.view})")
        check('в режиме подгонки палец двигает подложку, а не вид', bg2['x0'] > -5 and bg2['view'] is None, bg2)
        ptr('pointerdown', 1, cx - 40, cy); ptr('pointerdown', 2, cx + 40, cy); ptr('pointermove', 2, cx + 120, cy); ptr('pointerup', 1, cx - 40, cy); ptr('pointerup', 2, cx + 120, cy)
        bg3 = R("({w: r.bg.x1 - r.bg.x0, h: r.bg.y1 - r.bg.y0})")
        check('щипок по горизонтали растягивает подложку только по X', bg3['w'] > (bg['x1'] - (-5)) * 1.3 and abs(bg3['h'] - (bg['y1'] - bg['y0'])) < 1e-9, (bg, bg3))
        pg.screenshot(path=f'{OUT}/pl_bg.png')
        # полный экран
        pg.click('#pFull'); pg.wait_for_timeout(400)
        check('полноэкранный просмотр', pg.locator('#full.on').count() == 1)
        pg.screenshot(path=f'{OUT}/pl_full.png')
        pg.click('#fullClose'); pg.click('#pDone'); pg.wait_for_timeout(300)
        check('панель закрыта, клавиатура вернулась', pg.locator('#plotpanel.on').count() == 0 and pg.locator('#kbd.hide').count() == 0)
        pg.screenshot(path=f'{OUT}/pl_done.png')
        check('без ошибок JS', not logs, logs)
        b.close()
finally: srv.terminate()
print('OK:', *ok, sep='\n  '); print('FAIL:', *bad, sep='\n  ')
