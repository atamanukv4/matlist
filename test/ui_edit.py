"""Редактирование формулы в тёмной теме телефона: цвета, курсор по касанию, живой результат, навигация."""
import json, sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for scheme in ['dark', 'light']:
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=scheme)
            pg = ctx.new_page(); logs = []
            pg.on('pageerror', lambda e: logs.append(str(e)))
            pg.goto('http://localhost:8767/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(700)
            # формула c := a·b + √b = — тап в её начало
            el = pg.locator('.rg.math', has_text='12').first; bb = el.bounding_box()
            pg.mouse.click(bb['x'] + 4, bb['y'] + bb['height'] / 2); pg.wait_for_timeout(600)
            mf = pg.locator('.rg.editing math-field')
            check(f'[{scheme}] редактор открыт', mf.count() == 1)
            st = pg.evaluate("""() => { const mf = document.querySelector('.rg.editing math-field'); const cs = getComputedStyle(mf);
                return { color: cs.color, bg: cs.backgroundColor, selColor: cs.getPropertyValue('--selection-color').trim(), pos: mf.position, last: mf.lastOffset,
                         live: document.querySelector('.rg.editing .live').textContent } }""")
            check(f'[{scheme}] текст тёмный на белом', st['color'] in ('rgb(29, 35, 48)',) and st['bg'] == 'rgb(255, 255, 255)', st)
            check(f'[{scheme}] курсор у места касания, не в конце', st['pos'] < st['last'] and st['pos'] <= 2, st)
            check(f'[{scheme}] живой результат виден', '12' in st['live'], st)
            pg.screenshot(path=f'{OUT}/e_{scheme}_1_open.png')
            # выделение «выдел.» дважды из конца: текст должен остаться тёмным
            pg.locator('#kEnd').dispatch_event('pointerdown'); pg.wait_for_timeout(100)
            for _ in range(3): pg.locator('#kSel').dispatch_event('pointerdown'); pg.wait_for_timeout(80)
            pg.wait_for_timeout(200)
            sel = pg.evaluate("document.querySelector('.rg.editing math-field').selectionIsCollapsed")
            check(f'[{scheme}] выделение работает', sel is False, sel)
            pg.screenshot(path=f'{OUT}/e_{scheme}_2_select.png')
            # правка: ⇥, стереть «=», дописать ·2 = → живой результат 20
            pg.locator('#kEnd').dispatch_event('pointerdown'); pg.locator('#kDel').dispatch_event('pointerdown'); pg.wait_for_timeout(80)
            pg.locator('#keys button', has_text='×').first.dispatch_event('pointerdown'); pg.locator('#keys button', has_text='2').first.dispatch_event('pointerdown')
            pg.wait_for_timeout(400)
            live = pg.evaluate("document.querySelector('.rg.editing .live').textContent")
            check(f'[{scheme}] живой результат обновляется при наборе', live.strip() != '', live)
            pg.locator('#kEq').dispatch_event('pointerdown'); pg.wait_for_timeout(400)
            res = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.res).map(r => r.latex + ' → ' + r.res)[0]")
            check(f'[{scheme}] после «=» сохранено', 'cdot2' in res.replace(' ', '') or '\\cdot 2' in res, res)
            pg.screenshot(path=f'{OUT}/e_{scheme}_3_done.png')
            # ↑ ↓ в дроби: открыть дробь, ↓ переходит в знаменатель
            el = pg.locator('.rg.math', has_text='4.45').first; bb = el.bounding_box()
            pg.mouse.click(bb['x'] + 30, bb['y'] + 8); pg.wait_for_timeout(500)
            pg.locator('#kDown').dispatch_event('pointerdown'); pg.wait_for_timeout(100)
            pg.locator('#keys button', has_text='1').first.dispatch_event('pointerdown'); pg.wait_for_timeout(100)
            lx = pg.evaluate("document.querySelector('.rg.editing math-field').getValue('latex')")
            check(f'[{scheme}] ↓ ведёт в знаменатель', '}{1' in lx or '}{2' in lx and '1' in lx.split('}{', 1)[1], lx)
            check(f'[{scheme}] без ошибок JS', not logs, logs)
            ctx.close()
        b.close()
finally: srv.terminate()
print('OK:', *ok, sep='\n  '); print('FAIL:', *bad, sep='\n  ')
