const {
  app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, Notification,
  globalShortcut, protocol, net, clipboard, screen, webContents, dialog,
} = require('electron');
const { spawn, spawnSync, execFile } = require('child_process');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const { BUILTIN, userCategory } = require('./categories.cjs');
const storeApi = require('./store.cjs');
const scanner = require('./scanner.cjs');
const tidy = require('./tidy.cjs');
const library = require('./library.cjs');
const startup = require('./startup.cjs');
const cleaner = require('./cleaner.cjs');
const files = require('./files.cjs');
const { createSysmon, PROTECTED } = require('./sysmon.cjs');
const { createPanels, specsOf } = require('./panels.cjs');
const { WIDGETS } = require('./widgets.cjs');
const { createDock } = require('./dock.cjs');
const wsp = require('./workspaces.cjs');
const procgroups = require('./procgroups.cjs');
const { createAutomation, sanitizeWhen } = require('./automation.cjs');
const setup = require('./setup.cjs');
const displays = require('./displays.cjs');
const { createUpdater } = require('./updater.cjs');
const { createAlerts } = require('./alerts.cjs');
const { createHealth } = require('./health.cjs');

// Icons are served from the on-disk cache through this scheme instead of being sent as base64.
protocol.registerSchemesAsPrivileged([
  { scheme: 'deskly-icon', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);

const SELFTEST = process.argv.includes('--selftest');
const START_HIDDEN = process.argv.includes('--hidden');
const DEV_URL = process.env.VITE_DEV_URL;
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let win = null;
let searchWin = null;
let tray = null;
let quitting = false;
let hotkeyActive = null;

if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.quit();
}

const store = () => storeApi.load();
const save = () => storeApi.save();

const DEFAULT_SCENES = [
  { id: 's_work', name: 'Work', icon: 'Briefcase', color: '#34d399', show: ['quick', 'work', 'dev', 'web', 'comms', 'folders', 'files', 'w_projects', 'w_clock'], launch: [] },
  { id: 's_gaming', name: 'Gaming', icon: 'Gamepad2', color: '#ff4d8d', show: ['quick', 'games', 'media', 'comms', 'w_sys', 'w_clock'], launch: [] },
  { id: 's_content', name: 'Content', icon: 'Palette', color: '#a78bfa', show: ['quick', 'creative', 'media', 'work', 'files', 'w_recent', 'w_sys'], launch: [] },
  { id: 's_all', name: 'Everything', icon: 'LayoutGrid', color: '#8b5cf6', show: 'all', launch: [] },
];
// Added once for people who already have scenes: a quiet desktop for low battery or a hot graphics card.
const LIGHT_SCENE = { id: 's_light', name: 'Light mode', icon: 'BatteryLow', color: '#fbbf24', show: ['quick', 'w_clock'], launch: [] };

function seedScenes() {
  const s = store();
  if (!Array.isArray(s.scenes)) {
    s.scenes = DEFAULT_SCENES.map((x) => ({ ...x, show: x.show === 'all' ? 'all' : [...x.show] }));
    s.prefs.lightSceneAdded = true;
    s.scenes.push({ ...LIGHT_SCENE, show: [...LIGHT_SCENE.show] });
    save();
  } else if (!s.prefs.lightSceneAdded) {
    s.prefs.lightSceneAdded = true; // only once, so deleting it sticks
    if (!s.scenes.some((x) => x.id === LIGHT_SCENE.id)) s.scenes.push({ ...LIGHT_SCENE, show: [...LIGHT_SCENE.show] });
    save();
  }
}

const allCategories = (s) => [
  ...BUILTIN,
  ...s.customCategories.map((c) => ({ ...c, icon: c.icon || 'Tag', blurb: 'Custom category', custom: true })),
];
const validCats = () => new Set(allCategories(store()).map((c) => c.id));

// `fsutil dirty query` only succeeds with administrator rights.
let elevatedCache = null;
function isElevated() {
  if (elevatedCache === null) {
    try {
      elevatedCache = spawnSync('fsutil', ['dirty', 'query', process.env.SystemDrive || 'C:'], { windowsHide: true }).status === 0;
    } catch {
      elevatedCache = false;
    }
  }
  return elevatedCache;
}

const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

// Restart Deskly with a UAC prompt. Returns false if the user declined.
function relaunchAsAdmin() {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const args = app.isPackaged ? '' : ` -ArgumentList ${q(app.getAppPath())}`;
  app.releaseSingleInstanceLock();
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `try { Start-Process -FilePath ${q(exePath())}${args} -Verb RunAs -ErrorAction Stop } catch { exit 1 }`],
    { windowsHide: true }
  );
  if (r.status === 0) {
    setTimeout(() => app.quit(), 400);
    return true;
  }
  app.requestSingleInstanceLock();
  return false;
}

/* ---------- library (everything installed) ---------- */
let libCache = null;
let libPromise = null;
let libByKey = new Map();
let recentCache = { t: 0, items: [] };

function indexLibrary() {
  libByKey = new Map();
  if (!libCache) return;
  for (const it of [...libCache.apps, ...libCache.games, ...libCache.chrome, ...libCache.projects]) libByKey.set(it.key, it);
}

function ensureLibrary(force = false) {
  if (libCache && !force && Date.now() - libCache.t < 10 * 60 * 1000) return Promise.resolve(libCache);
  if (!libPromise) {
    libPromise = library
      .scanLibrary(store(), validCats())
      .then((l) => {
        libCache = l;
        indexLibrary();
        return l;
      })
      .catch((e) => {
        console.error('library scan failed', e);
        return libCache || { apps: [], games: [], chrome: [], projects: [], t: 0 };
      })
      .finally(() => (libPromise = null));
  }
  return libPromise;
}

const norm = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '');

/* ---------- state (memoised briefly: every panel asks for it at once) ---------- */
let stateMemo = null;
const invalidate = () => (stateMemo = null);

/* ---------- running apps (green dot) ---------- */
let runningExes = new Set();
let lastItems = [];
let lastRunningSig = '';

const runningKeys = (items) => items.filter((i) => i.exe && runningExes.has(i.exe)).map((i) => i.key);

function pollRunning() {
  const s = store();
  const needed = s.prefs.showRunning || ((s.automation && s.automation.rules) || []).some((r) => r.enabled !== false && r.when && r.when.kind === 'app');
  if (!needed) return;
  execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
    if (err) return;
    const names = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = /^"([^"]+)"/.exec(line);
      if (m) names.add(m[1].toLowerCase());
    }
    runningExes = names;
    const keys = runningKeys(lastItems);
    const sig = keys.join('|');
    if (sig === lastRunningSig) return;
    lastRunningSig = sig;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('deskly:running', keys);
  });
}

// "Quick access": the most launched items.
// time of day buckets: m = 5-12, a = 12-18, e = 18-24, n = 0-5
const bucketNow = () => {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'm' : h >= 12 && h < 18 ? 'a' : h >= 18 ? 'e' : 'n';
};

function buildQuick(items, s) {
  if (!s.prefs.showQuick) return null;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const b = bucketNow();
  // with smartQuick, what you launch at this time of day counts three times as much
  const score = (u) => u.n + (s.prefs.smartQuick !== false && u.b ? 3 * (u.b[b] || 0) : 0);
  const keys = Object.entries(s.usage)
    .filter(([k]) => byKey.has(k))
    .sort((a, b2) => score(b2[1]) - score(a[1]) || b2[1].t - a[1].t)
    .slice(0, 8)
    .map(([k]) => k);
  return keys.length >= 3 ? { id: 'quick', name: 'Quick access', icon: 'Zap', color: '#fbbf24', keys } : null;
}

// Library items the user pinned show up in the category panels like any other tile.
function pinnedLibraryItems(s) {
  if (!libCache || !s.libPins.length) return [];
  const picks = s.libPins.map((k) => libByKey.get(k)).filter((l) => l && l.kind !== 'project').map((l) => ({ ...l }));
  library.assignCategories(picks, s, validCats());
  return picks.map((l) => ({
    key: l.key,
    name: l.name,
    file: l.name,
    path: l.path,
    kind: 'app',
    ext: '',
    owner: 'library',
    target: '',
    url: '',
    exe: '',
    sensitive: false,
    auto: l.auto,
    category: l.category,
    pinned: s.pins.includes(l.key),
    movable: false,
    loose: false,
    icon: l.icon,
    isNew: false,
    firstSeen: 0,
    lib: true,
    source: l.source,
  }));
}

function getState() {
  if (stateMemo && Date.now() - stateMemo.t < 700) return stateMemo.p;
  seedScenes();
  const s = store();
  const elevated = isElevated();
  const categories = allCategories(s);
  const valid = new Set(categories.map((c) => c.id));
  const p = scanner.scan(s, elevated, valid).then(({ items: desk, hiddenCount, dirty, ruleCounts }) => {
    if (dirty) save();
    const items = [...desk, ...pinnedLibraryItems(s)];
    lastItems = items;
    const st = {
      elevated,
      items,
      categories,
      primary: scanner.primaryDesktop(),
      canUndo: s.tidyHistory.length > 0,
      hiddenCount,
      prefs: s.prefs,
      panelPrefs: s.panelPrefs,
      rules: s.rules.map((r) => ({ ...r, matches: ruleCounts[r.id] || 0 })),
      quick: buildQuick(items, s),
      running: s.prefs.showRunning ? runningKeys(items) : [],
      scenes: s.scenes,
      scene: s.scenes.find((x) => x.id === s.prefs.scene) || null,
      automation: { rules: s.automation.rules, log: s.automation.log },
      health: health.summary(),
      update: updater.status(),
      displays: displays.describe(),
      activeDisplay: String(displays.pick(s.prefs.panelsDisplay).id),
      widgetDefs: WIDGETS.map(({ id, name, icon, color, blurb }) => ({ id, name, icon, color, blurb })),
      weather: s.weather,
      libPins: s.libPins,
      autoCollapsed: panels.autoCollapsed(),
      libReady: !!libCache,
      hotkey: hotkeyActive,
      panelsHidden: panels.isHidden(),
      panelsAvailable: panels.available(),
      panelsBlocked: elevated, // panels cannot run while Deskly is elevated
      canAutostart: app.isPackaged,
    };
    // the tabs the Hub card shows (same rules the panel engine uses to size it)
    const hub = specsOf(st).find((x) => x.hub);
    st.hubTabs = hub ? hub.tabIds : [];
    return st;
  });
  stateMemo = { t: Date.now(), p };
  return p;
}

/* ---------- windows ---------- */
function loadRenderer(w, query) {
  const q = new URLSearchParams(query || {}).toString();
  if (DEV_URL) return w.loadURL(q ? `${DEV_URL}/?${q}` : DEV_URL);
  const file = path.join(__dirname, '..', 'dist', 'index.html');
  return query ? w.loadFile(file, { query }) : w.loadFile(file);
}

const panels = createPanels({
  preload: path.join(__dirname, 'preload.cjs'),
  loadPanel: (w, id) => loadRenderer(w, { panel: id }),
  getStore: store,
  save,
  onAutoCollapse: () => notify(),
  getDisplay: () => displays.pick(store().prefs.panelsDisplay),
});

/* ---------- dock ---------- */
// Favourites first, then your most launched apps (max 6, only things with an icon).
function dockApps() {
  const s = store();
  const byKey = new Map(lastItems.map((i) => [i.key, i]));
  const quick = (buildQuick(lastItems, { ...s, prefs: { ...s.prefs, showQuick: true } }) || {}).keys || [];
  const out = [];
  for (const k of [...s.pins, ...quick]) {
    const i = byKey.get(k);
    if (i && i.icon && i.kind !== 'special' && i.kind !== 'dir' && !out.some((o) => o.key === k)) out.push(i);
    if (out.length >= 6) break;
  }
  return out;
}

const dock = createDock({
  preload: path.join(__dirname, 'preload.cjs'),
  loadDock: (w) => loadRenderer(w, { mode: 'dock' }),
  getStore: store,
  getDockKeys: () => dockApps().map((i) => i.key),
  getDisplay: () => displays.pick(store().prefs.panelsDisplay),
});

// The dock belongs to the desktop panels: it shows whenever they are on (and the dock is not switched off).
function applyDock() {
  const p = store().prefs;
  const want = p.dock !== 'off' && p.desktopMode;
  if (want && !dock.isOn()) dock.enable();
  else if (!want && dock.isOn()) dock.disable();
}

/* ---------- folder peek ---------- */
let peekWin = null;

async function peekFolder(dir) {
  let rows;
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    rows = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name.toLowerCase() !== 'desktop.ini')
      .map((e) => {
        const full = path.join(dir, e.name);
        let t = 0;
        try {
          t = fs.statSync(full).mtimeMs;
        } catch {}
        return { name: e.name, path: full, isDir: e.isDirectory(), t };
      })
      .sort((a, b) => b.t - a.t);
  } catch {
    return false;
  }
  const top = rows.slice(0, 20).map((r) => ({ ...r, key: 'peek:' + r.path.toLowerCase(), _iconSrc: r.path, _iconFlags: r.isDir ? 4 : 0 }));
  await scanner.withIcons(top);
  const data = {
    dir,
    name: path.basename(dir) || dir,
    total: rows.length,
    entries: top.map(({ name, path: p, isDir, icon }) => ({ name, path: p, isDir, icon })),
  };

  if (!peekWin || peekWin.isDestroyed()) {
    peekWin = new BrowserWindow({
      width: 476,
      height: 300,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      title: 'Deskly folder',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
    });
    loadRenderer(peekWin, { mode: 'peek' });
    peekWin.on('blur', () => {
      if (peekWin && !peekWin.isDestroyed() && peekWin.isVisible()) peekWin.hide();
    });
    peekWin.on('closed', () => (peekWin = null));
  }
  const w = peekWin;
  const rowsN = Math.max(1, Math.ceil(Math.max(1, top.length) / 5));
  const h = Math.min(460, 62 + rowsN * 92 + 24 + (rows.length > top.length ? 26 : 0));
  const c = screen.getCursorScreenPoint();
  const a = screen.getDisplayNearestPoint(c).workArea;
  const x = Math.min(Math.max(c.x - 238, a.x + 8), a.x + a.width - 484);
  let y = c.y + 14;
  if (y + h > a.y + a.height) y = Math.max(a.y + 8, c.y - h - 14);
  w.setBounds({ x: Math.round(x), y: Math.round(y), width: 476, height: h });
  const reveal = () => {
    w.show();
    w.focus();
    w.webContents.send('deskly:peekShow', data);
  };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', reveal);
  else reveal();
  return true;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0a0b10',
    title: 'Deskly',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0b10', symbolColor: '#c7cbe0', height: 48 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.setMenuBarVisibility(false);
  loadRenderer(win);
  // With panels or background mode on, closing the window just tucks Deskly into the tray.
  win.on('close', (e) => {
    const p = store().prefs;
    if (!quitting && (p.desktopMode || p.background)) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => (win = null));
}

function showMain(page) {
  if (!win || win.isDestroyed()) createWindow();
  const w = win;
  const reveal = () => {
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    if (page) w.webContents.send('deskly:navigate', page);
  };
  if (w.webContents.isLoading()) w.once('ready-to-show', reveal);
  else reveal();
}

/* ---------- Alt+Space search window ---------- */
function createSearch() {
  searchWin = new BrowserWindow({
    width: 700,
    height: 520,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'Deskly search',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  loadRenderer(searchWin, { mode: 'search' });
  searchWin.on('blur', () => {
    if (searchWin && !searchWin.isDestroyed() && searchWin.isVisible()) searchWin.hide();
  });
  searchWin.on('closed', () => (searchWin = null));
}

function toggleSearch() {
  if (!searchWin || searchWin.isDestroyed()) createSearch();
  const w = searchWin;
  if (w.isVisible()) return w.hide();
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  w.setPosition(Math.round(wa.x + (wa.width - 700) / 2), Math.round(wa.y + wa.height * 0.13));
  const reveal = () => {
    w.show();
    w.focus();
    w.webContents.send('deskly:searchShow');
  };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', reveal);
  else reveal();
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const s = store();
  // Your choice first; if another app (e.g. Microsoft 365 Copilot owns Alt+Space) has it, use the next free one.
  const candidates = [s.prefs.searchHotkey || 'Alt+Space', 'Alt+Space', 'Control+Alt+Space', 'Control+Shift+Space', 'Alt+Shift+Space'].filter((v, i, a) => a.indexOf(v) === i);
  hotkeyActive = null;
  for (const c of candidates) {
    try {
      if (globalShortcut.register(c, toggleSearch)) {
        hotkeyActive = c;
        break;
      }
    } catch {}
  }
  try {
    globalShortcut.register('Control+Alt+H', togglePeekAll); // hide / show the desktop panels
  } catch {}
  (s.scenes || []).slice(0, 9).forEach((sc, i) => {
    try {
      globalShortcut.register(`Control+Alt+${i + 1}`, () => applyScene(sc.id));
    } catch {}
  });
}

/* ---------- change notifications ---------- */
// Tell every window except `except` (it already has fresh state) that something changed.
function notify(except) {
  invalidate();
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || (except && w.webContents.id === except)) continue;
    w.webContents.send('deskly:changed');
  }
  if (panels.isEnabled()) getState().then((st) => panels.sync(st));
  dock.sync();
}

function togglePeekAll() {
  const hidden = panels.setHidden(!panels.isHidden());
  notify();
  return hidden;
}

// Auto-sort: a brand-new shortcut that lands on the desktop is filed into its category folder.
let autoTimer = null;
function scheduleAutoSort() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(runAutoSort, 2500); // let installers finish writing first
}

async function runAutoSort() {
  if (quitting || !store().prefs.autoSort) return;
  invalidate();
  const state = await getState();
  const now = Date.now();
  const fresh = state.items.filter(
    (i) => i.isNew && i.loose && i.movable && i.owner === 'user' && (i.kind === 'shortcut' || i.kind === 'url') && now - i.firstSeen < 10 * 60 * 1000
  );
  if (!fresh.length) return;
  const p = tidy.plan(fresh, state.categories, state.primary, false);
  if (!p.moves.length) return;
  const r = tidy.apply(p.moves, store());
  save();
  notify();
  if (r.moved && Notification.isSupported()) {
    new Notification({
      title: 'Deskly sorted your desktop',
      body: `${r.moved} new shortcut${r.moved > 1 ? 's' : ''} → ${[...new Set(p.groups.map((g) => g.folder))].join(', ')}`,
      silent: true,
    }).show();
  }
}

function watchDesktops() {
  let timer = null;
  const ping = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      notify();
      if (store().prefs.autoSort) scheduleAutoSort();
    }, 600);
  };
  const dirs = new Set(scanner.desktopRoots().map((r) => r.path));
  for (const d of store().managedDirs) dirs.add(d.path);
  for (const dir of dirs) {
    try {
      fs.watch(dir, { persistent: false }, ping);
    } catch {}
  }
}

/* ---------- launching ---------- */
function bumpUsage(key) {
  if (!key) return;
  const u = store().usage;
  const old = u[key] || {};
  const b = { ...(old.b || {}) };
  const k = bucketNow();
  b[k] = (b[k] || 0) + 1;
  u[key] = { n: (old.n || 0) + 1, t: Date.now(), b };
  save();
  invalidate();
}

async function openPath(p) {
  if (String(p).startsWith('shell:')) {
    spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(String(p))) {
    await shell.openExternal(p);
    return null;
  }
  return (await shell.openPath(p)) || null;
}

// Launch anything Deskly knows about by its key: a desktop item, a library app/game/profile, or a project.
async function launchKey(key, alt = false) {
  bumpUsage(key);
  const lib = libByKey.get(key);
  if (lib) {
    if (lib.kind === 'project') return library.projectAction(lib, alt ? 'folder' : 'code');
    return library.launch(lib.launch);
  }
  const it = lastItems.find((i) => i.key === key);
  return it ? openPath(it.path) : 'Not found';
}

/* ---------- scenes ---------- */
async function applyScene(id) {
  const s = store();
  const sc = id ? s.scenes.find((x) => x.id === id) : null;
  s.prefs.scene = sc ? sc.id : null;
  save();
  invalidate();
  const st = await getState();
  if (panels.isEnabled()) panels.sync(st);
  buildTrayMenu();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('deskly:changed');
  if (sc && sc.launch && sc.launch.length) {
    for (const k of sc.launch.slice(0, 12)) {
      await launchKey(k);
      await sleep(400);
    }
  }
  if (sc && Notification.isSupported()) new Notification({ title: `Scene: ${sc.name}`, body: 'Your desktop is set up.', silent: true }).show();
  return getState();
}

/* ---------- weather (opt-in: only when you enter a city) ---------- */
async function updateWeather(force = false) {
  const s = store();
  const city = String(s.prefs.weatherCity || '').trim();
  if (!city) {
    if (s.weather) {
      s.weather = null;
      save();
    }
    return;
  }
  const w = s.weather;
  if (!force && w && w.query === city && !w.error && Date.now() - w.t < 20 * 60 * 1000) return;
  try {
    let geo = w && w.query === city && w.lat ? w : null;
    if (!geo) {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, { signal: AbortSignal.timeout(8000) });
      const g = ((await r.json()).results || [])[0];
      if (!g) {
        s.weather = { query: city, error: 'City not found', t: Date.now() };
        save();
        return notify();
      }
      geo = { query: city, city: g.name, country: g.country_code, lat: g.latitude, lon: g.longitude };
    }
    const r2 = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`, { signal: AbortSignal.timeout(8000) });
    const cur = (await r2.json()).current;
    s.weather = { ...geo, temp: Math.round(cur.temperature_2m), code: cur.weather_code, isDay: !!cur.is_day, t: Date.now() };
  } catch {
    if (s.weather) s.weather.t = Date.now() - 19 * 60 * 1000; // try again in a minute
  }
  save();
  notify();
}

/* ---------- tray + autostart ---------- */
function applyAutostart(on) {
  if (!app.isPackaged) return false;
  app.setLoginItemSettings({ openAtLogin: !!on, path: exePath(), args: ['--hidden'] });
  return !!on;
}

async function setDesktopMode(on) {
  const s = store();
  if (on) {
    // An elevated process cannot host windows on the normal (non-elevated) desktop.
    if (isElevated()) {
      return { ...s.prefs, error: 'Desktop panels need Deskly to run normally. Close it and open it without "Run as administrator".' };
    }
    const ok = await panels.enable(await getState());
    if (!ok) return { ...s.prefs, error: 'Desktop panels are not available on this system.' };
  } else {
    panels.disable();
  }
  s.prefs.desktopMode = !!on;
  save();
  applyDock();
  buildTrayMenu();
  return s.prefs;
}

function setAutostart(on) {
  const s = store();
  s.prefs.autostart = applyAutostart(on);
  save();
  buildTrayMenu();
  return s.prefs;
}

function buildTrayMenu() {
  if (!tray) return;
  const s = store();
  const prefs = s.prefs;
  const sceneItems = (s.scenes || []).map((sc, i) => ({
    label: sc.name,
    type: 'radio',
    checked: prefs.scene === sc.id,
    accelerator: i < 9 ? `Ctrl+Alt+${i + 1}` : undefined,
    click: () => applyScene(sc.id),
  }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Deskly', click: () => showMain() },
      { label: hotkeyActive ? `Search…  (${hotkeyActive.replace('Control', 'Ctrl')})` : 'Search…', click: () => toggleSearch() },
      { label: 'Performance', click: () => showMain('performance') },
      { label: panels.isHidden() ? 'Show desktop panels   (Ctrl+Alt+H)' : 'Hide desktop panels   (Ctrl+Alt+H)', click: () => togglePeekAll(), enabled: !!prefs.desktopMode },
      { type: 'separator' },
      { label: 'Scene', submenu: [...sceneItems, { type: 'separator' }, { label: 'No scene', type: 'radio', checked: !prefs.scene, click: () => applyScene(null) }] },
      {
        label: 'Desktop panels',
        type: 'checkbox',
        checked: !!prefs.desktopMode,
        click: async (item) => {
          await setDesktopMode(item.checked);
          for (const w of BrowserWindow.getAllWindows()) w.webContents.send('deskly:changed');
        },
      },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: !!prefs.autostart,
        enabled: app.isPackaged,
        click: (item) => setAutostart(item.checked),
      },
      { type: 'separator' },
      { label: 'Quit Deskly', click: () => app.quit() },
    ])
  );
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }));
    tray.setToolTip('Deskly');
    tray.on('click', () => showMain());
    buildTrayMenu();
  } catch (e) {
    console.error('tray failed', e.message);
  }
}

/* ---------- automation + alerts + health history ---------- */
const health = createHealth({ getStore: store, save });
const automation = createAutomation({
  getStore: store,
  save,
  getRunning: () => runningExes,
  applyScene: (id) => applyScene(id),
  onChange: () => notify(),
  getHealth: () => health.latest(),
});
const alerts = createAlerts({ getStore: store, save, showMain: (page) => showMain(page), getReport: () => health.report(7) });

/* ---------- servers started from Deskly ---------- */
const sendAll = (channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
};
const updater = createUpdater({ getStore: store, save, onChange: (st) => sendAll('deskly:update', st), showMain: (page) => showMain(page) });
const managed = wsp.createManaged({
  onChange: () => sendAll('deskly:mgd', managed.list()),
  onLog: (id, lines) => sendAll('deskly:mgdLog', { id, lines }),
});

/* ---------- live system monitor ---------- */
const sysmon = createSysmon({
  onSample: (sample, ids) => {
    for (const id of ids) {
      const wc = webContents.fromId(id);
      if (wc && !wc.isDestroyed()) wc.send('deskly:sys', sample);
    }
  },
});
const sysWatched = new Set();

/* ---------- IPC ---------- */
function registerIpc() {
  // `mutates`: after the handler runs, tell the other windows to refresh.
  const handle = (name, fn, mutates = false) =>
    ipcMain.handle('deskly:' + name, async (e, ...args) => {
      const result = await fn(...args);
      if (mutates) notify(e.sender.id);
      return result;
    });

  handle('scan', () => getState());

  handle('open', async (p, key) => {
    bumpUsage(key);
    const lib = key && libByKey.get(key);
    if (lib && lib.kind !== 'project') return library.launch(lib.launch);
    return openPath(p);
  }, true);

  handle('reveal', (p) => {
    if (!String(p).startsWith('shell:') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(String(p))) shell.showItemInFolder(p);
  });

  handle('setCategory', async (key, cat) => {
    const s = store();
    if (cat) s.overrides[key] = cat;
    else delete s.overrides[key];
    save();
    invalidate();
    return getState();
  }, true);

  handle('togglePin', async (key) => {
    const s = store();
    s.pins = s.pins.includes(key) ? s.pins.filter((k) => k !== key) : [...s.pins, key];
    save();
    invalidate();
    return getState();
  }, true);

  handle('hide', async (key) => {
    const s = store();
    if (!s.hidden.includes(key)) s.hidden.push(key);
    save();
    invalidate();
    return getState();
  }, true);

  handle('unhideAll', async () => {
    store().hidden = [];
    save();
    invalidate();
    return getState();
  }, true);

  handle('addCategory', async ({ name, color }) => {
    const s = store();
    const id = 'c_' + Date.now().toString(36);
    s.customCategories.push({ id, name: String(name).slice(0, 24), color: color || '#8b5cf6', icon: 'Tag' });
    save();
    invalidate();
    return getState();
  }, true);

  handle('deleteCategory', async (id) => {
    const s = store();
    s.customCategories = s.customCategories.filter((c) => c.id !== id);
    for (const k of Object.keys(s.overrides)) if (s.overrides[k] === id) delete s.overrides[k];
    s.rules = s.rules.filter((r) => r.cat !== id);
    delete s.panelPrefs[id];
    delete s.panels[id];
    save();
    invalidate();
    return getState();
  }, true);

  handle('setPrefs', async (p) => {
    const s = store();
    const hotkeyChanged = p.searchHotkey && p.searchHotkey !== s.prefs.searchHotkey;
    p = { ...p };
    if ('panelsDisplay' in p && p.panelsDisplay !== null && !displays.known(p.panelsDisplay)) delete p.panelsDisplay; // only screens that exist
    if ('panelsDisplay' in p && p.panelsDisplay !== null) p.panelsDisplay = String(p.panelsDisplay);
    s.prefs = { ...s.prefs, ...p };
    save();
    invalidate();
    if (hotkeyChanged) {
      registerHotkeys();
      buildTrayMenu();
    }
    applyDock();
    return s.prefs;
  }, true);

  // Per-panel look: { name, color, view: 'grid' | 'list', collapsed }. null/'' removes a field.
  handle('setPanelPrefs', async (id, patch) => {
    const s = store();
    const next = { ...(s.panelPrefs[id] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === '' || next[k] === undefined) delete next[k];
    if (Object.keys(next).length) s.panelPrefs[id] = next;
    else delete s.panelPrefs[id];
    save();
    invalidate();
    return getState();
  }, true);

  // Sorting rules
  handle('addRule', async ({ field, op, value, cat }) => {
    const v = String(value || '').trim().slice(0, 120);
    if (!v) return getState();
    store().rules.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      field: ['name', 'path', 'ext'].includes(field) ? field : 'name',
      op: ['contains', 'startsWith', 'equals', 'regex'].includes(op) ? op : 'contains',
      value: v,
      cat,
      enabled: true,
    });
    save();
    invalidate();
    return getState();
  }, true);

  handle('deleteRule', async (id) => {
    const s = store();
    s.rules = s.rules.filter((r) => r.id !== id);
    save();
    invalidate();
    return getState();
  }, true);

  handle('toggleRule', async (id) => {
    const r = store().rules.find((x) => x.id === id);
    if (r) r.enabled = r.enabled === false;
    save();
    invalidate();
    return getState();
  }, true);

  handle('moveRule', async (id, delta) => {
    const rules = store().rules;
    const i = rules.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i > -1 && j >= 0 && j < rules.length) [rules[i], rules[j]] = [rules[j], rules[i]];
    save();
    invalidate();
    return getState();
  }, true);

  // Tidy
  handle('tidyPreview', async () => {
    const state = await getState();
    const p = tidy.plan(state.items, state.categories, state.primary, state.elevated);
    return {
      elevated: state.elevated,
      groups: p.groups.map((g) => ({
        cat: g.cat,
        folder: g.folder,
        moves: g.moves.map((m) => ({ key: m.key, name: m.name, icon: m.icon })),
      })),
      total: p.moves.length,
      skipped: p.skipped,
      primary: state.primary,
    };
  });

  handle('tidyApply', async () => {
    invalidate();
    const state = await getState();
    const p = tidy.plan(state.items, state.categories, state.primary, state.elevated);
    const result = tidy.apply(p.moves, store());
    save();
    invalidate();
    return { moved: result.moved, attempted: p.moves.length, state: await getState() };
  }, true);

  handle('tidyUndo', async () => {
    const result = tidy.undo(store());
    save();
    invalidate();
    return { restored: result.restored, failed: result.failed || 0, state: await getState() };
  }, true);

  handle('relaunchAdmin', () => relaunchAsAdmin());
  handle('setDesktopMode', (on) => setDesktopMode(on));
  handle('setAutostart', (on) => setAutostart(on));
  handle('resetPanels', async () => {
    if (panels.isEnabled()) await panels.resetLayout(await getState());
  });
  handle('copyText', (t) => clipboard.writeText(String(t).slice(0, 2000)));

  // Hover toolbar actions. Only items Deskly itself listed can be acted on.
  handle('runAsAdmin', (p) => {
    const it = lastItems.find((i) => i.path === p && !i.lib && (i.kind === 'shortcut' || i.kind === 'file'));
    if (!it) return 'Not found';
    const q = `'${String(it.path).replace(/'/g, "''")}'`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath ${q} -Verb RunAs`], { windowsHide: true }, () => {});
    return null;
  });

  handle('dockData', () => {
    const s = store();
    return {
      apps: dockApps().map((i) => ({ key: i.key, name: i.name, icon: i.icon, path: i.path })),
      scene: s.scenes.find((x) => x.id === s.prefs.scene) || null,
      hidden: panels.isHidden(),
      running: s.prefs.showRunning ? runningKeys(lastItems) : [],
    };
  });
  handle('togglePeekAll', () => togglePeekAll());
  handle('toggleSearch', () => toggleSearch());
  handle('peekFolder', (p) => peekFolder(p));
  ipcMain.handle('deskly:peekHide', () => {
    if (peekWin && !peekWin.isDestroyed()) peekWin.hide();
  });

  handle('closeApp', (key) => {
    const it = lastItems.find((i) => i.key === key);
    if (!it || !it.exe) return { ok: false, error: 'That app is not running.' };
    if (PROTECTED.has(it.exe.replace(/\.exe$/i, ''))) return { ok: false, error: `${it.name} is needed by Windows.` };
    // no /F: asks the app to close politely, so unsaved work can still prompt
    return new Promise((resolve) => execFile('taskkill', ['/IM', it.exe], { windowsHide: true }, (err) => resolve({ ok: !err })));
  });

  /* ----- library ----- */
  handle('getLibrary', async (force) => {
    const lib = await ensureLibrary(!!force);
    const s = store();
    const launchables = [...lib.apps, ...lib.games, ...lib.chrome];
    library.assignCategories(launchables, s, validCats());
    const deskNames = new Set(lastItems.filter((i) => !i.lib).map((i) => norm(i.name)));
    const mark = (list) => list.map((l) => ({ ...l, onDesktop: deskNames.has(norm(l.name)), pinnedToPanel: s.libPins.includes(l.key) }));
    const projects = lib.projects.map((p) => ({ ...p, workspace: s.workspaces[p.key] || null, suggest: wsp.suggestStart(p.path) }));
    return { apps: mark(lib.apps), games: mark(lib.games), chrome: mark(lib.chrome), projects, t: lib.t };
  });

  /* ----- automation ----- */
  handle('addAutoRule', async (rule) => {
    const s = store();
    if (!rule || !s.scenes.some((x) => x.id === rule.scene)) return getState();
    const when = sanitizeWhen(rule.when);
    if (!when) return getState();
    if (when.kind === 'lowbat' || when.kind === 'hot') health.probe().catch(() => {});
    s.automation.rules.push({ id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), when, scene: rule.scene, restore: rule.restore !== false, enabled: true });
    save();
    invalidate();
    setTimeout(() => automation.evaluate(), 300);
    return getState();
  }, true);

  handle('healthProbe', async () => {
    await health.probe();
    return health.summary();
  });
  handle('healthReport', (span) => health.report(Math.min(30, Math.max(1, Number(span) || 7))));

  handle('deleteAutoRule', async (id) => {
    const s = store();
    s.automation.rules = s.automation.rules.filter((r) => r.id !== id);
    save();
    invalidate();
    return getState();
  }, true);

  handle('toggleAutoRule', async (id) => {
    const r = store().automation.rules.find((x) => x.id === id);
    if (r) r.enabled = r.enabled === false;
    save();
    invalidate();
    return getState();
  }, true);

  // programs running right now, for the "when this app runs" picker
  handle('runningNames', () => {
    const noise = /^(svchost|conhost|dllhost|csrss|smss|wininit|services|lsass|system|registry|fontdrvhost|dwm|sihost|taskhostw|ctfmon|audiodg|searchhost|runtimebroker|backgroundtaskhost|wudfhost|msedgewebview2|tasklist|powershell|cmd|node|python|explorer|winlogon|spoolsv|memory compression|secure system|textinputhost|shellexperiencehost|startmenuexperiencehost|applicationframehost|systemsettings|lockapp|securityhealthsystray|deskly)\.exe$/i;
    return [...runningExes].filter((n) => /\.exe$/i.test(n) && !noise.test(n)).sort();
  });

  /* ----- workspaces and servers ----- */
  handle('saveWorkspace', async (key, ws) => {
    const s = store();
    if (!libByKey.has(key)) return null;
    const clean = {
      editor: ws.editor !== false,
      terminal: !!ws.terminal,
      urls: (Array.isArray(ws.urls) ? ws.urls : []).map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8),
      start: String(ws.start || '').trim().slice(0, 240),
    };
    if (!clean.terminal && clean.editor && !clean.urls.length && !clean.start) delete s.workspaces[key];
    else s.workspaces[key] = clean;
    save();
    return clean;
  });

  handle('launchWorkspace', (key) => {
    const p = libByKey.get(key);
    if (!p) return ['Project not found'];
    bumpUsage(key);
    return wsp.launchWorkspace(p, store().workspaces[key] || { editor: true }, library, managed);
  });

  handle('mgdList', () => managed.list());
  handle('mgdLog', (id) => managed.log(id));
  handle('mgdStop', (id) => managed.stop(id));
  handle('mgdRemove', (id) => {
    managed.remove(id);
    sendAll('deskly:mgd', managed.list());
  });
  handle('mgdStart', (key) => {
    const p = libByKey.get(key);
    const ws = store().workspaces[key];
    if (!p || !ws || !ws.start) return { ok: false, error: 'Set a start command for this project first.' };
    try {
      return { ok: true, id: managed.start({ key, name: p.name, cwd: p.path, cmd: ws.start }) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  handle('procScan', () => procgroups.scan());
  handle('procEnd', (keys) => procgroups.end(keys));

  handle('getRecent', async () => {
    if (Date.now() - recentCache.t > 30000) recentCache = { t: Date.now(), items: await library.scanRecent() };
    return recentCache.items;
  });

  handle('pinLib', async (key, on) => {
    const s = store();
    s.libPins = on ? [...new Set([...s.libPins, key])] : s.libPins.filter((k) => k !== key);
    save();
    invalidate();
    return getState();
  }, true);

  handle('launchKey', (key, alt) => launchKey(key, !!alt), true);

  handle('projectAction', (key, action) => {
    const p = libByKey.get(key);
    if (p) bumpUsage(key);
    return library.projectAction(p, action);
  }, true);

  /* ----- performance ----- */
  ipcMain.handle('deskly:sysSubscribe', (e, detail) => {
    const id = e.sender.id;
    if (!sysWatched.has(id)) {
      sysWatched.add(id);
      e.sender.once('destroyed', () => {
        sysWatched.delete(id);
        sysmon.unsubscribe(id);
      });
    }
    return sysmon.subscribe(id, !!detail);
  });
  ipcMain.handle('deskly:sysUnsubscribe', (e) => sysmon.unsubscribe(e.sender.id));
  ipcMain.handle('deskly:killProcs', (_e, pids) => sysmon.kill(pids));
  ipcMain.handle('deskly:openPort', (_e, port) => {
    const n = Number(port);
    const known = (sysmon.latest() && sysmon.latest().servers) || [];
    if (!known.some((s) => s.port === n) && !managed.list().some((m) => m.port === n)) return false;
    shell.openExternal(`http://localhost:${n}`);
    return true;
  });

  handle('startupList', () => startup.list());
  handle('startupSet', (id, enabled) => startup.setEnabled(id, !!enabled));

  let cleaning = false;
  ipcMain.handle('deskly:cleanScan', async (e) => {
    if (cleaning) return null;
    cleaning = true;
    try {
      return await cleaner.scan(library.projectRoots(store()), (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('deskly:cleanProgress', p);
      });
    } finally {
      cleaning = false;
    }
  });
  ipcMain.handle('deskly:cleanRemove', (_e, ids) => cleaner.remove(ids));

  /* ----- export / import your setup ----- */
  let pendingSetup = null; // a file the user picked, already sanitized, waiting for "Import"
  let lastBackup = null;
  const refreshAfterSetup = async () => {
    invalidate();
    registerHotkeys();
    buildTrayMenu();
    applyDock();
    notify();
  };

  handle('updateStatus', () => updater.status());
  handle('updateCheck', async () => {
    await updater.check(true);
    return updater.status();
  });
  handle('updateDownload', async () => {
    await updater.download();
    return updater.status();
  });
  handle('updateInstall', () => {
    if (updater.status().state === 'ready') quitting = true; // let the window close for real
    return updater.install();
  });
  handle('updateSetAuto', (on) => {
    updater.setAuto(!!on);
    return updater.status();
  });

  handle('setupSections', () => setup.SECTIONS);

  ipcMain.handle('deskly:setupExport', async (e, ids) => {
    const sel = (Array.isArray(ids) ? ids : []).filter((id) => setup.SECTIONS.some((s) => s.id === id));
    if (!sel.length) return { ok: false, error: 'Choose at least one thing to export.' };
    const owner = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(owner, {
      title: 'Export your Deskly setup',
      defaultPath: path.join(app.getPath('documents'), `Deskly-setup-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'Deskly setup', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(r.filePath, JSON.stringify(setup.build(store(), sel, app.getVersion()), null, 2));
      return { ok: true, path: r.filePath, sections: sel.length };
    } catch (err) {
      return { ok: false, error: 'Could not write the file: ' + err.message };
    }
  });

  ipcMain.handle('deskly:setupPick', async (e) => {
    const owner = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(owner, { title: 'Import a Deskly setup', properties: ['openFile'], filters: [{ name: 'Deskly setup', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    try {
      const f = r.filePaths[0];
      if (fs.statSync(f).size > setup.MAX_BYTES) return { ok: false, error: 'That file is too big to be a Deskly setup.' };
      const parsed = setup.parse(fs.readFileSync(f, 'utf8'));
      if (!parsed.ok) return parsed;
      pendingSetup = parsed;
      return { ok: true, file: path.basename(f), summary: parsed.summary };
    } catch (err) {
      return { ok: false, error: 'Could not read the file: ' + err.message };
    }
  });

  ipcMain.handle('deskly:setupImport', async (_e, ids) => {
    if (!pendingSetup) return { ok: false, error: 'Choose a file first.' };
    const sel = (Array.isArray(ids) ? ids : []).filter((id) => pendingSetup.doc.sections[id]);
    if (!sel.length) return { ok: false, error: 'Choose at least one thing to import.' };
    // a copy of the current setup first, so the import can be undone
    try {
      const dir = path.join(app.getPath('userData'), 'backups');
      fs.mkdirSync(dir, { recursive: true });
      lastBackup = path.join(dir, `before-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(lastBackup, JSON.stringify(store(), null, 2));
      const old = fs.readdirSync(dir).filter((n) => n.startsWith('before-import-')).sort();
      for (const n of old.slice(0, Math.max(0, old.length - 5))) fs.rmSync(path.join(dir, n), { force: true });
    } catch (err) {
      return { ok: false, error: 'Could not back up your current setup, so nothing was imported: ' + err.message };
    }
    const done = setup.apply(store(), pendingSetup.doc, sel);
    save();
    pendingSetup = null;
    await refreshAfterSetup();
    return { ok: true, done, canUndo: true };
  });

  ipcMain.handle('deskly:setupUndo', async () => {
    if (!lastBackup || !fs.existsSync(lastBackup)) return { ok: false, error: 'There is nothing to undo.' };
    try {
      storeApi.replace(JSON.parse(fs.readFileSync(lastBackup, 'utf8')));
      lastBackup = null;
      await refreshAfterSetup();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Could not restore: ' + err.message };
    }
  });

  /* ----- files: Downloads, screenshots, duplicates, big and old ----- */
  const age = (v, d) => Math.min(24 * 365, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : d));
  handle('filesDownloadsPlan', (o) => files.downloadsPlan({ minAgeHours: age(o && o.minAgeHours, 24) }));
  handle('filesScreenshotsPlan', (o) => files.screenshotsPlan({ minAgeHours: age(o && o.minAgeHours, 1) }));
  handle('filesApply', (kind, groupIds, excludeIds) => {
    if (kind !== 'downloads' && kind !== 'screenshots') return { moved: 0, failed: [] };
    const r = files.applyGroups(kind, groupIds, excludeIds, store(), kind === 'downloads' ? 'Sorted Downloads' : 'Filed screenshots');
    save();
    return r;
  });
  handle('filesHistory', () => files.history(store()));
  handle('filesUndo', (batchId) => {
    const r = files.undoMoves(store(), batchId);
    save();
    return r;
  });
  handle('filesThumb', (id) => files.thumb(String(id)));
  handle('filesReveal', (id) => files.revealId(String(id)));
  handle('filesTrash', (ids) => files.trash(Array.isArray(ids) ? ids.map(String).slice(0, 2000) : []));
  handle('filesCancel', () => files.cancel());
  let filesBusy = false;
  const filesScan = (kind) => async (e, opts) => {
    if (filesBusy) return { busy: true };
    filesBusy = true;
    const progress = (p) => { if (!e.sender.isDestroyed()) e.sender.send('deskly:filesProgress', p); };
    try {
      return kind === 'big' ? await files.scanBig(opts || {}, progress) : await files.scanDupes(opts || {}, progress);
    } finally {
      filesBusy = false;
    }
  };
  ipcMain.handle('deskly:filesScanBig', filesScan('big'));
  ipcMain.handle('deskly:filesScanDupes', filesScan('dupes'));

  /* ----- scenes ----- */
  handle('applyScene', (id) => applyScene(id));

  handle('saveScene', async (sc) => {
    seedScenes();
    const s = store();
    const clean = {
      id: sc.id && s.scenes.some((x) => x.id === sc.id) ? sc.id : 's_' + Date.now().toString(36),
      name: String(sc.name || 'Scene').slice(0, 24),
      icon: sc.icon || 'Sparkles',
      color: sc.color || '#8b5cf6',
      show: sc.show === 'all' ? 'all' : (Array.isArray(sc.show) ? sc.show.map(String).slice(0, 60) : []),
      launch: (Array.isArray(sc.launch) ? sc.launch.map(String) : []).slice(0, 12),
    };
    const i = s.scenes.findIndex((x) => x.id === clean.id);
    if (i > -1) s.scenes[i] = clean;
    else s.scenes.push(clean);
    save();
    registerHotkeys();
    buildTrayMenu();
    invalidate();
    return getState();
  }, true);

  handle('deleteScene', async (id) => {
    const s = store();
    s.scenes = s.scenes.filter((x) => x.id !== id);
    if (s.prefs.scene === id) s.prefs.scene = null;
    save();
    registerHotkeys();
    buildTrayMenu();
    invalidate();
    const st = await getState();
    if (panels.isEnabled()) panels.sync(st);
    return st;
  }, true);

  handle('setWeatherCity', async (city) => {
    const s = store();
    s.prefs.weatherCity = String(city || '').trim().slice(0, 60);
    s.weather = null;
    save();
    await updateWeather(true);
    return getState();
  }, true);

  /* ----- search window ----- */
  ipcMain.handle('deskly:searchData', async () => {
    const st = await getState();
    const s = store();
    const lib = libCache;
    if (!lib) ensureLibrary().then(() => notify());
    const cats = Object.fromEntries(st.categories.map((c) => [c.id, c.name]));
    const use = (k) => (s.usage[k] ? s.usage[k].n : 0);
    const entries = [];
    const have = new Set();
    for (const i of st.items) {
      have.add(norm(i.name));
      entries.push({ type: 'item', key: i.key, name: i.name, sub: i.lib ? i.source : cats[i.category] || 'Desktop', kind: 'Desktop', icon: i.icon, use: use(i.key), pinned: i.pinned });
    }
    if (lib) {
      library.assignCategories([...lib.apps, ...lib.games, ...lib.chrome], s, validCats());
      for (const l of [...lib.games, ...lib.chrome, ...lib.apps]) {
        if (have.has(norm(l.name)) || entries.some((x) => x.key === l.key)) continue;
        have.add(norm(l.name));
        entries.push({ type: 'lib', key: l.key, name: l.name, sub: l.source, kind: l.kind === 'game' ? 'Game' : l.kind === 'chrome' ? 'Browser' : 'App', icon: l.icon, use: use(l.key) });
      }
      for (const p of lib.projects) {
        entries.push({ type: 'project', key: p.key, name: p.name, sub: `${p.branch ? p.branch + ' · ' : ''}${p.type}`, kind: 'Project', icon: null, use: use(p.key) });
      }
    }
    for (const sc of st.scenes) entries.push({ type: 'scene', id: sc.id, name: `Scene: ${sc.name}`, sub: 'Switch panels', kind: 'Scene', icon: null, color: sc.color, use: 0 });
    const actions = [
      ['open', 'Open Deskly', 'Show the main window'],
      ['perf', 'Performance', 'CPU, RAM, GPU, dev servers, startup, storage'],
      ['apps', 'All apps', 'Everything installed on this PC'],
      ['panels', st.prefs.desktopMode ? 'Turn desktop panels off' : 'Turn desktop panels on', 'Toggle the panels on your desktop'],
      ['quit', 'Quit Deskly', 'Close Deskly completely'],
    ];
    for (const [id, name, sub] of actions) entries.push({ type: 'action', id, name, sub, kind: 'Action', icon: null, use: 0 });
    return { entries, indexing: !lib, hotkey: hotkeyActive };
  });

  ipcMain.handle('deskly:searchRun', async (_e, entry, alt) => {
    if (!entry) return;
    if (searchWin && !searchWin.isDestroyed()) searchWin.hide();
    if (entry.type === 'item' || entry.type === 'lib' || entry.type === 'project') {
      await launchKey(entry.key, !!alt);
      notify();
    } else if (entry.type === 'scene') await applyScene(entry.id);
    else if (entry.type === 'action') {
      if (entry.id === 'open') showMain();
      else if (entry.id === 'perf') showMain('performance');
      else if (entry.id === 'apps') showMain('apps');
      else if (entry.id === 'panels') {
        await setDesktopMode(!store().prefs.desktopMode);
        notify();
      } else if (entry.id === 'quit') app.quit();
    }
  });
  ipcMain.handle('deskly:searchHide', () => {
    if (searchWin && !searchWin.isDestroyed()) searchWin.hide();
  });

  ipcMain.on('deskly:panelDrag', (e, phase, sx, sy) => panels.drag(e.sender.id, phase, sx, sy));
  ipcMain.on('deskly:openMain', (_e, page) => showMain(page));
}

/* ---------- read-only diagnostic ---------- */
async function selfTest() {
  const state = await getState();
  const rows = state.items.map(
    (it) => `${it.category.padEnd(9)} ${it.kind.padEnd(9)} ${it.owner.padEnd(7)} ${it.icon ? 'icon' : 'NO-ICON'} ${it.sensitive ? 'SENSITIVE ' : ''}${it.name}`
  );
  rows.sort();
  console.log('PRIMARY', state.primary);
  console.log(rows.join('\n'));
  const p = tidy.plan(state.items, state.categories, state.primary, state.elevated);
  console.log('ELEVATED', state.elevated, '| PANELS AVAILABLE', state.panelsAvailable);
  console.log('\nTIDY PLAN:', p.moves.length, 'moves;', JSON.stringify({ ...p.skipped, publicItems: p.skipped.publicItems.length }));
  app.quit();
}

/* ---------- lifecycle ---------- */
app.whenReady().then(async () => {
  protocol.handle('deskly-icon', (req) => {
    const f = path.basename(new URL(req.url).pathname);
    if (!/^[a-f0-9]{20}\.png$/.test(f)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(path.join(scanner.iconDir(), f)).toString());
  });

  registerIpc();
  if (SELFTEST) return selfTest();
  seedScenes();
  // The welcome tour is for brand-new installs only; anyone with an existing setup skips it.
  if (store().prefs.onboarded === undefined) {
    store().prefs.onboarded = !storeApi.isFresh();
    save();
  }

  // Crash safety: if a previous run hid the desktop icons and desktop panels are now off, bring them back.
  if (store().iconsHiddenByUs && !store().prefs.desktopMode) panels.restoreIcons();

  registerHotkeys();
  createTray();
  watchDesktops();
  setInterval(pollRunning, 6000);
  setTimeout(pollRunning, 1500);
  automation.start();
  alerts.start();
  health.start();
  updater.start();
  // Screens plugged in / out / resized: re-fit the panels and the dock (debounced: Windows sends bursts of events)
  let screenTimer = null;
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(ev, () => {
      clearTimeout(screenTimer);
      screenTimer = setTimeout(() => notify(), 900);
    });
  }
  setInterval(() => updateWeather(false), 5 * 60 * 1000);
  updateWeather(false);
  // index every installed app in the background so search and "All apps" are instant
  setTimeout(() => ensureLibrary().then(() => notify()), 2500);

  let panelsRunning = false;
  if (store().prefs.desktopMode && !isElevated()) {
    panelsRunning = await panels.enable(await getState());
    if (!panelsRunning) {
      store().prefs.desktopMode = false;
      save();
    }
  }
  applyDock();
  // Started with Windows and panels are up: stay quiet in the tray.
  if (!(START_HIDDEN && panelsRunning)) createWindow();
});

app.on('second-instance', () => showMain());

app.on('before-quit', () => {
  quitting = true;
  globalShortcut.unregisterAll();
  automation.stop();
  alerts.stop();
  health.stop();
  updater.stop();
  sysmon.stop();
  managed.stopAllSync(); // servers Deskly started stop with it, so none are left running unseen
  panels.restoreIcons(); // never leave the user with an empty desktop
});

app.on('window-all-closed', () => {
  if (!panels.isEnabled() && !store().prefs.background) app.quit();
});
