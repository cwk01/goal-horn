// Desktop app: starts the Goal Horn server on this computer and shows the control page.
// Closing the window keeps Goal Horn running in the tray (menu bar on Mac) so speakers
// keep working; quit from the tray menu.
const { app, BrowserWindow, Tray, Menu, shell, clipboard, nativeImage, powerSaveBlocker, Notification } = require('electron');
const path = require('path');
const { createGoalHorn } = require('./server');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, tray = null, server = null, info = null, quitting = false, blocker = null, toldAboutTray = false;

function showWindow() {
  if (!win) createWindow();
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 820, minWidth: 380, minHeight: 560,
    backgroundColor: '#131A22', title: 'Goal Horn', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.loadURL(info.local);
  // Links to other sites open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true;
      new Notification({ title: 'Goal Horn is still running', body: 'Speakers keep working. Open or quit Goal Horn from the icon in the ' + (process.platform === 'darwin' ? 'menu bar.' : 'system tray.') }).show();
    }
  });
  win.on('closed', () => { win = null; });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Goal Horn');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Goal Horn', click: showWindow },
    { label: 'Sound the horn', click: () => server.sound('goal', 'tray') },
    { label: 'Copy speaker address', enabled: !!info.speakerUrls[0], click: () => clipboard.writeText(info.speakerUrls[0]) },
    { type: 'separator' },
    { label: 'Start Goal Horn when I log in', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }) },
    { type: 'separator' },
    { label: 'Quit Goal Horn', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', showWindow);
  tray.on('right-click', () => tray.setContextMenu(menu()));
}

// Keep the computer awake while a game is on so the horn isn't missed.
function watchPower() {
  setInterval(() => {
    const live = server.tracker.current && server.tracker.current.state === 'LIVE';
    if (live && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!live && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  }, 30000);
}

app.on('second-instance', showWindow);
app.on('activate', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay in the tray */ });

app.whenReady().then(async () => {
  server = createGoalHorn({ dataDir: path.join(app.getPath('userData'), 'data'), log: m => console.log(new Date().toISOString(), m) });
  try {
    info = await server.start();
  } catch (e) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Goal Horn could not start', e.message);
    app.exit(1);
    return;
  }
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  createTray();
  watchPower();
  const hidden = app.getLoginItemSettings().wasOpenedAsHidden || process.argv.includes('--hidden');
  if (!hidden) createWindow(); else win = null;
});

app.on('will-quit', async e => {
  if (server) { e.preventDefault(); const s = server; server = null; await s.stop().catch(() => {}); app.exit(0); }
});
