// Копирует собранную страницу (../dist/apk-assets, после `node build.js` в корне) в desktop/app.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'dist', 'apk-assets'), dst = path.join(__dirname, 'app');
if (!fs.existsSync(path.join(src, 'index.html'))) { console.error('нет ../dist/apk-assets — сначала node build.js в корне'); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
const ver = require('../package.json').version;
console.log('страница скопирована в desktop/app; рукописный ввод:', fs.existsSync(path.join(dst, 'model', 'vocab.txt')) ? 'есть' : 'нет', '; версия ядра', ver);
