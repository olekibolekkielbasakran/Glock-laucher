const { contextBridge, ipcRenderer, webUtils } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_e, d) => cb(d));
const api = {};
const channels = [
  'init','save-settings','settings-reset','get-versions',
  'accounts-list','accounts-save','accounts-delete','accounts-switch',
  'inst-list','inst-save','inst-update','inst-delete','inst-open','inst-clone',
  'inst-backup','inst-import',
  'backups-list','backups-restore','backups-delete','backups-open',
  'mods-list','mod-toggle','mod-delete','mods-check-updates','mods-apply-updates',
  'mr-search','mr-install','modpack-install','crash-analyze',
  'launch-game','pick-java','java-list',
  'open-sub','worlds-list','worlds-delete','worlds-backup',
  'shots-list','shots-delete','shots-open',
  'srv-ping','log-save','open-url',
  'install-bundled-mods','inst-size','add-files','bundled-info','inst-shortcut','fps-boost','opt-options','clean-temp',
  'mods-set-all','sys-info'
];
for (const c of channels) {
  api[c.replace(/-(\w)/g, (_m, x) => x.toUpperCase())] = (...a) => ipcRenderer.invoke(c, ...a);
}
api.launch = api.launchGame;
api.pathFor = f => webUtils.getPathForFile(f);
api.platform = process.platform;
// <html data-os="win32|linux"> — pozwala stylować/skryptować pod system
window.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.os = process.platform; });
for (const e of ['progress','status','log','closed','error']) {
  api['on' + e[0].toUpperCase() + e.slice(1)] = cb => on(e, cb);
}
contextBridge.exposeInMainWorld('api', api);