"""Проверка пробной версии в Chromium с экраном телефона: ошибки консоли, ошибки регионов, скриншоты."""
import json, sys, subprocess, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.goto('http://localhost:8765/index.html')
        pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        pg.wait_for_timeout(1200)
        info = pg.evaluate('''() => { const S = MATLIST_DEBUG.S; return {
            n: S.regions.length,
            errs: S.regions.filter(r => r.err).map(r => [r.latex, r.err]),
            results: S.regions.filter(r => r.res).map(r => [r.latex.slice(0, 50), r.res.slice(0, 60)]),
            zoom: S.zoom } }''')
        print(json.dumps(info, ensure_ascii=False, indent=1))
        pg.screenshot(path=f'{OUT}/01_top.png')
        wrap = pg.locator('#sheetwrap')
        h = pg.evaluate('document.getElementById("sheetwrap").scrollHeight')
        k = 2
        for y in range(600, h, 600):
            pg.evaluate(f'document.getElementById("sheetwrap").scrollTop = {y}')
            pg.wait_for_timeout(250)
            pg.screenshot(path=f'{OUT}/{k:02d}_scroll.png'); k += 1
        print('LOGS', json.dumps(logs, ensure_ascii=False, indent=1))
        b.close()
finally:
    srv.terminate()
