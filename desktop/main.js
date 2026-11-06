// Матлист для Windows (и Linux): та же веб-страница, что в APK (dist/apk-assets), в окне Electron.
// Страница отдаётся по схеме matlist://app/ — так работают fetch, WASM (рукописный ввод) и Web Worker, как в Android WebView.
const { app, BrowserWindow, protocol, shell, Menu, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, 'app'); // копия dist/apk-assets (кладёт prepare.js)
const START = 'matlist://app/index.html';

protocol.registerSchemesAsPrivileged([
  { scheme: 'matlist', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
let pending = []; // файлы из командной строки, пока страница не готова
let ready = false;

const fileArgs = argv => argv.slice(app.isPackaged ? 1 : 2).filter(a => /\.(xmcd|md)$/i.test(a) && fs.existsSync(a));

function openFile(p) {
  if (!win || !ready) { pending.push(p); return; }
  let txt;
  try { txt = fs.readFileSync(p, 'utf8'); } catch (e) { dialog.showErrorBox('Матлист', 'Не удалось прочитать файл:\n' + p + '\n' + e.message); return; }
  const js = `window.MATLIST_OPEN_TEXT && window.MATLIST_OPEN_TEXT(${JSON.stringify(path.basename(p))}, ${JSON.stringify(txt)})`;
  win.webContents.executeJavaScript(js).catch(() => {});
  if (win.isMinimized()) win.restore();
  win.focus();
}

async function pickAndOpen() {
  const r = await dialog.showOpenDialog(win, { title: 'Открыть лист', properties: ['openFile'], filters: [{ name: 'Листы Mathcad и Матлист-MD', extensions: ['xmcd', 'md'] }, { name: 'Все файлы', extensions: ['*'] }] });
  if (!r.canceled && r.filePaths[0]) openFile(r.filePaths[0]);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, minHeight: 480,
    title: 'Матлист', icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#ffffff', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // внешние ссылки — в системный браузер
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('matlist://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.webContents.on('did-start-loading', () => { ready = false; });
  win.webContents.on('did-finish-load', () => { ready = true; const p = pending; pending = []; p.forEach(openFile); });
  // Esc — как «Назад» на Android: закрыть верхнюю панель или редактор
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') win.webContents.executeJavaScript('window.MATLIST_BACK && window.MATLIST_BACK()').catch(() => {});
  });
  win.loadURL(START);
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Файл', submenu: [
      { label: 'Открыть .xmcd / .md…', accelerator: 'CmdOrCtrl+O', click: pickAndOpen },
      { type: 'separator' },
      { label: 'Печать / PDF…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
      { type: 'separator' },
      { label: 'Выход', role: 'quit' },
    ] },
    { label: 'Вид', submenu: [
      { label: 'Крупнее', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
      { label: 'Мельче', role: 'zoomOut' },
      { label: 'Обычный масштаб', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Во весь экран', role: 'togglefullscreen' },
      { label: 'Перезагрузить', role: 'reload' },
      { label: 'Инструменты разработчика', role: 'toggleDevTools' },
    ] },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => { fileArgs(argv).forEach(openFile); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('matlist', req => {
      const u = new URL(req.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    buildMenu();
    pending = fileArgs(process.argv);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
