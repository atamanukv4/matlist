"""Матлист 0.5: единицы измерения, справка WSP, панель региона не закрывает формулу, рукописный ввод, графики из .xmcd."""
import json, sys, subprocess, time, os, math
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist', 'apk-assets')
FIX = os.path.join(os.path.dirname(__file__), 'fixtures')
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8775', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
ok = []; bad = []
def check(name, cond, info=''):
    (ok if cond else bad).append(name + ('' if cond else f' :: {info}'))
def arc(cx, cy, r, a0, a1, n=14): return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.goto('http://localhost:8775/index.html')
        pg.wait_for_function('window.MATLIST_DEBUG !== undefined', timeout=15000)
        pg.click('#bMenu'); pg.click('#mTest'); pg.wait_for_timeout(1500)
        R = pg.evaluate('MATLIST_DEBUG.S.regions.map(r => ({id: r.id, kind: r.kind, latex: r.latex, res: r.res, err: r.err, y: r.y}))')
        find = lambda key: next((r for r in R if r.get('latex') and key in r['latex']), None)
        q1 = find('Q_{\\mathrm{в}}\\coloneq'); q2 = find('Q_{\\mathrm{в}}=\\left['); tv = find('t_{\\mathrm{в}}'); vv = find('v_{\\mathrm{в}}')
        check('Q в СИ: 4,19·10⁵ J', q1 and not q1['err'] and q1['res'] == '4.19\\times10^{5}\\,\\mathrm{J}', q1)
        check('Q в kJ: 419 kJ', q2 and q2['res'] == '419\\,\\mathrm{kJ}', q2)
        check('293,15 K = 20 °C', tv and tv['res'] == '20\\,°C', tv)
        check('100 km / 1,5 hr в м/с', vv and vv['res'] and vv['res'].startswith('18.519'), vv)
        # в самой формуле «[kJ]» не показывается — единицы стоят после результата
        eqtxt = pg.evaluate(f"document.querySelector('[data-id=\"{q2['id']}\"] .eq').textContent") if q2 else ''
        check('единицы вывода не дублируются в формуле', 'kJ' not in eqtxt, eqtxt)
        # клавиатура «ед.»
        pg.evaluate("MATLIST_DEBUG.S.cursor = {x: 20, y: 30}; MATLIST_DEBUG.commit(false)")
        pg.evaluate("MATLIST_DEBUG.ensureTarget(); MATLIST_DEBUG.press('123', '5'); MATLIST_DEBUG.press('ед.', 'kg')")
        lt = pg.evaluate("MATLIST_DEBUG.S.regions.slice(-1)[0].latex || ''")
        check('клавиша kg вставляет единицу', '\\mathrm{kg}' in lt, lt)
        pg.evaluate("MATLIST_DEBUG.commit(false)")
        # справка WSP
        pg.evaluate("MATLIST_DEBUG.openWspHelp()"); pg.wait_for_timeout(300)
        n_all = pg.evaluate("document.querySelectorAll('#wspList .wi').length")
        pg.fill('#wspQ', 'вязкость'); pg.wait_for_timeout(200)
        items = pg.evaluate("[...document.querySelectorAll('#wspList .wi')].map(e => e.textContent).slice(0, 3)")
        check('справка WSP: список функций', n_all > 200, n_all)
        check('поиск по описанию', len(items) > 0 and all('вязкост' in t for t in items), items)
        pg.screenshot(path=f'{OUT}/v5_wsp.png')
        pg.fill('#wspQ', 'wspHPT'); pg.wait_for_timeout(200)
        info = pg.evaluate("document.querySelector('#wspList .wi').textContent")
        check('wspHPT: энтальпия, Дж/кг, пределы IF-97', 'энтальпия' in info and 'Дж/кг' in info and '1073,15' in info, info)
        pg.evaluate("MATLIST_DEBUG.S.cursor = {x: 20, y: 30}"); pg.click('#wspList .wi'); pg.wait_for_timeout(300)
        lt = pg.evaluate("MATLIST_DEBUG.S.regions.slice(-1)[0].latex || ''")
        check('выбор в справке вставляет функцию', 'wspHPT' in lt, lt)
        pg.evaluate("MATLIST_DEBUG.commit(false)")
        # панель действий не закрывает формулу: формула у верхнего края и в середине экрана
        for key in ['c\\coloneq', 'h_{\\mathrm{0}}\\coloneq']:
            r = find(key)
            pg.evaluate(f"(() => {{ const el = document.querySelector('[data-id=\"{r['id']}\"]'); el.scrollIntoView({{block: 'start'}}); }})()"); pg.wait_for_timeout(300)
            pg.evaluate(f"MATLIST_DEBUG.activate && MATLIST_DEBUG.activate(MATLIST_DEBUG.S.regions.find(x => x.id === {r['id']}))"); pg.wait_for_timeout(700)
            rr = pg.evaluate(f"(() => {{ const a = document.querySelector('[data-id=\"{r['id']}\"]').getBoundingClientRect(), b = document.getElementById('rbar').getBoundingClientRect(); return {{a: [a.left, a.top, a.right, a.bottom], b: [b.left, b.top, b.right, b.bottom], vis: getComputedStyle(document.getElementById('rbar')).display}}; }})()")
            a, bb = rr['a'], rr['b']; inter = not (bb[2] <= a[0] or bb[0] >= a[2] or bb[3] <= a[1] + 0.5 or bb[1] >= a[3] - 0.5)
            check('панель не закрывает формулу ' + key[:10], rr['vis'] != 'none' and not inter, rr)
            pg.screenshot(path=f'{OUT}/v5_bar_{key[:2]}.png')
            pg.evaluate("MATLIST_DEBUG.commit(false)")
        # рукописный ввод: «2+3=»
        two = arc(40, 40, 16, math.pi * 1.1, math.pi * 2.15) + [(24, 72), (58, 72)]
        S = [two, [(80, 56), (108, 56)], [(94, 42), (94, 70)], arc(140, 44, 13, math.pi * 1.15, math.pi * 2.45) + arc(140, 62, 14, math.pi * 1.55, math.pi * 2.85), [(180, 52), (206, 52)], [(180, 62), (206, 62)]]
        pg.evaluate("MATLIST_DEBUG.inkOpen()"); pg.wait_for_timeout(300)
        # штрихи пальцем по холсту
        box = pg.evaluate("(() => { const b = document.getElementById('inkCv').getBoundingClientRect(); return [b.left, b.top]; })()")
        cdp = ctx.new_cdp_session(pg)
        for st in S:
            pts = [(box[0] + 20 + x, box[1] + 30 + y) for x, y in st]
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pts[0][0], 'y': pts[0][1], 'id': 1}]})
            for x, y in pts[1:]: cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'id': 1}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(60)
        pg.wait_for_function("MATLIST_DEBUG.ink.cands.length > 0", timeout=30000)
        cands = pg.evaluate("MATLIST_DEBUG.ink.cands.map(c => c.latex)")
        check('распознано «2 + 3 =»', cands and cands[0].replace(' ', '') == '2+3=', cands)
        pg.screenshot(path=f'{OUT}/v5_ink.png')
        pg.evaluate("MATLIST_DEBUG.S.cursor = {x: 20, y: 40}"); pg.click('#inkOk'); pg.wait_for_timeout(600)
        last = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'math').slice(-1).map(r => [r.latex, r.res, r.err])[0]")
        check('вставлено и посчитано = 5', last and last[1] == '5', last)
        pg.evaluate("MATLIST_DEBUG.inkClose()")
        # графики из Mathcad (личные листы пользователя — только если есть локально)
        lab = os.path.join(FIX, 'laba.xmcd')
        if os.path.exists(lab):
            pg.evaluate("t => window.MATLIST_OPEN_TEXT('laba.xmcd', t)", open(lab, encoding='utf-8').read()); pg.wait_for_timeout(2500)
            pl = pg.evaluate("MATLIST_DEBUG.S.regions.filter(r => r.kind === 'plot').map(r => ({ys: r.ys, snap: !!r.snapOnly, lab: document.querySelector('[data-id=\"' + r.id + '\"] .pl').textContent}))")
            check('3 графика годографов перенесены живыми', len(pl) == 3 and all(x['ys'] and not x['snap'] and not x['lab'] for x in pl), pl)
            el = pg.query_selector('.rg.plot'); el.scroll_into_view_if_needed(); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/v5_laba.png')
        check('нет ошибок JS', not logs, logs)
        b.close()
finally:
    srv.terminate()
print('OK:', *ok, sep='\n  ')
print('FAIL:', *bad, sep='\n  ')
