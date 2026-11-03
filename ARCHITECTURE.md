# Матлист — карта блоков

Правило: баг чинится в одном блоке. В `BUGS.md` у каждой ошибки указан блок и тест.
Если правка требует менять соседний блок — сначала меняется его контракт (экспорт в `99_tail.js`) и тесты.

## Ядро `src/engine/` (одно замыкание, склеивается по порядку имён)

| Блок | Строк | Отвечает за | Наружу |
|---|---|---|---|
| `00_head.js` | 5 | начало IIFE | — |
| `10_values.js` | 64 | комплексные числа, `Mat`, `Rng`, `Fn`, `Str` | типы значений |
| `20_units.js` | 93 | единицы, размерности `Q`, температуры | `UNITS`, `Q`, `inUnits` |
| `30_parser.js` | 420 | LaTeX MathLive → дерево: токены, имена, индексы, `%`, операторы | `parse`, `tokenize`, `Parser` |
| `40_linalg.js` | 82 | `Env`, константы, матрицы, LU, det | `Env`, `CONSTS` |
| `50_numeric.js` | 150 | лимит времени (`budget`/`tick`), численные методы: brent, секущие, интеграл, производная, polyroots, РК, сплайны | `integrate`, `budget` |
| `60_builtins.js` | 88 | встроенные функции (`def(...)`) | `B`, `BUILTIN_NAMES` |
| `70_solvers.js` | 177 | root, Given/Find/Minerr, Minimize/Maximize, Odesolve | `SOLVE_FNS` |
| `75_builtins_misc.js` | 23 | строки, Γ, erf, распределения | — |
| `80_eval.js` | 290 | вычисление дерева, вызовы, индексы, WSP, программы (`←`, if, for, while…) | `evalNode`, `Ctx` |
| `85_sheet.js` | 151 | операторы листа (`:=`, `=`, `→`), системы, `SheetRunner` | `execStatement`, `SheetRunner` |
| `87_worker_io.js` | 50 | перенос значений из фонового потока, `SheetRunner.replay` | `serVal`, `envDelta` |
| `90_format.js` | 58 | вывод чисел и единиц | `fmtValue` |
| `95_totex.js` | 67 | дерево → LaTeX | `toTex` |
| `99_tail.js` | 4 | экспорт API | `MatEngine` / `module.exports` |

`src/engine.js` — загрузчик для Node. В приложение блоки склеивает `build.js`.

## Остальное

| Файл | Блок |
|---|---|
| `src/xmcd.js`, `xmcd_template.js` | файлы `.xmcd`: импорт XML → регионы, экспорт |
| `src/md.js` | импорт `.md` |
| `src/wsp.js`, `wsp_data.js`, `wsphelp.js` | WaterSteamPro (будущее расширение) |
| `src/ink.js` | рукописный ввод (модель CoMER не трогаем) |
| `src/plot.js`, `mcplot.js` | графики |
| `src/export.js` | DOCX/PDF |
| `src/calcworker.js` | фоновый пересчёт (Web Worker): тяжёлые регионы и точки графиков |
| `src/app.js`, `index.html`, `style.css` | интерфейс: лист, клавиатуры, ввод; `recompute()` — лимит 250 мс на регион, остальное — в поток |
| `android/` | обёртка WebView |

## Проверки

- `node tools/check_xmcd.js corpus/user corpus/web` — каждый файл в отдельном процессе с таймаутом; сверка с результатами, которые Mathcad сохранил в самом `.xmcd` (эталон уже внутри файла).
- `node tools/primary_errors.js файл.xmcd` — первичные ошибки без каскада «не определена».
- `corpus/` в git не входит: `corpus/user` — файлы владельца, `corpus/web` — `tools/fetch_corpus.sh`.
- `./test/run_all.sh` — модульные тесты и сценарии Playwright.
