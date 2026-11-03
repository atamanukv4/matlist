"""Рукописный ввод дробных и многозначных чисел: «4.2 =», «4,2 =», «12.5 =» — модель распознаёт штрихи, лист считает."""
import sys, subprocess, time, os, math
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
if not os.path.exists(os.path.join(ROOT, 'model', 'vocab.txt')):
    print('OK:\nFAIL:\n(нет модели — пропуск)'); sys.exit(0)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8782', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8); ok = []; bad = []
def check(name, cond, info=''): (ok if cond else bad).append(name + ('' if cond else f' :: {info}'))
def arc(cx, cy, r, a0, a1, n=14): return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
def four(x): return [[(x + 14, 28), (x, 58), (x + 26, 58)], [(x + 18, 40), (x + 18, 72)]]
def two(x): return [arc(x + 16, 40, 16, math.pi * 1.1, math.pi * 2.15) + [(x, 72), (x + 34, 72)]]
def one(x): return [[(x, 36), (x + 10, 28), (x + 10, 72)]]
def five(x): return [[(x + 26, 28), (x + 4, 28), (x + 2, 48)] + arc(x + 14, 58, 14, math.pi * 1.25, math.pi * 2.75), ]
def dot(x): return [[(x, 71), (x + 1, 72)]]
def comma(x): return [[(x + 1, 68), (x + 2, 74), (x - 2, 80)]]
def eq(x): return [[(x, 46), (x + 26, 46)], [(x, 58), (x + 26, 58)]]
CASES = [('4.2', four(10) + dot(46) + two(58) + eq(110), 4.2), ('4,2', four(10) + comma(46) + two(58) + eq(110), 4.2), ('12.5', one(10) + two(30) + dot(72) + five(84) + eq(134), 12.5)]
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8782/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        cdp = ctx.new_cdp_session(pg)
        for name, S, want in CASES:
            pg.evaluate("MATLIST_DEBUG.inkOpen()"); pg.wait_for_timeout(300)
            pg.evaluate("MATLIST_DEBUG.ink.cands = []")
            box = pg.evaluate("(() => { const b = document.getElementById('inkCv').getBoundingClientRect(); return [b.left, b.top]; })()")
            for st in S:
                pts = [(box[0] + 20 + x, box[1] + 30 + y) for x, y in st]
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pts[0][0], 'y': pts[0][1], 'id': 1}]})
                for x, y in pts[1:]: cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'id': 1}]})
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(40)
            pg.wait_for_function("MATLIST_DEBUG.ink.cands.length > 0", timeout=30000)
            cands = pg.evaluate("MATLIST_DEBUG.ink.cands.map(c => c.latex)")
            pg.screenshot(path=f'{OUT}/ink_{name}.png')
            pg.evaluate("MATLIST_DEBUG.S.cursor = {x: 20, y: 40 + MATLIST_DEBUG.S.regions.length * 40}"); pg.click('#inkOk'); pg.wait_for_timeout(600)
            last = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').slice(-1).map(r => [r.latex, r.res, r.err])[0]")
            check(f'«{name} =» распознано и посчитано', last and not last[2] and last[1] and abs(float(last[1]) - want) < 1e-9, (cands[:3], last))
            pg.evaluate("MATLIST_DEBUG.inkClose()"); pg.wait_for_timeout(200)
        check('нет ошибок JS', not logs, logs[:3])
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + x) for x in ok]
print('FAIL:'); [print('  ' + x) for x in bad]
