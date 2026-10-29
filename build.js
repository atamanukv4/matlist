// Сборка Матлиста:
//   dist/web/index.html    — один файл, MathLive с CDN (для публикации и открытия в браузере)
//   dist/apk-assets/       — полностью офлайн: index.html + mathlive.min.js + fonts/ (assets для Android WebView)
const fs = require('fs'), path = require('path');
const V = require('./node_modules/mathlive/package.json').version;
const CDN = `https://cdn.jsdelivr.net/npm/mathlive@${V}`;
const rd = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const ML = 'node_modules/mathlive/';
function build(mode) {
  let html = rd('src/index.html');
  const put = (marker, content, tags) => { if (!tags && content.includes('</script')) throw new Error('</script> в ' + marker); html = html.split(marker).join(content); };
  let fontsCss = rd(ML + 'mathlive-fonts.css');
  if (mode === 'web') fontsCss = fontsCss.replace(/url\(fonts\/([^)]+)\)/g, (m, f) => 'url(data:font/woff2;base64,' + fs.readFileSync(path.join(__dirname, ML, 'fonts', f)).toString('base64') + ')');
  put('<!--MATHLIVE_CSS-->', '<style>' + fontsCss + '\n' + rd(ML + 'mathlive-static.css') + '</style>');
  put('/*APP_CSS*/', rd('src/style.css'));
  const fontsDir = mode === 'web' ? null : 'fonts'; // web: шрифты встроены в CSS, MathLive их не грузит
  put('<!--MATHLIVE_JS-->', `<script>window.MATLIST_FONTS=${JSON.stringify(fontsDir)};</script>\n<script src="${mode === 'web' ? CDN + '/mathlive.min.js' : 'mathlive.min.js'}"></script>`, true);
  put('/*WSPD_JS*/', rd('src/wsp_data.js'));
  put('/*WSP_JS*/', rd('src/wsp.js'));
  put('/*ENGINE_JS*/', rd('src/engine.js'));
  put('/*XTPL_JS*/', rd('src/xmcd_template.js'));
  put('/*XMCD_JS*/', rd('src/xmcd.js'));
  put('/*PLOT_JS*/', rd('src/plot.js'));
  put('/*EXPORT_JS*/', rd('src/export.js'));
  put('/*TEST_JS*/', rd('src/testsheet.js'));
  put('/*APP_JS*/', rd('src/app.js'));
  return html;
}
fs.mkdirSync('dist/web', { recursive: true });
const web = build('web');
fs.writeFileSync('dist/web/index.html', web);
// вариант для Artifact: без doctype/html/head/body (их добавляет публикация)
const head = web.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = web.match(/<body>([\s\S]*)<\/body>/)[1];
fs.writeFileSync('dist/web/matlist.html', head + body);
const A = 'dist/apk-assets'; fs.mkdirSync(A + '/fonts', { recursive: true });
fs.writeFileSync(A + '/index.html', build('apk'));
fs.copyFileSync(ML + 'mathlive.min.js', A + '/mathlive.min.js');
for (const f of fs.readdirSync(ML + 'fonts')) fs.copyFileSync(ML + 'fonts/' + f, A + '/fonts/' + f);
console.log('web', fs.statSync('dist/web/index.html').size, 'bytes; apk-assets ready');
