"""Матлист 0.6: развёртывание .md в лист, раскладка без наложений, сохранение в .xmcd."""
import json, sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
MD = open(os.path.join(os.path.dirname(__file__), 'md', 'sample.md'), encoding='utf8').read()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8776', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8); ok = []; bad = []
def check(name, cond, info=''): (ok if cond else bad).append(name + ('' if cond else f' :: {info}'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.goto('http://localhost:8776/index.html')
        pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        pg.evaluate('([n, t]) => window.MATLIST_OPEN_TEXT(n, t)', ['Задача.md', MD]); pg.wait_for_timeout(1200)
        R = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => ({id: r.id, kind: r.kind, latex: r.latex, res: r.res, err: r.err, noeval: !!r.noeval, text: r.text}))')
        check('имя листа', pg.evaluate('MATLIST_DEBUG.S.name') == 'Задача', pg.evaluate('MATLIST_DEBUG.S.name'))
        errs = [r for r in R if r['kind'] == 'math' and r['err']]
        check('нет ошибок', not errs, errs)
        q = next((r for r in R if r.get('latex', '') and r['latex'].startswith('q\\coloneq')), None)
        check('q = 84', q and q['res'] == '84', q)
        boxes = pg.evaluate('''[...document.querySelectorAll('#page .rg')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, e.dataset.id]; })''')
        ov = [(a[4], c[4]) for i, a in enumerate(boxes) for c in boxes[i + 1:] if a[0] < c[2] - 1 and c[0] < a[2] - 1 and a[1] < c[3] - 1 and c[1] < a[3] - 1]
        check('регионы не накладываются', not ov, ov)
        pg.screenshot(path=os.path.join(OUT, 'md_top.png'))
        pg.evaluate("document.querySelector('#sheetwrap').scrollTop = 420"); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, 'md_bottom.png'))
        xml = pg.evaluate('(() => { const S = MATLIST_DEBUG.S; return MatXmcd.exportXmcd(S.regions, { title: S.name }, MatEngine.parse); })()')
        x = xml['xml'] if isinstance(xml, dict) else xml
        check('экспорт .xmcd', '<worksheet' in x and 'disable-calc="true"' in x, x[:200])
        open(os.path.join(OUT, 'md_sheet.xmcd'), 'w', encoding='utf8').write(x)
        W = open(os.path.join(os.path.dirname(__file__), 'md', 'water.md'), encoding='utf8').read()
        pg.evaluate('([n, t]) => window.MATLIST_OPEN_TEXT(n, t)', ['water.md', W]); pg.wait_for_timeout(1200)
        R = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => ({kind: r.kind, latex: r.latex, res: r.res, err: r.err, x: r.x}))')
        g = [r for r in R if r['kind'] == 'math' and (r['latex'] or '').startswith('G\\coloneq \\frac{Q}')]
        check('где-данные подняты над формулой', g and g[0]['res'] == '5.967' and not g[0]['err'], g)
        boxes = pg.evaluate('''[...document.querySelectorAll('#page .rg')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, e.dataset.id]; })''')
        ov = [(a[4], c[4]) for i, a in enumerate(boxes) for c in boxes[i + 1:] if a[0] < c[2] - 1 and c[0] < a[2] - 1 and a[1] < c[3] - 1 and c[1] < a[3] - 1]
        check('water: без наложений', not ov, ov)
        check('water: в ширину страницы', max(bx[2] for bx in boxes) < 390, max(bx[2] for bx in boxes))
        pg.screenshot(path=os.path.join(OUT, 'md_water.png'))
        check('без ошибок страницы', not logs, logs)
        b.close()
finally:
    srv.terminate()
print('OK:', *ok, sep='\n  ')
print('FAIL:', *bad, sep='\n  ')
