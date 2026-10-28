"""Сохранение в .xmcd из приложения: скачивание файла и обратное открытие (лист ТГМП-314)."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets'); FIX = os.path.join(os.path.dirname(__file__), 'fixtures'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
ok, bad = [], []
def check(n, c, i=''): (ok if c else bad).append(n + ('' if c else f' :: {i}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = ctx.new_page(); logs = []; pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.goto('http://localhost:8771/index.html'); pg.wait_for_function('window.MATLIST_DEBUG !== undefined'); pg.wait_for_timeout(400)
        with pg.expect_file_chooser() as fc:
            pg.click('#bMenu'); pg.click('#mOpen')
        fc.value.set_files(os.path.join(FIX, 'tgmp.xmcd')); pg.wait_for_timeout(800)
        r1 = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.res).map(r => r.res)")
        with pg.expect_download() as dl:
            pg.click('#bMenu'); pg.click('#mSave')
        path = os.path.join(OUT, 'tgmp_saved.xmcd'); dl.value.save_as(path)
        check('файл скачивается с именем листа', dl.value.suggested_filename == 'tgmp.xmcd', dl.value.suggested_filename)
        with pg.expect_file_chooser() as fc:
            pg.click('#bMenu'); pg.click('#mOpen')
        fc.value.set_files(path); pg.wait_for_timeout(800)
        r2 = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.res).map(r => r.res)")
        st = pg.evaluate("({ n: MATLIST_DEBUG.S.regions.length, dec: MATLIST_DEBUG.S.fmt.decimals, thr: MATLIST_DEBUG.S.fmt.expThreshold, org: MATLIST_DEBUG.S.origin })")
        check('после сохранения и открытия те же результаты', r1 == r2 and len(r1) == 3, (r1, r2))
        check('настройки листа сохранены (4 знака, порог 5, ORIGIN 1)', st['dec'] == 4 and st['thr'] == 5 and st['org'] == 1, st)
        check('все 24 региона на месте', st['n'] == 24, st)
        check('без ошибок JS', not logs, logs)
        b.close()
finally: srv.terminate()
print('OK:', *ok, sep='\n  '); print('FAIL:', *bad, sep='\n  ')
