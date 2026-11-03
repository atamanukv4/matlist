"""Внешняя клавиатура и мышь, альбомная раскладка (клавиатура справа/слева), выбор единиц ответа из списка."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8786', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
SHEET = [r'p\coloneq 101.3\,\mathrm{kPa}', r'p=', r't\coloneq 7200\,\mathrm{s}', r't=']
def regs(pg): return pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').map(r => ({ id: r.id, latex: r.latex, res: r.res, err: r.err, x: r.x, y: r.y }))")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ── планшет боком, мышь и клавиатура ──
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8786/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(500)
        pg.evaluate("(L) => { const D = MATLIST_DEBUG; D.setSheet('Ввод', L.map((l, i) => ({ id: i + 1, kind: 'math', x: 16, y: 16 + i * 40, latex: l })), 380); D.recompute(); D.render(); }", SHEET)
        pg.wait_for_timeout(300)
        lay = pg.evaluate("(() => { const k = document.getElementById('kbd').getBoundingClientRect(), s = document.getElementById('sheetwrap').getBoundingClientRect(); return { kl: k.left, sl: s.left, kw: k.width }; })()")
        check('альбомная: клавиатура справа от листа', lay['kl'] > lay['sl'] and lay['kw'] > 300, lay)
        pg.locator('#kSide').dispatch_event('pointerdown'); pg.wait_for_timeout(300)
        lay2 = pg.evaluate("(() => { const k = document.getElementById('kbd').getBoundingClientRect(), s = document.getElementById('sheetwrap').getBoundingClientRect(); return { kl: k.left, sl: s.left }; })()")
        check('⇄ переносит клавиатуру влево', lay2['kl'] < lay2['sl'], lay2)
        pg.locator('#kSide').dispatch_event('pointerdown'); pg.wait_for_timeout(200)
        R = regs(pg)
        check('ответы по-русски: кПа → Па, с', 'Па' in (R[1]['res'] or '') and 'с' in (R[3]['res'] or ''), [r['res'] for r in R])
        # единицы ответа: ▾ у t= → «ч»
        ub = pg.locator('.rg .ubtn').nth(1); ub.click(); pg.wait_for_timeout(300)
        labels = pg.evaluate("[...document.querySelectorAll('#unitList button')].map(b => b.textContent)")
        check('список единиц времени', 'ч' in [l.strip() for l in labels] and 'сут' in [l.strip() for l in labels], labels[:12])
        pg.screenshot(path=f'{OUT}/in_units.png')
        pg.evaluate("[...document.querySelectorAll('#unitList button')].find(b => b.textContent.trim() === 'ч').click()"); pg.wait_for_timeout(400)
        R = regs(pg)
        check('t = 2 ч', R[3]['res'] and R[3]['res'].startswith('2') and 'ч' in R[3]['res'], R[3])
        pg.locator('.rg .ubtn').first.click(); pg.wait_for_timeout(300)
        pg.evaluate("[...document.querySelectorAll('#unitList button')].find(b => b.textContent.trim() === 'бар').click()"); pg.wait_for_timeout(400)
        R = regs(pg)
        check('p = 1.013 бар', R[1]['res'] and R[1]['res'].startswith('1.013') and 'бар' in R[1]['res'], R[1])
        # клавиатура: щелчок мышью по пустому месту, набор «a:2», Enter
        box = pg.locator('#page').bounding_box()
        pg.mouse.click(box['x'] + 30, box['y'] + 260); pg.wait_for_timeout(200)
        pg.keyboard.type('a:2'); pg.wait_for_timeout(200); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        R = regs(pg); last = R[-1]
        check('набор с клавиатуры создаёт формулу a := 2', last['latex'].replace(' ', '') in (r'a\coloneq2', r'a:=2'), last)
        pg.keyboard.type('a*3='); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        R = regs(pg); last = R[-1]
        check('a·3 = 6 (Enter переводит курсор вниз, следующая формула — сразу)', last['res'] == '6', last)
        snap0 = str(regs(pg)); pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
        check('Ctrl+Z отменяет последнее изменение', str(regs(pg)) != snap0, regs(pg)[-1])
        pg.keyboard.press('Control+y'); pg.wait_for_timeout(300)
        # стрелки двигают крестик
        c0 = pg.evaluate("({...MATLIST_DEBUG.S.cursor})"); pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowDown'); c1 = pg.evaluate("({...MATLIST_DEBUG.S.cursor})")
        check('стрелки двигают курсор-крестик', c1['x'] == c0['x'] + 12 and c1['y'] == c0['y'] + 12, (c0, c1))
        # правая кнопка по региону — меню; Delete удаляет
        el = pg.locator('.rg.math').last; bb = el.bounding_box()
        pg.mouse.click(bb['x'] + 5, bb['y'] + 5, button='right'); pg.wait_for_timeout(300)
        check('правая кнопка — меню региона', pg.evaluate("document.getElementById('rbar').style.display") == 'flex')
        n1 = len(regs(pg)); pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
        check('Delete удаляет выбранный регион', len(regs(pg)) == n1 - 1, len(regs(pg)))
        # перетаскивание мышью без удержания
        el = pg.locator('.rg.math').first; bb = el.bounding_box(); y0 = regs(pg)[0]['y']
        pg.mouse.move(bb['x'] + 5, bb['y'] + 5); pg.mouse.down(); pg.mouse.move(bb['x'] + 25, bb['y'] + 125, steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
        z = pg.evaluate("MATLIST_DEBUG.S.zoom")
        check('мышь перетаскивает регион (на 120 px экрана)', abs((regs(pg)[0]['y'] - y0) * z - 120) < 6, (y0, regs(pg)[0]['y'], z))
        # Ctrl+колесо — масштаб
        z0 = pg.evaluate("MATLIST_DEBUG.S.zoom"); pg.mouse.move(box['x'] + 200, box['y'] + 200); pg.keyboard.down('Control'); pg.mouse.wheel(0, -200); pg.keyboard.up('Control'); pg.wait_for_timeout(200)
        check('Ctrl+колесо увеличивает масштаб', pg.evaluate("MATLIST_DEBUG.S.zoom") > z0)
        pg.screenshot(path=f'{OUT}/in_tablet.png')
        check('нет ошибок JS', not logs, logs[:3])
        ctx.close()
        # ── телефон вертикально: раскладка прежняя ──
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        pg.goto('http://localhost:8786/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(400)
        lay = pg.evaluate("(() => { const k = document.getElementById('kbd').getBoundingClientRect(), s = document.getElementById('sheetwrap').getBoundingClientRect(); return { kt: k.top, sb: s.bottom, side: getComputedStyle(document.getElementById('kSide')).display }; })()")
        check('вертикально: клавиатура снизу, ⇄ скрыта', lay['kt'] >= lay['sb'] - 1 and lay['side'] == 'none', lay)
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + x) for x in ok]
print('FAIL:'); [print('  ' + x) for x in bad]
