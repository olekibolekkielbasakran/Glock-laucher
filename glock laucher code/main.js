const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');
const fsp = fs.promises;
const { Client, Authenticator } = require('minecraft-launcher-core');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';
if (IS_WIN) app.setAppUserModelId('com.glock.launcher');
if (IS_LINUX) app.setName('glock-launcher');

// flagi muszą iść przed app.ready
// wyłączone usługi multimedialne w tle, na Linuksie Wayland jeśli jest (GLOCK_X11=1 wymusza X11)
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
if (IS_LINUX) app.commandLine.appendSwitch('ozone-platform-hint', process.env.GLOCK_X11 ? 'x11' : 'auto');

// Windows: %APPDATA%\.glock-launcher, Linux: ~/.local/share/glock-launcher, macOS: Application Support
function dataRoot() {
  if (IS_WIN) return path.join(app.getPath('appData'), '.glock-launcher');
  if (IS_LINUX) return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'glock-launcher');
  return path.join(app.getPath('appData'), 'glock-launcher');
}
const ROOT = dataRoot();
const INST = path.join(ROOT, 'instances');
const BACKUPS = path.join(ROOT, 'backups');
const SETTINGS = path.join(ROOT, 'settings.json');
const BUNDLED = path.join(__dirname, 'bundled-mods');
// auto-mody tylko dla tej wersji
const BUNDLED_MC = '1.21.4';
const DEFAULTS = {
  nick: 'Gracz',
  accounts: [{ id: 'default', nick: 'Gracz' }],
  activeAccount: 'default',
  snapshots: false, accent: 'Lapis', last: null, servers: []
};
const UA = { 'User-Agent': 'Glock-launcher/4.3.1 (' + process.platform + ')' };
let win, playing = false;
// --launch=<id instancji> odpala grę bez okna launchera (skrót)
const LAUNCH_ARG = ((process.argv.find(a => a.startsWith('--launch=')) || '').slice(9)).replace(/^"|"$/g, '');
const HEADLESS = !!LAUNCH_ARG;
// jedna kopia launchera naraz (skrót --launch= działa osobno)
const GOT_LOCK = HEADLESS || app.requestSingleInstanceLock();
if (!GOT_LOCK) app.quit();
else if (!HEADLESS) app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

function loadAppIcon() {
  const ico = path.join(__dirname, 'icon.ico');
  const png = path.join(__dirname, 'icon.png');
  const chosen = IS_WIN && fs.existsSync(ico) ? ico : png;
  if (!fs.existsSync(chosen)) return null;
  const img = nativeImage.createFromPath(chosen);
  return img.isEmpty() ? null : img;
}
// zapis przez plik tymczasowy + rename, żeby JSON się nie psuł przy awarii
function writeJson(file, data) {
  const txt = JSON.stringify(data, null, 2), tmp = file + '.tmp';
  try { fs.writeFileSync(tmp, txt); fs.renameSync(tmp, file); }
  catch { fs.writeFileSync(file, txt); try { fs.unlinkSync(tmp); } catch {} } // np. antywirus blokuje rename na Windowsie
}
let settingsCache = null;
const loadSettings = () => {
  if (!settingsCache) {
    try { settingsCache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }; }
    catch { settingsCache = { ...DEFAULTS }; }
  }
  return { ...settingsCache };
};
const saveSettings = (s) => {
  fs.mkdirSync(ROOT, { recursive: true });
  settingsCache = { ...loadSettings(), ...s };
  writeJson(SETTINGS, settingsCache);
};
const idir = id => path.join(INST, path.basename(String(id)));
const mdir = id => path.join(idir(id), 'mods');
const readInst = id => {
  const f = path.join(idir(id), 'instance.json');
  if (!fs.existsSync(f)) throw new Error('Instancja nie istnieje: ' + id);
  return { id, ...JSON.parse(fs.readFileSync(f, 'utf8')) };
};
async function trash(p) {
  try { await shell.trashItem(p); }
  catch (e) {
    if (IS_WIN) throw e;
    // brak kosza w systemie (np. goły WM bez gio) - usuwamy na stałe
    fs.rmSync(p, { recursive: true, force: true });
    send('log', 'Kosz niedostępny, usunięto na stałe: ' + path.basename(p));
  }
}
const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };
const log = (m) => { console.log('[bundled]', m); send('log', '[bundled] ' + m); };
const jsonCache = new Map();
const getJson = async (u, ttl = 60000) => {
  const c = jsonCache.get(u);
  if (c && Date.now() - c.t < ttl) return c.d;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u);
  const d = await r.json();
  jsonCache.set(u, { t: Date.now(), d });
  if (jsonCache.size > 200) jsonCache.delete(jsonCache.keys().next().value);
  return d;
};

// pobieranie z ponawianiem, sprawdzaniem HTTP i sumy SHA-1
async function dl(url, tries = 3) {
  let last;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 600 * (k + 1))); }
  }
  throw new Error('Nie udało się pobrać pliku: ' + (last && last.message));
}
async function dlVerified(url, sha1) {
  const buf = await dl(url);
  if (sha1 && crypto.createHash('sha1').update(buf).digest('hex') !== String(sha1).toLowerCase()) throw new Error('Błędna suma kontrolna pliku');
  return buf;
}
const readManifest = id => { try { return JSON.parse(fs.readFileSync(path.join(idir(id), 'mods-manifest.json'), 'utf8')); } catch { return {}; } };
const writeManifest = (id, m) => writeJson(path.join(idir(id), 'mods-manifest.json'), m);
const modPrefix = n => String(n).replace(/\.jar(\.disabled)?$/i, '').replace(/[-_+ ]?v?\d.*$/, '').toLowerCase();
function flattenSingleDir(target) {
  const entries = fs.readdirSync(target);
  if (entries.length === 1 && fs.statSync(path.join(target, entries[0])).isDirectory()) {
    const sub = path.join(target, entries[0]);
    for (const e of fs.readdirSync(sub)) fs.renameSync(path.join(sub, e), path.join(target, e));
    fs.rmdirSync(sub);
  }
}

function setPriority(pid, level) {
  if (!IS_WIN) return; // Linux/macOS: podniesienie priorytetu wymaga roota, a powrót do Normal po BelowNormal jest niemożliwy
  try {
    const P = os.constants.priority;
    const map = { High: P.PRIORITY_HIGH, BelowNormal: P.PRIORITY_BELOW_NORMAL, Normal: P.PRIORITY_NORMAL };
    if (pid && map[level] !== undefined) os.setPriority(pid, map[level]);
  } catch {}
}

// auto-dodawanie modów z bundled-mods/1.21.4/ (tylko MC 1.21.4), zwraca raport co zrobiono
function installBundledMods(instId) {
  const result = { found: false, copied: [], skipped: [], error: null, versionDir: null, jars: [] };
  try {
    const inst = readInst(instId);
    log(`Sprawdzam instancję: ${instId} (loader=${inst.loader}, version=${inst.version})`);

    if (inst.loader !== 'fabric' && inst.loader !== 'quilt') {
      result.error = 'Loader to "' + inst.loader + '". Mody tylko dla Fabric/Quilt.';
      log(result.error);
      return result;
    }

    if (inst.version !== BUNDLED_MC) {
      result.error = 'Auto-mody są tylko dla Minecrafta ' + BUNDLED_MC + ' (ta instancja: ' + inst.version + ').';
      log(result.error);
      return result;
    }

    result.versionDir = path.join(BUNDLED, BUNDLED_MC);
    log('Szukam folderu: ' + result.versionDir);

    if (!fs.existsSync(result.versionDir)) {
      result.error = 'Nie ma folderu: ' + result.versionDir;
      log(result.error);
      return result;
    }
    result.found = true;

    const allFiles = fs.readdirSync(result.versionDir);
    result.jars = allFiles.filter(f => /\.jar$/i.test(f));
    log(`W folderze znaleziono ${allFiles.length} plików, w tym ${result.jars.length} .jar`);

    if (result.jars.length === 0) {
      result.error = 'Folder istnieje, ale nie ma w nim żadnego .jar';
      log(result.error);
      return result;
    }

    const modsDir = path.join(idir(instId), 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    for (const jarName of result.jars) {
      const src = path.join(result.versionDir, jarName);
      const dst = path.join(modsDir, jarName);
      const dstDisabled = dst + '.disabled';

      if (fs.existsSync(dst)) {
        result.skipped.push({ name: jarName, reason: 'już jest włączony' });
        log('Pomijam (już włączony): ' + jarName);
        continue;
      }
      if (fs.existsSync(dstDisabled)) {
        result.skipped.push({ name: jarName, reason: 'wyłączony przez gracza (.disabled)' });
        log('Pomijam (wyłączony przez gracza): ' + jarName);
        continue;
      }

      try {
        fs.copyFileSync(src, dst);
        result.copied.push(jarName);
        log('Skopiowano: ' + jarName);
        send('log', 'Auto-dodano mod: ' + jarName);
      } catch (e) {
        log('Błąd kopiowania ' + jarName + ': ' + e.message);
      }
    }

    if (result.copied.length > 0) {
      log(`Dodano ${result.copied.length} modów do instancji ${instId}`);
    } else if (result.skipped.length === result.jars.length) {
      log(`Wszystkie ${result.jars.length} modów już są w instancji`);
    }
  } catch (e) {
    result.error = e.message;
    log('Błąd: ' + e.message);
  }
  return result;
}

function installBundledForAll() {
  try {
    if (!fs.existsSync(INST)) return;
    const dirs = fs.readdirSync(INST).filter(d => fs.existsSync(path.join(INST, d, 'instance.json')));
    for (const d of dirs) {
      try { installBundledMods(d); } catch {}
    }
  } catch (e) { log('installBundledForAll error: ' + e.message); }
}

const WIN_STATE = path.join(ROOT, 'window.json');
function loadWinState() {
  const d = { width: 1360, height: 820 };
  try {
    const s = JSON.parse(fs.readFileSync(WIN_STATE, 'utf8'));
    if (s.width >= 1100 && s.height >= 640) { d.width = s.width; d.height = s.height; }
    if (Number.isFinite(s.x) && Number.isFinite(s.y) && screen.getAllDisplays().some(p => {
      const b = p.workArea; return s.x + 60 >= b.x && s.x + 60 <= b.x + b.width && s.y + 40 >= b.y && s.y + 40 <= b.y + b.height;
    })) { d.x = s.x; d.y = s.y; }
    d.max = !!s.max;
  } catch {}
  return d;
}
function createWindow() {
  fs.mkdirSync(INST, { recursive: true });
  fs.mkdirSync(BACKUPS, { recursive: true });
  const icon = loadAppIcon();
  const st = loadWinState();
  win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y, minWidth: 1100, minHeight: 640, show: false,
    backgroundColor: '#000000', title: 'Glock-launcher',
    icon: icon || undefined, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
      enableWebSQL: false,
      webgl: true,
      experimentalFeatures: false
    }
  });
  if (icon) win.setIcon(icon);
  win.loadFile('index.html');
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);
  let wt = null;
  const saveWin = () => {
    clearTimeout(wt);
    wt = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      try { const b = win.getNormalBounds(); fs.writeFileSync(WIN_STATE, JSON.stringify({ ...b, max: win.isMaximized() })); } catch {}
    }, 600);
  };
  win.on('resize', saveWin); win.on('move', saveWin); win.on('close', () => { clearTimeout(wt); try { const b = win.getNormalBounds(); fs.writeFileSync(WIN_STATE, JSON.stringify({ ...b, max: win.isMaximized() })); } catch {} });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (_e, i) => {
    if (i.type === 'keyDown' && i.key === 'F12') win.webContents.toggleDevTools();
  });

}

ipcMain.handle('init', () => {
  // poza głównym wątkiem startu okna (przy starcie gry i tak jest sprawdzane jeszcze raz)
  setImmediate(installBundledForAll);
  return {
    settings: loadSettings(),
    maxRam: Math.max(2, Math.floor(os.totalmem() / 1024 ** 3)),
    totalRam: Math.floor(os.totalmem() / 1024 ** 3),
    bundledDir: BUNDLED,
    bundledExists: fs.existsSync(BUNDLED),
    platform: process.platform, arch: process.arch
  };
});
ipcMain.handle('save-settings', (_e, s) => saveSettings(s));
ipcMain.handle('settings-reset', () => { saveSettings(DEFAULTS); return DEFAULTS; });
ipcMain.handle('get-versions', async () => {
  try {
    const j = await getJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    return j.versions.filter(v => v.type === 'release' || v.type === 'snapshot').map(v => ({ id: v.id, type: v.type }));
  } catch {
    return ['1.21.4','1.21.3','1.21.1','1.20.4','1.20.1','1.19.2','1.18.2','1.16.5','1.12.2','1.8.9'].map(id => ({ id, type: 'release' }));
  }
});

ipcMain.handle('accounts-list', () => {
  const s = loadSettings();
  return { accounts: s.accounts || [], active: s.activeAccount || 'default' };
});
ipcMain.handle('accounts-save', (_e, { id, nick }) => {
  const s = loadSettings();
  const accounts = s.accounts || [];
  if (id) { const a = accounts.find(x => x.id === id); if (a) a.nick = nick; }
  else accounts.push({ id: 'acc-' + Date.now().toString(36), nick });
  saveSettings({ accounts });
  return accounts;
});
ipcMain.handle('accounts-delete', (_e, id) => {
  const s = loadSettings();
  const accounts = (s.accounts || []).filter(a => a.id !== id);
  const active = accounts.some(a => a.id === s.activeAccount) ? s.activeAccount : (accounts[0] && accounts[0].id) || 'default';
  saveSettings({ accounts, activeAccount: active });
  return { accounts, active };
});
ipcMain.handle('accounts-switch', (_e, id) => { saveSettings({ activeAccount: id }); return true; });

ipcMain.handle('inst-list', async () => {
  await fsp.mkdir(INST, { recursive: true });
  const ds = await fsp.readdir(INST);
  const out = await Promise.all(ds.map(async d => {
    try { return { id: d, ...JSON.parse(await fsp.readFile(path.join(INST, d, 'instance.json'), 'utf8')) }; } catch { return null; }
  }));
  return out.filter(Boolean);
});
ipcMain.handle('inst-save', (_e, i) => {
  const name = String(i.name || i.version || 'instancja');
  const id = i.id || ((name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'instancja') + '-' + Date.now().toString(36));
  fs.mkdirSync(mdir(id), { recursive: true });
  const { id: _x, ...data } = i;
  writeJson(path.join(idir(id), 'instance.json'), data);
  try { installBundledMods(id); } catch {}
  return id;
});
ipcMain.handle('inst-update', (_e, id, patch) => {
  const f = path.join(idir(id), 'instance.json');
  if (!fs.existsSync(f)) throw new Error('Instancja nie istnieje');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  delete patch.id; delete patch.version; delete patch.loader;
  Object.assign(d, patch);
  writeJson(f, d);
});
ipcMain.handle('inst-delete', async (_e, id) => { await trash(idir(id)); });
ipcMain.handle('inst-open', (_e, id) => shell.openPath(idir(id)));
ipcMain.handle('inst-clone', async (_e, id) => {
  const nid = id.replace(/-[a-z0-9]+$/, '') + '-' + Date.now().toString(36);
  await fsp.cp(idir(id), idir(nid), { recursive: true });
  const f = path.join(idir(nid), 'instance.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.name += ' (kopia)'; d.playtime = 0; d.lastPlayed = null;
  writeJson(f, d);
  return nid;
});
ipcMain.handle('inst-backup', async (_e, id) => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addLocalFolder(idir(id), path.basename(id));
  const out = path.join(BACKUPS, `inst-${path.basename(id)}-${Date.now()}.zip`);
  await zip.writeZipPromise(out);
  shell.showItemInFolder(out);
  return out;
});
ipcMain.handle('inst-import', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'zip', extensions: ['zip'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  const AdmZip = require('adm-zip');
  const target = path.join(INST, path.basename(r.filePaths[0], '.zip') + '-' + Date.now().toString(36));
  fs.mkdirSync(target, { recursive: true });
  new AdmZip(r.filePaths[0]).extractAllTo(target, true);
  flattenSingleDir(target);
  if (!fs.existsSync(path.join(target, 'instance.json'))) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error('To nie jest kopia instancji (brak instance.json).');
  }
  return target;
});

ipcMain.handle('backups-list', () => {
  fs.mkdirSync(BACKUPS, { recursive: true });
  return fs.readdirSync(BACKUPS).filter(f => /\.zip$/i.test(f))
    .map(f => ({ name: f, path: path.join(BACKUPS, f), size: fs.statSync(path.join(BACKUPS, f)).size, mtime: fs.statSync(path.join(BACKUPS, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('backups-restore', async (_e, zipPath) => {
  const AdmZip = require('adm-zip');
  const name = path.basename(zipPath, '.zip').replace(/^(inst|world)-/, '').replace(/-\d+$/, '');
  const target = path.join(INST, name + '-restored-' + Date.now().toString(36));
  fs.mkdirSync(target, { recursive: true });
  new AdmZip(zipPath).extractAllTo(target, true);
  const entries = fs.readdirSync(target);
  if (entries.length === 1 && fs.statSync(path.join(target, entries[0])).isDirectory()) {
    const sub = path.join(target, entries[0]);
    for (const e of fs.readdirSync(sub)) fs.renameSync(path.join(sub, e), path.join(target, e));
    fs.rmdirSync(sub);
  }
  return target;
});
ipcMain.handle('backups-delete', async (_e, zipPath) => { await trash(zipPath); });
ipcMain.handle('backups-open', () => shell.openPath(BACKUPS));

ipcMain.handle('open-sub', async (_e, id, sub) => {
  const valid = ['saves','screenshots','mods','shaderpacks','resourcepacks'];
  const safe = valid.includes(sub) ? sub : '';
  const p = id ? path.join(idir(id), safe) : BACKUPS;
  fs.mkdirSync(p, { recursive: true });
  await shell.openPath(p);
});
ipcMain.handle('worlds-list', (_e, id) => {
  const p = path.join(idir(id), 'saves');
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => {
    const wp = path.join(p, d.name);
    const iconPath = path.join(wp, 'icon.png');
    return { name: d.name, mtime: fs.statSync(wp).mtimeMs, icon: fs.existsSync(iconPath) ? require('url').pathToFileURL(iconPath).href : null };
  }).sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('worlds-delete', async (_e, id, name) => { await trash(path.join(idir(id), 'saves', path.basename(name))); });
ipcMain.handle('worlds-backup', async (_e, id, name) => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(idir(id), 'saves', path.basename(name)), path.basename(name));
  const out = path.join(BACKUPS, `world-${path.basename(name)}-${Date.now()}.zip`);
  await zip.writeZipPromise(out);
  shell.showItemInFolder(out);
  return out;
});
ipcMain.handle('shots-list', async (_e, id) => {
  const p = path.join(idir(id), 'screenshots');
  let fl; try { fl = (await fsp.readdir(p)).filter(f => /\.(png|jpe?g)$/i.test(f)); } catch { return []; }
  const out = await Promise.all(fl.map(async f => {
    try { return { name: f, mtime: (await fsp.stat(path.join(p, f))).mtimeMs, url: require('url').pathToFileURL(path.join(p, f)).href }; } catch { return null; }
  }));
  return out.filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, 120);
});
ipcMain.handle('shots-delete', async (_e, id, name) => { await trash(path.join(idir(id), 'screenshots', path.basename(name))); });
ipcMain.handle('shots-open', async (_e, id, name) => { await shell.openPath(path.join(idir(id), 'screenshots', path.basename(name))); });

ipcMain.handle('pick-java', async () => {
  const r = await dialog.showOpenDialog(win, { filters: IS_WIN ? [{ name: 'java', extensions: ['exe'] }] : [], properties: ['openFile'], defaultPath: IS_LINUX ? '/usr/lib/jvm' : undefined });
  return r.canceled ? null : r.filePaths[0];
});
function parseJavaMajor(d) {
  let m = /(?:jdk|jre|java)-?1\.(\d+)/i.exec(d);
  if (m) return +m[1];
  m = /(?:jdk|jre|java|zulu|temurin|corretto|microsoft|semeru|openjdk|liberica|graalvm)-?(\d+)/i.exec(d);
  if (m) return +m[1];
  m = /^(\d+)(?:[.\-_]|$)/.exec(d);
  return m ? +m[1] : null;
}
const JAVA_BIN = IS_WIN ? 'java.exe' : 'java';
// plik "release" w katalogu JDK/JRE zawiera dokładną wersję (JAVA_VERSION="21.0.2" / "1.8.0_402")
function majorFromRelease(home) {
  try {
    const m = /JAVA_VERSION="?([\d._]+)/.exec(fs.readFileSync(path.join(home, 'release'), 'utf8'));
    if (!m) return null;
    const p = m[1].split(/[._]/);
    return +(p[0] === '1' ? p[1] : p[0]) || null;
  } catch { return null; }
}
// ostatnia deska ratunku: `java -version`
function majorFromExec(exe) {
  try {
    const out = execFileSync(exe, ['-version'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'pipe'] });
    return parseExecVersion(out);
  } catch (e) { return parseExecVersion(String((e && e.stderr) || '')); }
}
function parseExecVersion(t) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(String(t));
  if (!m) return null;
  return +m[1] === 1 ? +m[2] : +m[1];
}
function javaBases() {
  const bases = new Set();
  if (IS_WIN) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const vendors = ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'AdoptOpenJDK', 'Semeru', 'Temurin'];
    bases.add('C:\\Java');
    for (const root of [pf, pf86]) { bases.add(root); for (const v of vendors) bases.add(path.join(root, v)); }
  } else if (IS_MAC) {
    bases.add('/Library/Java/JavaVirtualMachines');
    bases.add(path.join(os.homedir(), 'Library/Java/JavaVirtualMachines'));
  } else {
    const home = os.homedir();
    for (const b of ['/usr/lib/jvm', '/usr/lib64/jvm', '/usr/java', '/usr/local/java', '/usr/local/lib/jvm', '/opt/java', '/opt/jdk', '/opt/jvm', '/opt',
      '/app/jre', // Flatpak
      path.join(home, '.jdks'), path.join(home, '.sdkman/candidates/java'), path.join(home, '.local/share/jdks'), path.join(home, '.local/share/mise/installs/java'),
      path.join(home, '.asdf/installs/java'), path.join(home, '.jabba/jdk'), path.join(home, 'jdk'), path.join(home, '.glock-java')]) bases.add(b);
    bases.add(path.join(ROOT, 'java'));
  }
  bases.add(path.join(ROOT, 'java')); // Java pobrana przez launcher (Win + Linux)
  const home2 = os.homedir();
  bases.add(path.join(home2, '.jdks')); bases.add(path.join(home2, '.gradle', 'jdks'));
  if (IS_WIN && process.env.LOCALAPPDATA) for (const v of ['Eclipse Adoptium', 'Microsoft', 'Zulu', 'Java']) bases.add(path.join(process.env.LOCALAPPDATA, 'Programs', v));
  // środowiska Javy oficjalnego launchera Mojangu: runtime/<komponent>/<platforma>/<komponent>
  try {
    const mc = IS_WIN ? path.join(app.getPath('appData'), '.minecraft') : IS_MAC ? path.join(home2, 'Library/Application Support/minecraft') : path.join(home2, '.minecraft');
    const rt = path.join(mc, 'runtime');
    for (const c of fs.readdirSync(rt)) for (const p of fs.readdirSync(path.join(rt, c))) bases.add(path.join(rt, c, p));
  } catch {}
  return bases;
}
let javaCache = null; // skan z `java -version` bywa wolny - wynik ważny 60 s
function scanJavas(force) {
  if (!force && javaCache && Date.now() - javaCache.t < 60000) return javaCache.v;
  const v = scanJavasRaw();
  javaCache = { t: Date.now(), v };
  return v;
}
function scanJavasRaw() {
  const found = [], seen = new Set();
  const add = (exe, label, home) => {
    let real; try { real = fs.realpathSync(exe); } catch { return; }
    const key = IS_WIN ? real.toLowerCase() : real;
    if (seen.has(key)) return;
    let major = (home && majorFromRelease(home)) || parseJavaMajor(label);
    if (!major && !IS_WIN) major = majorFromExec(exe);
    if (!major) return;
    seen.add(key); found.push({ exe, major, label });
  };
  const homeOf = d => IS_MAC && fs.existsSync(path.join(d, 'Contents', 'Home')) ? path.join(d, 'Contents', 'Home') : d;
  for (const b of javaBases()) {
    let es; try { es = fs.readdirSync(b); } catch { continue; }
    for (const d of es) {
      const home = homeOf(path.join(b, d));
      add(path.join(home, 'bin', JAVA_BIN), d, home);
    }
  }
  if (process.env.JAVA_HOME) add(path.join(process.env.JAVA_HOME, 'bin', JAVA_BIN), path.basename(process.env.JAVA_HOME), process.env.JAVA_HOME);
  // java z PATH (np. `sudo apt install openjdk-21-jre`) - tylko poza Windowsem, gdzie i tak jest skanowanie Program Files
  if (!IS_WIN) {
    for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
      if (!dir) continue;
      const exe = path.join(dir, JAVA_BIN);
      let real; try { real = fs.realpathSync(exe); } catch { continue; }
      const home = path.dirname(path.dirname(real));
      add(exe, path.basename(home), home);
    }
  }
  return found;
}
const sameExe = (a, b) => {
  const n = x => { try { return fs.realpathSync(String(x)); } catch { return String(x); } };
  return IS_WIN ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};
const javaMajorOf = exe => { const j = scanJavas().find(x => sameExe(x.exe, exe)); return j ? j.major : (majorFromRelease(path.dirname(path.dirname(String(exe)))) || parseJavaMajor(path.basename(path.dirname(path.dirname(String(exe)))))); };
ipcMain.handle('java-list', () => scanJavas().sort((a, b) => b.major - a.major).map(j => ({ path: j.exe, version: String(j.major), label: `${j.major} - ${j.label}` })));

ipcMain.handle('mods-list', async (_e, id) => {
  await fsp.mkdir(mdir(id), { recursive: true });
  const manifest = readManifest(id);
  const files = (await fsp.readdir(mdir(id))).filter(f => /\.jar(\.disabled)?$/i.test(f));
  return Promise.all(files.map(async f => {
    let size = 0; try { size = (await fsp.stat(path.join(mdir(id), f))).size; } catch {}
    return { name: f, enabled: !f.endsWith('.disabled'), size, project: manifest[f] && manifest[f].project, installedVersion: manifest[f] && manifest[f].versionId };
  }));
});
// włącz/wyłącz wszystkie mody jednym wywołaniem (zamiast setek IPC)
ipcMain.handle('mods-set-all', async (_e, id, state) => {
  let n = 0;
  for (const f of await fsp.readdir(mdir(id))) {
    const p = path.join(mdir(id), f);
    try {
      if (state && /\.jar\.disabled$/i.test(f)) { await fsp.rename(p, p.slice(0, -9)); n++; }
      else if (!state && /\.jar$/i.test(f)) { await fsp.rename(p, p + '.disabled'); n++; }
    } catch {}
  }
  return n;
});
// informacje o systemie do raportu diagnostycznego
ipcMain.handle('sys-info', () => ({
  platform: process.platform, arch: process.arch, release: os.release(), version: app.getVersion(),
  cpu: (os.cpus()[0] || {}).model, cores: os.cpus().length, totalGb: Math.floor(os.totalmem() / 1024 ** 3),
  electron: process.versions.electron, chrome: process.versions.chrome, session: process.env.XDG_SESSION_TYPE || null, dataDir: ROOT
}));
ipcMain.handle('mod-toggle', (_e, id, n) => {
  const p = path.join(mdir(id), path.basename(n));
  fs.renameSync(p, p.endsWith('.disabled') ? p.slice(0, -9) : p + '.disabled');
});
ipcMain.handle('mod-delete', async (_e, id, n) => { await trash(path.join(mdir(id), path.basename(n))); });
ipcMain.handle('mods-check-updates', async (_e, id) => {
  const mf = path.join(idir(id), 'mods-manifest.json');
  if (!fs.existsSync(mf)) return [];
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const inst = readInst(id);
  const updates = [];
  const check = async ([fileName, meta]) => {
    if (!meta.project) return;
    try {
      let u = `https://api.modrinth.com/v2/project/${meta.project}/version?game_versions=${encodeURIComponent(JSON.stringify([inst.version]))}`;
      if (inst.loader !== 'vanilla') u += `&loaders=${encodeURIComponent(JSON.stringify([inst.loader]))}`;
      const vs = await getJson(u);
      if (!vs.length) return;
      const latest = vs[0];
      if (latest.id !== meta.versionId && latest.version_number !== meta.versionId && latest.version_number !== meta.version) {
        const file = latest.files.find(x => x.primary) || latest.files[0];
        updates.push({ current: fileName, project: meta.project, projectTitle: meta.projectTitle || meta.project, latestVersion: latest.version_number, latestId: latest.id, sha1: file.hashes && file.hashes.sha1, latestFile: file.filename, downloadUrl: file.url });
      }
    } catch {}
  };
  const entries = Object.entries(manifest);
  for (let i = 0; i < entries.length; i += 5) await Promise.all(entries.slice(i, i + 5).map(check));
  return updates;
});
ipcMain.handle('mods-apply-updates', async (_e, id, updates) => {
  const manifest = readManifest(id);
  const failed = [];
  for (const u of updates) {
    try {
      const buf = await dlVerified(u.downloadUrl, u.sha1);
      const oldName = path.basename(u.current), newName = path.basename(u.latestFile);
      const oldPath = path.join(mdir(id), oldName);
      const wasDisabled = fs.existsSync(oldPath + '.disabled');
      fs.writeFileSync(path.join(mdir(id), newName), buf);
      for (const x of [oldPath, oldPath + '.disabled']) { if (path.basename(x).replace(/\.disabled$/, '') !== newName || x.endsWith('.disabled')) { try { fs.unlinkSync(x); } catch {} } }
      if (wasDisabled) fs.renameSync(path.join(mdir(id), newName), path.join(mdir(id), newName + '.disabled'));
      delete manifest[oldName];
      manifest[newName] = { project: u.project, projectTitle: u.projectTitle, versionId: u.latestId || u.latestVersion, version: u.latestVersion, installedAt: new Date().toISOString() };
    } catch (e) { failed.push(u.current); }
  }
  writeManifest(id, manifest);
  if (failed.length) throw new Error('Nie zaktualizowano: ' + failed.join(', '));
  return true;
});

ipcMain.handle('mr-search', async (_e, { q, version, loader, type, sort, offset, compat }) => {
  const t = type || 'mod';
  const f = [['project_type:' + t]];
  if (compat && t !== 'modpack') {
    f.push(['versions:' + version]);
    if (t === 'mod' && loader !== 'vanilla') f.push(['categories:' + loader]);
  }
  const j = await getJson(`https://api.modrinth.com/v2/search?limit=20&offset=${offset || 0}&index=${sort || 'relevance'}&query=${encodeURIComponent(q || '')}&facets=${encodeURIComponent(JSON.stringify(f))}`);
  return { total: j.total_hits, hits: j.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, author: h.author, downloads: h.downloads, icon: h.icon_url })) };
});
const MR_DIRS = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
async function mrInstallOne({ inst, project, projectTitle, version, loader, type }, seen = new Set(), depth = 0, asDep = false) {
  const t = type || 'mod';
  if (!fs.existsSync(idir(inst))) throw new Error('Instancja nie istnieje.');
  if (seen.has(project)) return null;
  seen.add(project);
  let u = `https://api.modrinth.com/v2/project/${encodeURIComponent(project)}/version?game_versions=${encodeURIComponent(JSON.stringify([version]))}`;
  if (t === 'mod' && loader !== 'vanilla') u += `&loaders=${encodeURIComponent(JSON.stringify([loader]))}`;
  const vs = await getJson(u);
  if (!vs.length) throw new Error('Brak wersji zgodnej z Minecraftem ' + version);
  const v = vs[0];
  const f = v.files.find(x => x.primary) || v.files[0];
  const fname = path.basename(f.filename);
  const dir = path.join(idir(inst), MR_DIRS[t] || 'mods');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = t === 'mod' ? readManifest(inst) : null;
  const pid = v.project_id || project;
  if (manifest) {
    const pre = modPrefix(fname);
    const existing = fs.readdirSync(dir).filter(x => /\.jar(\.disabled)?$/i.test(x) && x.replace(/\.disabled$/, '') !== fname && modPrefix(x) === pre);
    // zależność, którą gracz ma już wgraną ręcznie, zostawiamy w spokoju (dwa takie same mody = crash)
    if (asDep && existing.length) return null;
    for (const x of existing) { try { fs.unlinkSync(path.join(dir, x)); } catch {} delete manifest[x.replace(/\.disabled$/, '')]; }
    for (const [fn, meta] of Object.entries(manifest)) {
      if (meta && meta.project === pid && fn !== fname) { for (const x of [fn, fn + '.disabled']) { try { fs.unlinkSync(path.join(dir, x)); } catch {} } delete manifest[fn]; }
    }
  }
  const buf = await dlVerified(f.url, f.hashes && f.hashes.sha1);
  fs.writeFileSync(path.join(dir, fname), buf);
  if (manifest) {
    manifest[fname] = { project: pid, projectTitle: projectTitle || project, versionId: v.id, version: v.version_number, installedAt: new Date().toISOString() };
    writeManifest(inst, manifest);
  }
  const deps = [];
  if (t === 'mod' && depth < 2) {
    for (const d of (v.dependencies || [])) {
      if (d.dependency_type !== 'required' || !d.project_id || seen.has(d.project_id)) continue;
      if (Object.values(readManifest(inst)).some(m => m && m.project === d.project_id)) continue;
      try {
        let title = d.project_id;
        try { title = (await getJson('https://api.modrinth.com/v2/project/' + d.project_id)).title || title; } catch {}
        const r = await mrInstallOne({ inst, project: d.project_id, projectTitle: title, version, loader, type: 'mod' }, seen, depth + 1, true);
        if (r) deps.push(title);
      } catch (e) { send('log', 'Zależność ' + d.project_id + ': ' + e.message); }
    }
  }
  return { file: f.filename, deps };
}
ipcMain.handle('mr-install', async (_e, a) => {
  const r = await mrInstallOne(a);
  if (r && r.deps.length) send('status', 'Dodano też wymagane: ' + r.deps.join(', '));
  return r && r.file;
});

// FPS Boost: mody wydajnościowe z Modrinth (razem z zależnościami)
const FPS_MODS = [['sodium', 'Sodium'], ['lithium', 'Lithium'], ['ferrite-core', 'FerriteCore'], ['modernfix', 'ModernFix'], ['entityculling', 'Entity Culling'], ['immediatelyfast', 'ImmediatelyFast']];
ipcMain.handle('fps-boost', async (_e, id) => {
  const inst = readInst(id);
  if (inst.loader !== 'fabric' && inst.loader !== 'quilt') throw new Error('FPS Boost wymaga Fabrica lub Quilta.');
  const out = { installed: [], failed: [] };
  const seen = new Set();
  let k = 0;
  for (const [slug, title] of FPS_MODS) {
    send('status', `FPS Boost ${++k}/${FPS_MODS.length}: ${title}`);
    try { await mrInstallOne({ inst: id, project: slug, projectTitle: title, version: inst.version, loader: 'fabric' }, seen); out.installed.push(title); }
    catch (e) { out.failed.push(title + ' (' + e.message + ')'); }
  }
  return out;
});

// szybkie ustawienia grafiki (options.txt)
const OPT_PRESETS = {
  fps: { renderDistance: 8, simulationDistance: 6, maxFps: 260, enableVsync: 'false', entityShadows: 'false', particles: 2, biomeBlendRadius: 1, mipmapLevels: 2, entityDistanceScaling: '0.75' },
  balanced: { renderDistance: 12, simulationDistance: 8, maxFps: 144, enableVsync: 'false', entityShadows: 'true', particles: 1, biomeBlendRadius: 3, mipmapLevels: 4, entityDistanceScaling: '1.0' }
};
ipcMain.handle('opt-options', (_e, id, preset) => {
  readInst(id);
  const P = OPT_PRESETS[preset];
  if (!P) throw new Error('Nieznany preset grafiki.');
  const f = path.join(idir(id), 'options.txt');
  let lines = [];
  try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l !== ''); } catch {}
  for (const [k, v] of Object.entries(P)) {
    const i = lines.findIndex(l => l.startsWith(k + ':'));
    if (i >= 0) lines[i] = k + ':' + v; else lines.push(k + ':' + v);
  }
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return Object.keys(P).length;
});

// czyszczenie plików tymczasowych i starych logów
ipcMain.handle('clean-temp', () => {
  sizeCache.clear();
  let freed = 0;
  const dirSize = d => { let t = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); t += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } } catch {} return t; };
  const rm = p => { try { const st = fs.statSync(p); const sz = st.isDirectory() ? dirSize(p) : st.size; fs.rmSync(p, { recursive: true, force: true }); freed += sz; } catch {} };
  rm(path.join(ROOT, 'tmp'));
  const cutoff = Date.now() - 14 * 864e5;
  for (const d of (fs.existsSync(INST) ? fs.readdirSync(INST) : [])) {
    for (const sub of ['logs', 'crash-reports']) {
      const dir = path.join(INST, d, sub);
      let es = []; try { es = fs.readdirSync(dir); } catch {}
      for (const f of es) {
        if (f === 'latest.log') continue;
        const p = path.join(dir, f);
        try { if (fs.statSync(p).mtimeMs < cutoff) rm(p); } catch {}
      }
    }
  }
  return freed;
});

ipcMain.handle('modpack-install', async (_e, { project, versionId, gameVersion, loader }) => {
  send('status', 'Pobieranie modpacka...');
  const vInfo = await getJson(`https://api.modrinth.com/v2/version/${versionId}`);
  const file = vInfo.files.find(x => x.primary) || vInfo.files[0];
  const mrpackBuf = await dl(file.url);
  const AdmZip = require('adm-zip');
  const tmp = path.join(ROOT, 'tmp', 'mrpack-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'pack.mrpack'), mrpackBuf);
  new AdmZip(path.join(tmp, 'pack.mrpack')).extractAllTo(tmp, true);
  const indexPath = path.join(tmp, 'modrinth.index.json');
  if (!fs.existsSync(indexPath)) throw new Error('Nieprawidłowy plik .mrpack');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const mcVer = index.dependencies.minecraft || gameVersion;
  let load = 'vanilla';
  if (index.dependencies['fabric-loader']) load = 'fabric';
  else if (index.dependencies['quilt-loader']) load = 'quilt';
  const newId = (index.name || 'modpack').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
  const target = idir(newId);
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.join(target, 'mods'), { recursive: true });
  const manifest = {};
  const failedFiles = [];
  const files = (index.files || []).filter(f => f.path && f.downloads && f.downloads[0] && !(f.env && f.env.client === 'unsupported'));
  const safeRel = p => { const n = path.normalize(p); return (!n.startsWith('..') && !path.isAbsolute(n)) ? n : null; };
  let doneCount = 0;
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const rel = safeRel(f.path);
      if (!rel) continue;
      try {
        const data = await dlVerified(f.downloads[0], f.hashes && f.hashes.sha1);
        const dst = path.join(target, rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, data);
        if (rel.startsWith('mods' + path.sep)) manifest[path.basename(rel)] = { installedAt: new Date().toISOString() };
      } catch (e) { failedFiles.push(path.basename(f.path)); }
      send('status', `Pobieranie ${++doneCount}/${files.length}: ${path.basename(f.path)}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const copyDir = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s2 = path.join(src, entry.name), d2 = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDir(s2, d2); else fs.copyFileSync(s2, d2);
    }
  };
  for (const ov of ['overrides', 'client-overrides']) { const p = path.join(tmp, ov); if (fs.existsSync(p)) copyDir(p, target); }
  if (failedFiles.length) send('log', 'Nie pobrano plików modpacka: ' + failedFiles.join(', '));
  if (Object.keys(manifest).length) fs.writeFileSync(path.join(target, 'mods-manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(target, 'instance.json'), JSON.stringify({
    name: index.name || 'Modpack', version: mcVer, loader: load,
    loaderVersion: index.dependencies['fabric-loader'] || index.dependencies['quilt-loader'] || undefined,
    ram: 6, javaPath: '', jvmArgs: '', width: 1280, height: 720,
    fullscreen: false, server: '', minimize: true, playtime: 0
  }, null, 2));
  fs.rmSync(tmp, { recursive: true, force: true });
  try { installBundledMods(newId); } catch {}
  return newId;
});

ipcMain.handle('crash-analyze', (_e, id) => {
  const logPath = path.join(idir(id), 'logs', 'latest.log');
  if (!fs.existsSync(logPath)) return { ok: false, errors: [], message: 'Brak pliku latest.log.' };
  let content;
  { // czytamy tylko ostatnie ~1,5 MB (latest.log potrafi mieć setki MB)
    const stt = fs.statSync(logPath), len = Math.min(stt.size, 1536 * 1024), buf = Buffer.alloc(len), fd = fs.openSync(logPath, 'r');
    try { fs.readSync(fd, buf, 0, len, stt.size - len); } finally { fs.closeSync(fd); }
    content = buf.toString('utf8');
  }
  const lines = content.split('\n');
  const issues = [];
  const patterns = [
    { re: /java\.lang\.OutOfMemoryError/i, type: 'error', title: 'Brak RAM', fix: 'Zwiększ RAM w Ustawieniach (max 8 GB).' },
    { re: /UnsupportedClassVersionError/i, type: 'error', title: 'Zła wersja Javy', fix: 'MC 1.20.5+ wymaga Javy 21, 1.17-1.20.4 Javy 17, starsze Javy 8.' },
    { re: /Failed to download|Connection (refused|reset|timed out)/i, type: 'warn', title: 'Błąd sieci', fix: 'Sprawdź połączenie internetowe.' },
    { re: /Mod (resolution|dependency|conflict)|Incompatible mod set/i, type: 'error', title: 'Konflikt modów', fix: 'Usuń lub zaktualizuj niezgodne mody.' },
    { re: /Missing or unsupported mandatory dependencies/i, type: 'error', title: 'Brak zależności', fix: 'Zainstaluj brakujące mody.' },
    { re: /NoClassDefFoundError|ClassNotFoundException/i, type: 'error', title: 'Brak klasy Java', fix: 'Brakuje Fabric API lub Kotlin.' },
    { re: /Could not find or load main class/i, type: 'error', title: 'Uszkodzone pliki gry', fix: 'Usuń folder wersji.' },
    { re: /Pixel format not accelerated|OpenGL/i, type: 'warn', title: 'Problem GPU', fix: 'Zaktualizuj sterowniki.' },
    { re: /GLFW error|libGL error|Failed to (create|find) (the )?GLFW window|glfwInit/i, type: 'error', title: 'Błąd GLFW/OpenGL', fix: 'Windows: zaktualizuj sterownik GPU (nie „Microsoft Basic Display”). Linux: zainstaluj Mesa / sterownik NVIDIA (mesa-utils, libgl1) i uruchom ponownie sesję.' },
    { re: /Unrecognized VM option|Could not create the Java Virtual Machine|Invalid maximum heap size/i, type: 'error', title: 'Zły argument JVM', fix: 'Kliknij „Wyczyść” albo wybierz preset JVM w Ustawieniach; sprawdź RAM i wersję Javy.' },
    { re: /requires (any version of )?fabric-?api|fabric-api.*(missing|not found)/i, type: 'error', title: 'Brak Fabric API', fix: 'Zainstaluj Fabric API (przy pobieraniu modów z launchera dodaje się samo).' },
    { re: /Mixin apply failed|InvalidMixinException/i, type: 'error', title: 'Błąd mixina (niezgodny mod)', fix: 'Jakiś mod jest niezgodny z tą wersją gry lub innym modem - wyłącz ostatnio dodany.' },
    { re: /Duplicate mod|duplicated mod|Found a duplicate/i, type: 'error', title: 'Zdublowany mod', fix: 'W zakładce „Zainstalowane” usuń jedną z kopii tego samego moda.' }
  ];
  for (const p of patterns) {
    const found = lines.findIndex(l => p.re.test(l));
    if (found !== -1) issues.push({ type: p.type, title: p.title, fix: p.fix, context: lines.slice(Math.max(0, found - 1), Math.min(lines.length, found + 3)).join('\n') });
  }
  const lastLines = lines.slice(-30).filter(l => l.trim()).join('\n');
  return { ok: true, errors: issues, summary: issues.length ? `Znaleziono ${issues.length} problemów.` : 'Brak błędów.', tail: lastLines, logPath };
});

ipcMain.handle('srv-ping', async (_e, addr) => {
  try {
    const r = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(addr)}`, { headers: UA });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { return { online: false, error: e.message }; }
});

ipcMain.handle('log-save', async (_e, text) => {
  const r = await dialog.showSaveDialog(win, { filters: [{ name: 'log', extensions: ['txt', 'log'] }], defaultPath: 'glock-launcher.log' });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, text);
  return true;
});
ipcMain.handle('open-url', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });

// ręczne dodanie bundled modów (z UI)
ipcMain.handle('install-bundled-mods', (_e, instId) => {
  if (instId) return installBundledMods(instId);
  installBundledForAll();
  return { ok: true };
});

async function ensureFabric(mc, wanted) {
  const list = await getJson('https://meta.fabricmc.net/v2/versions/loader/' + mc);
  if (!list.length) throw new Error('Fabric nie wspiera wersji ' + mc);
  const pick = (wanted && list.find(l => l.loader.version === wanted)) || list.find(l => l.loader.stable) || list[0];
  const prof = await getJson(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${pick.loader.version}/profile/json`);
  const dir = path.join(ROOT, 'versions', prof.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, prof.id + '.json'), JSON.stringify(prof));
  return prof.id;
}
async function ensureQuilt(mc, wanted) {
  const list = await getJson('https://meta.quiltmc.org/v3/versions/loader/' + mc);
  if (!list.length) throw new Error('Quilt nie wspiera wersji ' + mc);
  const pick = (wanted && list.find(l => l.loader.version === wanted)) || list[0];
  const prof = await getJson(`https://meta.quiltmc.org/v3/versions/loader/${mc}/${pick.loader.version}/profile/json`);
  const dir = path.join(ROOT, 'versions', prof.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, prof.id + '.json'), JSON.stringify(prof));
  return prof.id;
}

function needJava(mc) {
  const x = /^1\.(\d+)(?:\.(\d+))?/.exec(mc || '');
  let need = 21;
  if (x) {
    const maj = +x[1], min = +(x[2] || 0);
    if (maj > 20 || (maj === 20 && min >= 5)) need = 21;
    else if (maj >= 17) need = 17;
    else need = 8;
  }
  return need;
}
function findJava(mc) {
  const need = needJava(mc);
  const best = scanJavas().filter(j => j.major >= need).sort((a, b) => a.major - b.major)[0];
  return best && best.exe;
}
// gdy w systemie nie ma pasującej Javy - pobierz JRE Temurin (Adoptium) do <dane>/java/jre-<wersja>
const javaDl = new Map();
function ensureJava(major) {
  if (!javaDl.has(major)) javaDl.set(major, downloadJava(major).finally(() => javaDl.delete(major)));
  return javaDl.get(major);
}
async function downloadJava(major) {
  if (IS_MAC) throw new Error('Auto-pobieranie Javy działa na Windows i Linuksie.');
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64', osn = IS_WIN ? 'windows' : 'linux';
  const j = await getJson(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&os=${osn}&vendor=eclipse`, 300000);
  const pkg = j && j[0] && j[0].binary && j[0].binary.package;
  if (!pkg) throw new Error(`Adoptium nie ma Javy ${major} dla ${osn}/${arch}.`);
  send('status', `Pobieram Javę ${major} (${Math.round((pkg.size || 0) / 1048576)} MB)...`);
  const buf = await dl(pkg.link);
  if (pkg.checksum && crypto.createHash('sha256').update(buf).digest('hex') !== String(pkg.checksum).toLowerCase()) throw new Error('Błędna suma kontrolna Javy');
  const base = path.join(ROOT, 'java'), tmp = path.join(base, '_tmp-' + major + '-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const file = path.join(tmp, pkg.name || 'jre.bin');
    fs.writeFileSync(file, buf);
    send('status', `Rozpakowuję Javę ${major}...`);
    if (/\.zip$/i.test(file)) new (require('adm-zip'))(file).extractAllTo(tmp, true);
    else await new Promise((res, rej) => execFile('tar', ['-xzf', file, '-C', tmp], e => e ? rej(e) : res()));
    fs.unlinkSync(file);
    const sub = fs.readdirSync(tmp).find(d => fs.statSync(path.join(tmp, d)).isDirectory());
    if (!sub) throw new Error('Puste archiwum Javy');
    const dest = path.join(base, 'jre-' + major);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(path.join(tmp, sub), dest);
    javaCache = null;
    return path.join(dest, 'bin', JAVA_BIN);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function launchGame({ id, nick, type }) {
  if (playing) return;
  playing = true;
  try {
    const inst = readInst(id);
    const s = loadSettings();
    const accountId = inst.account || s.activeAccount;
    const acc = (s.accounts || []).find(a => a.id === accountId);
    const finalNick = (acc && acc.nick) || nick || 'Gracz';
    const version = { number: inst.version, type: type || 'release' };

    // jeszcze raz auto-mody, dla pewności
    try {
      const r = installBundledMods(id);
      if (r.copied.length > 0) send('status', 'Auto-dodano ' + r.copied.length + ' modów z paczki');
      if (r.error && r.versionDir) send('log', 'Bundled mods: ' + r.error);
    } catch (e) { send('log', 'Bundled error: ' + e.message); }

    if (inst.loader === 'fabric') { send('status', 'Przygotowywanie Fabrica...'); version.custom = await ensureFabric(inst.version, inst.loaderVersion); }
    else if (inst.loader === 'quilt') { send('status', 'Przygotowywanie Quilta...'); version.custom = await ensureQuilt(inst.version, inst.loaderVersion); }
    const launcher = new Client();
    const started = Date.now();
    launcher.on('progress', p => send('progress', { task: p.task, total: p.total, type: p.type }));
    launcher.on('debug', m => send('log', String(m)));
    launcher.on('data', m => send('log', String(m)));
    launcher.on('download-status', d => send('status', 'Pobieranie: ' + (d.name || '')));
    launcher.on('close', code => {
      playing = false;
      setPriority(process.pid, 'Normal');
      try {
        const f = path.join(idir(id), 'instance.json');
        const { id: _i, ...d } = JSON.parse(fs.readFileSync(f, 'utf8'));
        d.playtime = (d.playtime || 0) + Math.round((Date.now() - started) / 1000);
        d.lastPlayed = new Date().toISOString();
        writeJson(f, d);
      } catch {}
      sizeCache.clear();
      if (win && !win.isDestroyed()) { win.restore(); win.show(); win.focus(); }
      send('closed', code);
      if (HEADLESS) app.quit();
    });
    const sysGb = Math.floor(os.totalmem() / 1024 ** 3), maxSafe = Math.max(2, sysGb - 2);
    let ramVal = inst.ram || 6;
    if (ramVal > maxSafe) { send('log', `${ramVal} GB RAM to za dużo (system ma ${sysGb} GB) - używam ${maxSafe} GB.`); ramVal = maxSafe; }
    if (ramVal > 8) send('log', ramVal + ' GB RAM - powyżej 8 GB FPS może spaść przez GC.');
    const opts = {
      authorization: Authenticator.getAuth(finalNick),
      root: ROOT, version,
      overrides: { gameDirectory: idir(id) },
      memory: { max: `${ramVal}G`, min: `${ramVal}G` }
    };
    opts.window = { width: +inst.width || 1280, height: +inst.height || 720, fullscreen: !!inst.fullscreen };
    if ((inst.server || '').trim()) { const [host, port] = inst.server.trim().split(':'); opts.server = { host, port: port || '25565' }; }
    let jp = inst.javaPath || findJava(inst.version);
    if (!jp) {
      try { jp = await ensureJava(needJava(inst.version)); send('log', 'Java pobrana automatycznie: ' + jp); }
      catch (e) { send('log', 'Auto-pobieranie Javy nie powiodło się: ' + e.message); }
    }
    if (jp) { opts.javaPath = jp; send('log', 'Java: ' + jp); }
    else send('log', 'Nie znaleziono pasującej Javy - próbuję „java” z PATH.' + (IS_LINUX ? ' Zainstaluj np.: sudo apt install openjdk-21-jre (Debian/Ubuntu), sudo dnf install java-21-openjdk (Fedora), sudo pacman -S jre21-openjdk (Arch).' : ''));
    if ((inst.jvmArgs || '').trim()) {
      let args = inst.jvmArgs.trim().split(/\s+/);
      const jm = jp ? javaMajorOf(jp) : null;
      if (jm && jm < 21) {
        const bad = a => /ZGenerational|UseZGC/.test(a);
        if (args.some(bad)) { args = args.filter(a => !bad(a)); send('log', 'Pominięto flagi ZGC - wymagają Javy 21+ (wykryto Javę ' + jm + ').'); }
      }
      if (jm && jm >= 24) args = args.filter(a => !/ZGenerational/.test(a));
      opts.customArgs = args;
    } else {
      // sensowne domyślne flagi (działają na Javie 8/17/21), gdy instancja nie ma własnych
      opts.customArgs = ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=100', '-XX:+DisableExplicitGC'];
    }
    const proc = await launcher.launch(opts);
    if (!proc) { playing = false; fail('Nie udało się uruchomić gry.'); }
    else {
      send('status', 'Gra uruchomiona');
      if (proc.pid && IS_WIN) { setPriority(proc.pid, 'High'); send('log', 'Priorytet gry: wysoki'); }
      if (win && inst.minimize !== false) { win.minimize(); if (IS_WIN) { setPriority(process.pid, 'BelowNormal'); send('log', 'Priorytet launchera: niski'); } }
    }
  } catch (err) { playing = false; fail(err.message); }
}
ipcMain.handle('launch-game', (_e, a) => launchGame(a));

// błąd: w zwykłym trybie do okna launchera, w trybie skrótu - okienko systemowe i wyjście
function fail(msg) {
  if (!HEADLESS) return send('error', msg);
  try { dialog.showErrorBox('Glock-launcher', String(msg)); } catch {}
  app.quit();
}

// skrót na pulpicie (gra startuje bez launchera)
ipcMain.handle('inst-shortcut', (_e, id) => {
  const inst = readInst(id);
  const nm = (String(inst.name || ('Minecraft ' + inst.version)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Minecraft').slice(0, 60);
  let desktop;
  try { desktop = app.getPath('desktop'); } catch { desktop = path.join(os.homedir(), 'Desktop'); }
  if (!fs.existsSync(desktop)) { try { fs.mkdirSync(desktop, { recursive: true }); } catch {} }
  // AppImage: process.execPath wskazuje na tymczasowy mount - właściwy plik to $APPIMAGE
  const exe = (IS_LINUX && process.env.APPIMAGE) || process.execPath;
  const extra = IS_LINUX && (!app.isPackaged || process.env.APPIMAGE) ? ['--no-sandbox'] : [];
  const args = (app.isPackaged ? [] : ['"' + app.getAppPath() + '"']).concat(extra, '--launch=' + id);
  // ikona musi leżeć poza asar, inaczej skrót jej nie odczyta
  let icon = null;
  try {
    const src = path.join(__dirname, IS_WIN ? 'icon.ico' : 'icon.png');
    if (fs.existsSync(src)) { fs.mkdirSync(ROOT, { recursive: true }); icon = path.join(ROOT, path.basename(src)); fs.copyFileSync(src, icon); }
  } catch {}
  if (IS_WIN) {
    const file = path.join(desktop, 'Glock - ' + nm + '.lnk');
    const ok = shell.writeShortcutLink(file, 'create', {
      target: exe, args: args.join(' '), cwd: path.dirname(exe),
      description: 'Uruchom Minecraft ' + inst.version + ' bez launchera',
      icon: icon || exe, iconIndex: 0
    });
    if (!ok) throw new Error('Nie udało się utworzyć skrótu.');
    return { path: file };
  }
  if (IS_LINUX) {
    // wartości w Exec= wymagają cudzysłowów i escapowania \ " ` $
    const q = v => '"' + String(v).replace(/(["`$\\])/g, '\\$1') + '"';
    const execLine = [q(exe)].concat(args.map(a => a.startsWith('"') ? q(a.slice(1, -1)) : a)).join(' ');
    const content = ['[Desktop Entry]', 'Type=Application', 'Name=Glock - ' + nm,
      'Comment=Uruchom Minecraft ' + inst.version + ' bez launchera',
      'Exec=' + execLine, icon ? 'Icon=' + icon : '', 'Terminal=false', 'Categories=Game;'].filter(Boolean).join('\n') + '\n';
    const file = path.join(desktop, 'Glock - ' + nm + '.desktop');
    fs.writeFileSync(file, content, { mode: 0o755 });
    try { fs.chmodSync(file, 0o755); } catch {}
    // GNOME wymaga oznaczenia pliku jako zaufanego - próbujemy po cichu (brak gio = nic się nie dzieje)
    try { execFileSync('gio', ['set', file, 'metadata::trusted', 'true'], { stdio: 'ignore', timeout: 3000 }); } catch {}
    // dodatkowo wpis w menu aplikacji
    try {
      const apps = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'applications');
      fs.mkdirSync(apps, { recursive: true });
      fs.writeFileSync(path.join(apps, 'glock-' + path.basename(id) + '.desktop'), content, { mode: 0o755 });
    } catch {}
    return { path: file };
  }
  throw new Error('Skróty na pulpicie działają na Windows i Linuksie.');
});

// auto-mody tylko 1.21.4
ipcMain.handle('bundled-info', () => ({ mc: BUNDLED_MC, version: app.getVersion() }));

// rozmiar instancji + pliki przeciągnięte na okno
const sizeCache = new Map();
let sizeSlots = 0; const sizeQ = [];
const sizeAcq = () => new Promise(r => { if (sizeSlots < 24) { sizeSlots++; r(); } else sizeQ.push(r); });
const sizeRel = () => { const n = sizeQ.shift(); if (n) n(); else sizeSlots--; };
ipcMain.handle('inst-size', async (_e, id) => {
  const c = sizeCache.get(id);
  if (c && Date.now() - c.t < 120000) return c.v;
  let total = 0;
  const walk = async d => {
    let es;
    await sizeAcq();
    try { es = await fsp.readdir(d, { withFileTypes: true }); } catch { return; } finally { sizeRel(); }
    await Promise.all(es.map(async e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (!e.isFile()) return;
      await sizeAcq();
      try { total += (await fsp.stat(p)).size; } catch {} finally { sizeRel(); }
    }));
  };
  await walk(idir(id));
  sizeCache.set(id, { t: Date.now(), v: total });
  return total;
});
ipcMain.handle('add-files', (_e, id, paths) => {
  sizeCache.delete(id);
  const out = { added: [], skipped: [] };
  for (const p of (paths || [])) {
    try {
      const ext = path.extname(p).toLowerCase(), name = path.basename(p);
      const sub = ext === '.jar' ? 'mods' : ext === '.zip' ? 'resourcepacks' : null;
      if (!sub || !fs.existsSync(p)) { out.skipped.push(name); continue; }
      const dir = path.join(idir(id), sub);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(p, path.join(dir, name));
      out.added.push(sub + '/' + name);
    } catch { out.skipped.push(String(p)); }
  }
  return out;
});

// Linux (Wayland) bierze ikonę z pliku .desktop, nie z BrowserWindow.icon, więc bez wpisu
// widać domyślną. Przy npm/AppImage robimy go w ~/.local/share/applications.
function ensureLinuxDesktopEntry() {
  if (!IS_LINUX || (app.isPackaged && !process.env.APPIMAGE)) return; // paczka .deb ma własny wpis
  try {
    const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const iconDir = path.join(data, 'icons', 'hicolor', '512x512', 'apps');
    const src = path.join(__dirname, 'icon.png'), icon = path.join(iconDir, 'glock-launcher.png');
    fs.mkdirSync(iconDir, { recursive: true });
    if (fs.existsSync(src)) fs.copyFileSync(src, icon);
    const q = v => '"' + String(v).replace(/(["`$\\])/g, '\\$1') + '"';
    const exe = process.env.APPIMAGE || process.execPath;
    const exec = [q(exe)].concat(app.isPackaged ? [] : [q(app.getAppPath())], '--no-sandbox').join(' ');
    const content = ['[Desktop Entry]', 'Type=Application', 'Name=Glock-launcher', 'Comment=Launcher Minecrafta',
      'Exec=' + exec, 'Icon=' + icon, 'Terminal=false', 'Categories=Game;', 'StartupWMClass=glock-launcher'].join('\n') + '\n';
    const apps = path.join(data, 'applications'), file = path.join(apps, 'glock-launcher.desktop');
    fs.mkdirSync(apps, { recursive: true });
    let cur = ''; try { cur = fs.readFileSync(file, 'utf8'); } catch {}
    if (cur !== content) { fs.writeFileSync(file, content, { mode: 0o755 }); try { execFile('update-desktop-database', [apps], () => {}); } catch {} }
  } catch {}
}

app.whenReady().then(() => {
  if (!GOT_LOCK) return;
  if (!HEADLESS) { ensureLinuxDesktopEntry(); return createWindow(); }
  // tryb skrótu: bez okna launchera
  fs.mkdirSync(INST, { recursive: true });
  let inst;
  try { inst = readInst(LAUNCH_ARG); }
  catch (e) { dialog.showErrorBox('Glock-launcher', e.message); return app.quit(); }
  try { if (Notification.isSupported()) new Notification({ title: 'Glock-launcher', body: 'Uruchamiam: ' + (inst.name || 'Minecraft ' + inst.version) }).show(); } catch {}
  const type = /(snapshot|pre|rc|\d\dw\d\d)/i.test(inst.version) ? 'snapshot' : 'release';
  launchGame({ id: LAUNCH_ARG, type });
});
app.on('window-all-closed', () => app.quit());