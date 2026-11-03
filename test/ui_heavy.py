"""Матлист: тяжёлый лист (вложенные интегралы) не вешает интерфейс — досчитывается в фоне; «Стоп» прерывает.
python3 test/ui_heavy.py <папка для снимков> [файл.xmcd]  (по умолчанию corpus/user/курсовая.xmcd; нет файла — тест пропускается)"""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
F = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].endswith('.xmcd') else os.path.join(os.path.dirname(__file__), '..', 'corpus', 'user', 'курсовая.xmcd')
if not os.path.exists(F):
    print('OK:\nFAIL:\n(нет файла', F, '— пропуск)'); sys.exit(0)
XML = open(F, encoding='utf8').read()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8779', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8); ok = []; bad = []
def check(name, cond, info=''): (ok if cond else bad).append(name + ('' if cond else f' :: {info}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.goto('http://localhost:8779/index.html')
        pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        t0 = time.time()
        pg.evaluate('([n, t]) => { window.MATLIST_OPEN_TEXT(n, t); }', [os.path.basename(F), XML])
        opened = time.time() - t0
        check('лист открылся быстро (интерфейс не завис)', opened < 5, f'{opened:.1f} c')
        # интерфейс отвечает, пока идёт счёт
        t1 = time.time(); pg.evaluate('1 + 1'); resp = time.time() - t1
        check('интерфейс отвечает во время счёта', resp < 1, f'{resp:.2f} c')
        busy = pg.evaluate("!!document.querySelector('#busy.on')")
        pend = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.pending).length")
        check('есть плашка «Считается…» и формулы в очереди', busy and pend > 0, f'busy={busy} pending={pend}')
        pg.screenshot(path=os.path.join(OUT, 'heavy_busy.png'))
        # дождаться окончания (до 4 минут)
        pg.wait_for_function("!MATLIST_DEBUG.S.regions.some(r => r.pending)", timeout=240000, polling=1000)
        total = time.time() - t0
        R = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math' && r.stored != null && typeof r.stored === 'number' && /int/.test(r.latex || '')).map(r => ({ latex: r.latex.slice(0, 40), res: r.res, err: r.err, stored: r.stored }))")
        def num(s):
            import re
            if not s: return None
            m = re.match(r'^-?[0-9.]+(?:\\times10\^\{(-?\d+)\})?', s.replace('−', '-'))
            if not m: return None
            v = float(re.match(r'^-?[0-9.]+', s).group(0)); return v * (10 ** int(m.group(1))) if m.group(1) else v
        bad_int = [r for r in R if r['err'] or num(r['res']) is None or abs(num(r['res']) - r['stored']) > 2e-3 * max(1, abs(r['stored']))]
        check('интегралы посчитаны и совпадают с Mathcad (3 знака)', R and not bad_int, bad_int[:3])
        check('фоновый счёт закончился за разумное время', total < 240, f'{total:.0f} c')
        print('всего, с:', round(total))
        pg.evaluate("document.querySelector('#sheetwrap').scrollTop = 0"); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, 'heavy_done.png'))
        # «Стоп»: пересчитать и сразу остановить
        pg.evaluate("document.querySelector('#bRecalc').click()"); pg.wait_for_timeout(500)
        if pg.evaluate("!!document.querySelector('#busy.on')"):
            pg.evaluate("document.querySelector('#busy button').click()"); pg.wait_for_timeout(300)
            st = pg.evaluate("({ busy: !!document.querySelector('#busy.on'), pend: MATLIST_DEBUG.S.regions.filter(r => r.pending).length, stopped: MATLIST_DEBUG.S.regions.filter(r => r.err === 'Пересчёт остановлен').length })")
            check('«Стоп» прерывает счёт', not st['busy'] and st['pend'] == 0 and st['stopped'] > 0, st)
        check('нет ошибок страницы', not logs, logs[:3])
        b.close()
finally:
    srv.terminate()
print('OK:'); [print('  ' + x) for x in ok]
print('FAIL:'); [print('  ' + x) for x in bad]
