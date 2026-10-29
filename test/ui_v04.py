"""Матлист 0.4: клавиатура, перенос удержанием с автопрокруткой, меню на пустом месте, текст, подсветка, «→», WSP, Word/PDF."""
import json, sys, subprocess, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
ok = []; bad = []
def check(name, cond, info=''):
    (ok if cond else bad).append(name + ('' if cond else f' :: {info}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.goto('http://localhost:8771/index.html')
        pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        pg.click('#bMenu'); pg.click('#mTest'); pg.wait_for_timeout(1500)
        cdp = ctx.new_cdp_session(pg)
        def touch(kind, x, y):
            pts = [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]
            cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})
        def long_drag(x0, y0, x1, y1, steps=12, hold=0.6, end_hold=0.0):
            touch('touchStart', x0, y0); pg.wait_for_timeout(int(hold * 1000))
            for k in range(1, steps + 1):
                touch('touchMove', x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps); pg.wait_for_timeout(30)
            if end_hold: pg.wait_for_timeout(int(end_hold * 1000))
            touch('touchEnd', x1, y1); pg.wait_for_timeout(400)
        regs = lambda: pg.evaluate('MATLIST_DEBUG.S.regions.map(r => ({id: r.id, kind: r.kind, latex: r.latex, text: r.text, res: r.res, err: r.err, x: r.x, y: r.y, hl: r.hl}))')
        R = regs()
        # WSP и «→» на тестовом листе
        find = lambda key: next((r for r in R if r.get('latex') and key in r['latex']), None)
        h0 = find('wspHPT'); xk = find('wspXPH'); g = find('wspgHGST'); ar = find('coloneq\\frac{3}{4}'); ar2 = find('}}+1=')
        check('wspHPT на листе', h0 and not h0['err'] and h0['res'] and h0['res'].startswith('3.4'), h0)
        check('wspXPH (степень сухости)', xk and not xk['err'], xk)
        check('газы wspgHGST', g and not g['err'], g)
        check('«→» показывает значение', ar and ar['res'] == '6' and not ar['err'], ar)
        check('«→» наследуется', ar2 and ar2['res'] == '7', ar2)
        check('подсветка из листа', ar and ar['hl'] == '#fff59d', ar)
        errs = [r for r in R if r.get('err')]
        check('тестовый лист без ошибок', not errs, errs[:3])
        # клавиатура: спрятать и вернуть
        h_before = pg.evaluate("document.getElementById('sheetwrap').clientHeight")
        pg.locator('#kHide').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        h_after = pg.evaluate("document.getElementById('sheetwrap').clientHeight")
        check('клавиатура сворачивается — лист выше', h_after > h_before + 150 and pg.locator('#kShow').is_visible(), (h_before, h_after))
        pg.screenshot(path=f'{OUT}/v1_nokbd.png')
        pg.click('#kShow'); pg.wait_for_timeout(300)
        check('клавиатура возвращается', pg.locator('#kbd').is_visible() and not pg.locator('#kShow').is_visible())
        # перенос удержанием: «k1+1=» выше определения k1 → ошибка; обратно → снова 7
        pg.locator('#kHide').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        def el_box(rid):
            pg.evaluate(f"document.querySelector('[data-id=\"{rid}\"]').scrollIntoView({{block:'center'}})"); pg.wait_for_timeout(200)
            return pg.locator(f'[data-id="{rid}"]').bounding_box()
        bx = el_box(ar2['id']); ba = pg.locator(f'[data-id="{ar["id"]}"]').bounding_box()
        long_drag(bx['x'] + 8, bx['y'] + bx['height'] / 2, ba['x'] + 160, ba['y'] - 6)
        R2 = {r['id']: r for r in regs()}
        moved = R2[ar2['id']]
        check('перенос на большое расстояние (не на пару пикселей)', moved['y'] < ar['y'], (ar['y'], moved['y']))
        check('после переноса выше определения — ошибка (порядок вычисления)', bool(moved['err']), moved)
        pg.screenshot(path=f'{OUT}/v2_moved_up.png')
        bx = el_box(ar2['id']); ba = pg.locator(f'[data-id="{ar["id"]}"]').bounding_box()
        long_drag(bx['x'] + 8, bx['y'] + bx['height'] / 2, ba['x'] + 8, ba['y'] + ba['height'] + 30)
        R3 = {r['id']: r for r in regs()}
        check('перенос обратно — значение снова 7', R3[ar2['id']]['res'] == '7' and not R3[ar2['id']]['err'], R3[ar2['id']])
        # перенос картинки/формулы к нижнему краю: лист прокручивается сам
        top = el_box(h0['id'])
        st0 = pg.evaluate("document.getElementById('sheetwrap').scrollTop")
        wrapb = pg.locator('#sheetwrap').bounding_box()
        long_drag(top['x'] + 8, top['y'] + top['height'] / 2, top['x'] + 8, wrapb['y'] + wrapb['height'] - 8, steps=10, end_hold=1.2)
        st1 = pg.evaluate("document.getElementById('sheetwrap').scrollTop")
        y1 = {r['id']: r for r in regs()}[h0['id']]['y']
        check('автопрокрутка при переносе к краю', st1 > st0 + 200 and y1 > h0['y'] + 300, (st0, st1, h0['y'], y1))
        # удержание без движения → меню региона
        bb = el_box(ar['id'])
        touch('touchStart', bb['x'] + 6, bb['y'] + bb['height'] / 2); pg.wait_for_timeout(650); touch('touchEnd', bb['x'] + 6, bb['y'] + bb['height'] / 2); pg.wait_for_timeout(300)
        labels = pg.evaluate("[...document.querySelectorAll('#rbar button')].map(b => b.textContent)")
        check('удержание на формуле — меню', 'Цвет' in labels and 'Удалить' in labels, labels)
        # подсветка: выбрать зелёный
        pg.locator('#rbar button', has_text='Цвет').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        pg.locator('#rbar .sw').nth(2).dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        hl = {r['id']: r for r in regs()}[ar['id']]['hl']
        bg = pg.evaluate(f"getComputedStyle(document.querySelector('[data-id=\"{ar['id']}\"]')).backgroundColor")
        check('подсветка выбирается и видна', hl == '#c8f0c4' and bg.replace(' ', '') == 'rgb(200,240,196)', (hl, bg))
        pg.screenshot(path=f'{OUT}/v3_hl.png')
        # удержание на пустом месте → меню
        wb = pg.locator('#sheetwrap').bounding_box()
        ex, ey = wb['x'] + 330, wb['y'] + 40
        free = pg.evaluate(f"!document.elementFromPoint({ex}, {ey}).closest('.rg')")
        touch('touchStart', ex, ey); pg.wait_for_timeout(650); touch('touchEnd', ex, ey); pg.wait_for_timeout(300)
        labels = pg.evaluate("[...document.querySelectorAll('#rbar button')].map(b => b.textContent)")
        check('удержание на пустом месте — меню', free and 'Формула' in labels and 'Текст' in labels and '+ строка' in labels, (free, labels))
        pg.screenshot(path=f'{OUT}/v4_ctx.png')
        n_before = pg.evaluate('MATLIST_DEBUG.S.regions.length')
        pg.locator('#rbar button', has_text='Текст').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        check('из меню создаётся текст', pg.evaluate("[...document.querySelectorAll('.rg.text')].filter(e => e.contentEditable === 'true').length") == 1 and pg.evaluate('MATLIST_DEBUG.S.regions.length') == n_before + 1)
        pg.keyboard.type('Привет'); pg.wait_for_timeout(100)
        # системная клавиатура = смена размера окна: правка текста не должна сбрасываться
        pg.set_viewport_size({'width': 390, 'height': 460}); pg.wait_for_timeout(400)
        still = pg.evaluate("(() => { const el = document.querySelector('[contenteditable=true]'); return !!el && document.activeElement === el; })()")
        pg.keyboard.type(' мир'); pg.wait_for_timeout(100)
        pg.set_viewport_size({'width': 390, 'height': 760}); pg.wait_for_timeout(300)
        txt = pg.evaluate("(document.querySelector('[contenteditable=true]') || {}).innerText")
        check('текст правится при открытой системной клавиатуре', still and txt == 'Привет мир', (still, txt))
        pg.mouse.click(wb['x'] + 300, wb['y'] + 200); pg.wait_for_timeout(300)
        # правка существующего текста: курсор в месте касания
        tr = next(r for r in regs() if r['kind'] == 'text' and r['text'] == 'Привет мир')
        tb = el_box(tr['id'])
        pg.mouse.click(tb['x'] + 4, tb['y'] + tb['height'] / 2); pg.wait_for_timeout(300)
        pg.keyboard.type('>'); pg.wait_for_timeout(100)
        pg.mouse.click(wb['x'] + 300, wb['y'] + 200); pg.wait_for_timeout(300)
        tr2 = {r['id']: r for r in regs()}[tr['id']]
        check('курсор ставится туда, куда коснулись', tr2['text'].startswith('>') or tr2['text'].startswith('П>'), tr2['text'])
        # клавиша «→»
        cls = pg.evaluate('document.body.className')
        check('после правки текста кнопка клавиатуры доступна', pg.locator('#kShow').is_visible() or pg.locator('#kbd').is_visible(), cls)
        pg.evaluate('MATLIST_DEBUG.setKbd(true)'); pg.wait_for_timeout(200)
        pg.click('#bMenu'); pg.click('#mNew'); pg.wait_for_timeout(300)
        pg.mouse.click(wb['x'] + 30, wb['y'] + 30); pg.wait_for_timeout(200)
        pg.evaluate("MATLIST_DEBUG.press('123', '2'); MATLIST_DEBUG.press('123', '+'); MATLIST_DEBUG.press('123', '3'); MATLIST_DEBUG.press('∫Σ', '→')"); pg.wait_for_timeout(400)
        ar3 = next((r for r in regs() if r.get('latex') and r['latex'].startswith('2+3')), None)
        check('клавиша «→» вычисляет', ar3 and ar3['res'] == '5', ar3)
        # вкладка WSP
        pg.locator('.tabs button', has_text='WSP').dispatch_event('pointerdown'); pg.wait_for_timeout(150)
        check('вкладка WSP на клавиатуре', pg.locator('#keys button.wsp').count() >= 24)
        pg.screenshot(path=f'{OUT}/v5_wsp_tab.png')
        # Word и PDF — по тестовому листу
        pg.click('#bMenu'); pg.click('#mTest'); pg.wait_for_timeout(1500)
        with pg.expect_download() as dl:
            pg.evaluate('MATLIST_DEBUG.saveDocx()')
        dpath = os.path.join(OUT, 'test.docx'); dl.value.save_as(dpath)
        check('сохраняется .docx', os.path.getsize(dpath) > 2000, os.path.getsize(dpath))
        # PDF: HTML для печати
        html = pg.evaluate('MATLIST_DEBUG.printSheetHtml()')
        open(os.path.join(OUT, 'print.html'), 'w').write(html)
        pp = ctx.new_page(); pp.set_content(html); pp.wait_for_timeout(1200)
        pp.pdf(path=os.path.join(OUT, 'test.pdf'), format='A4', print_background=True)
        check('PDF собирается', os.path.getsize(os.path.join(OUT, 'test.pdf')) > 20000)
        check('нет ошибок JS', not logs, logs)
        b.close()
finally:
    srv.terminate()
print('OK:', *ok, sep='\n  ')
print('FAIL:', *bad, sep='\n  ')
