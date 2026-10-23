// Tells the page it is running inside the desktop app, so it plays the horn
// itself (it is the "this computer" speaker).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('goalHornDesktop', { platform: process.platform });
