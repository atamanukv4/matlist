# Матлист для Windows

Обёртка Electron над той же страницей, что и APK (`dist/apk-assets`). Ядро не дублируется: сначала `node build.js` в корне, потом здесь сборка установщика.

```
cd ..; node build.js          # страница (+ модель рукописного ввода, если есть model/)
cd desktop; npm ci
npm start                     # запустить окно
npm run dist:win              # dist/Matlist-Setup-<версия>.exe (на Linux нужен wine с wine32)
```

- Страница отдаётся по схеме `matlist://app/` — работают fetch, WASM (рукописный ввод) и Web Worker.
- Файлы `.xmcd` и `.md`: меню «Файл → Открыть» (Ctrl+O), двойной щелчок по .xmcd (ассоциация ставится установщиком) или аргумент командной строки.
- Esc — как «Назад» на Android. Ctrl+P — печать / PDF. Ссылки открываются в системном браузере.
- Установка без прав администратора, в `%LOCALAPPDATA%\Programs\Matlist`; можно выбрать папку.
