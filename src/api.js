// In Electron this is the real bridge (window.deskly). In a plain browser
// (design preview) we fall back to an in-memory mock so the UI can be developed
// and checked without touching any real files.

export const isElectron = typeof window !== 'undefined' && !!window.deskly;

const CATS = [
  { id: 'games', name: 'Games', icon: 'Gamepad2', color: '#ff4d8d', blurb: 'Launchers and games' },
  { id: 'dev', name: 'Dev', icon: 'Code2', color: '#38bdf8', blurb: 'Editors, Git and AI tooling' },
  { id: 'creative', name: 'Creative', icon: 'Palette', color: '#a78bfa', blurb: 'Design, video and content' },
  { id: 'work', name: 'Work', icon: 'Briefcase', color: '#34d399', blurb: 'Office, Google and notes' },
  { id: 'media', name: 'Media', icon: 'Clapperboard', color: '#fb923c', blurb: 'Watch and listen' },
  { id: 'web', name: 'Web', icon: 'Globe', color: '#60a5fa', blurb: 'Browsers and web apps' },
  { id: 'comms', name: 'Comms', icon: 'MessageCircle', color: '#2dd4bf', blurb: 'Chat, sharing and remote' },
  { id: 'system', name: 'System', icon: 'Wrench', color: '#94a3b8', blurb: 'Hardware and utilities' },
  { id: 'folders', name: 'Folders', icon: 'Folder', color: '#fbbf24', blurb: 'Projects and locations' },
  { id: 'files', name: 'Files', icon: 'FileText', color: '#f472b6', blurb: 'Documents and loose files' },
  { id: 'other', name: 'Other', icon: 'Shapes', color: '#a3a3a3', blurb: 'Everything else' },
];

const SAMPLE = [
  ['Steam', 'games', 'shortcut', 'public'], ['Epic Games Launcher', 'games', 'shortcut', 'public'],
  ['Rockstar Games Launcher', 'games', 'shortcut', 'user'], ['EA', 'games', 'shortcut', 'public'],
  ['It Takes Two', 'games', 'shortcut', 'public'], ['Alan Wake 2', 'games', 'url', 'user'],
  ['Visual Studio Code', 'dev', 'shortcut', 'user'], ['GitHub Desktop', 'dev', 'shortcut', 'user'],
  ['Antigravity', 'dev', 'shortcut', 'user'], ['Git Bash', 'dev', 'shortcut', 'public'],
  ['Insomnia', 'dev', 'shortcut', 'user'], ['Lemonade Server', 'dev', 'shortcut', 'user'],
  ['OBS Studio', 'creative', 'shortcut', 'public'], ['GIMP 3.2.6', 'creative', 'shortcut', 'public'],
  ['EffectCraft', 'creative', 'shortcut', 'public'], ['PdfCraft', 'creative', 'shortcut', 'public'],
  ['VectorCraft', 'creative', 'shortcut', 'public'], ['Recordly', 'creative', 'shortcut', 'public'],
  ['ArtCraft Launcher', 'creative', 'shortcut', 'user'], ['4K Wallpapers', 'creative', 'shortcut', 'user'],
  ['Excel', 'work', 'shortcut', 'user'], ['Google Docs', 'work', 'shortcut', 'user'],
  ['Google Sheets', 'work', 'shortcut', 'user'], ['Google Slides', 'work', 'shortcut', 'user'],
  ['Google Drive', 'work', 'shortcut', 'user'], ['Google Keep', 'work', 'shortcut', 'user'],
  ['Obsidian', 'work', 'shortcut', 'public'], ['MetaTrader 5', 'work', 'shortcut', 'public'],
  ['Marjane Mall - Seller Zone', 'work', 'shortcut', 'user'],
  ['Netflix', 'media', 'shortcut', 'user'], ['Stremio', 'media', 'shortcut', 'user'],
  ['VLC media player', 'media', 'shortcut', 'public'],
  ['Google Chrome', 'web', 'shortcut', 'public'], ['Microsoft Edge', 'web', 'shortcut', 'public'],
  ['Work - Chrome', 'web', 'shortcut', 'user'],
  ['Telegram', 'comms', 'shortcut', 'user'], ['LocalSend', 'comms', 'shortcut', 'public'],
  ['RustDesk', 'comms', 'shortcut', 'public'],
  ['NVIDIA App', 'system', 'shortcut', 'public'], ['Logitech G HUB', 'system', 'shortcut', 'public'],
  ['WizTree', 'system', 'shortcut', 'user'], ['File Explorer', 'system', 'shortcut', 'user'],
  ['FrameView', 'system', 'shortcut', 'public'], ['NVIDIA Broadcast', 'system', 'shortcut', 'public'],
  ['Applications', 'folders', 'dir', 'user'], ['video-project', 'folders', 'dir', 'user'],
  ['Design samples', 'folders', 'dir', 'user'], ['Projects - Shortcut', 'folders', 'shortcut', 'user'],
  ['Omarchy_DualBoot_Checklist.md', 'files', 'file', 'user'],
];

function svgIcon(name, color) {
  const hue = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const l = (name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 70% 42%)"/></linearGradient></defs><rect x="20" y="20" width="216" height="216" rx="56" fill="url(#g)"/><text x="128" y="170" font-family="Segoe UI,Arial" font-weight="700" font-size="120" text-anchor="middle" fill="white">${l}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const WIDGETS = [
  { id: 'w_sys', name: 'System', icon: 'Activity', color: '#38bdf8', blurb: 'CPU, RAM, GPU, disk and what is using them' },
  { id: 'w_dev', name: 'Dev servers', icon: 'Server', color: '#34d399', blurb: 'Local servers that are running right now' },
  { id: 'w_projects', name: 'Projects', icon: 'GitBranch', color: '#fb923c', blurb: 'Your git projects, newest first' },
  { id: 'w_recent', name: 'Recent', icon: 'History', color: '#f472b6', blurb: 'Files you opened lately' },
  { id: 'w_clock', name: 'Clock', icon: 'Clock', color: '#a78bfa', blurb: 'Time, date and weather' },
];

let onClean = null;
let onFiles = null;
let tickN = 0;
function fakeSample() {
  tickN++;
  const wob = (base, amp) => Math.max(1, Math.min(99, base + Math.sin(tickN / 3) * amp + Math.random() * amp));
  const GB = 1024 ** 3;
  return {
    t: Date.now(), cpu: wob(18, 12), cores: 16, procCount: 916,
    ram: { used: 24.3 * GB, total: 31.1 * GB },
    gpu: { name: 'NVIDIA GeForce RTX 5060 Laptop GPU', util: wob(8, 6), memUsed: 0.9 * GB, memTotal: 8 * GB, temp: 56, power: 14, apps: ['chrome', 'dwm'] },
    disks: [{ drive: 'C:', label: 'Windows', total: 893 * GB, free: 170 * GB }, { drive: 'G:', label: 'Data', total: 893 * GB, free: 162 * GB }],
    hogs: {
      cpu: [{ name: 'claude', cpu: 3.1, ram: 3.2 * GB, count: 19, pids: [1] }, { name: 'Antigravity', cpu: 2.1, ram: 1.4 * GB, count: 13, pids: [2] }, { name: 'svchost', cpu: 1.2, ram: 0.2 * GB, count: 80, pids: [3] }],
      ram: [{ name: 'node', cpu: 0.4, ram: 11.1 * GB, count: 181, pids: [4] }, { name: 'claude', cpu: 3.1, ram: 3.2 * GB, count: 19, pids: [1] }, { name: 'chrome', cpu: 1, ram: 2.3 * GB, count: 24, pids: [5] }, { name: 'msedgewebview2', cpu: 0.2, ram: 2 * GB, count: 31, pids: [6] }],
      gpu: [{ name: 'chrome', gpu: 6.2, pids: [5] }, { name: 'dwm', gpu: 2.1, pids: [7] }],
    },
    servers: [
      { port: 5173, pid: 40, name: 'node', cmd: 'node C:\\Users\\you\\projects\\website\\node_modules\\vite\\bin\\vite.js', start: Date.now() - 3 * 3600000, ram: 0.35 * GB },
      { port: 8000, pid: 41, name: 'python', cmd: 'python -m uvicorn app:app --port 8000 C:\\Users\\you\\projects\\api-server', start: Date.now() - 9 * 3600000, ram: 0.12 * GB },
    ],
  };
}

function createMock() {
  let customs = [];
  let prefs = {
    size: 'm', desktopMode: false, autostart: false, panelOpacity: 0.9, panelsLocked: false, snap: true, showQuick: true, showRunning: true, autoSort: false,
    density: 'compact', layoutMode: 'hub', layout: 'left', dock: 'float', dockAutoHide: false,
    background: true, scene: null, widgets: { w_sys: true, w_dev: true, w_projects: false, w_recent: false, w_clock: false }, searchHotkey: 'Alt+Space', weatherCity: '',
  };
  let scenes = [
    { id: 's_work', name: 'Work', icon: 'Briefcase', color: '#34d399', show: ['quick', 'work', 'dev', 'web', 'w_projects'], launch: [] },
    { id: 's_gaming', name: 'Gaming', icon: 'Gamepad2', color: '#ff4d8d', show: ['quick', 'games', 'w_sys'], launch: ['steam.lnk'] },
    { id: 's_all', name: 'Everything', icon: 'LayoutGrid', color: '#8b5cf6', show: 'all', launch: [] },
    { id: 's_light', name: 'Light mode', icon: 'BatteryLow', color: '#fbbf24', show: ['quick', 'w_clock'], launch: [] },
  ];
  let panelPrefs = {};
  let autoRules = [{ id: 'a1', when: { kind: 'app', exe: 'steam.exe', label: 'Steam' }, scene: 's_gaming', restore: true, enabled: true }];
  let rules = [{ id: 'r_demo', field: 'name', op: 'contains', value: 'craft', cat: 'creative', enabled: true }];
  let tidied = false;
  let canUndo = false;
  const items = SAMPLE.map(([name, category, kind, owner]) => ({
    key: name.toLowerCase() + (kind === 'shortcut' ? '.lnk' : ''),
    name, file: name, path: 'C:\\Desktop\\' + name, kind, owner,
    category, auto: category, pinned: ['Steam', 'Visual Studio Code', 'Telegram', 'Google Chrome'].includes(name),
    sensitive: false, movable: owner === 'user' && kind !== 'dir', loose: true,
    icon: svgIcon(name), ext: '', target: '', url: '',
  }));
  items.push({
    key: 'client_secret_x.json', name: 'client_secret_911761538154.json', file: 'client_secret_911761538154.json',
    path: 'C:\\Desktop\\client_secret.json', kind: 'file', owner: 'user', category: 'dev', auto: 'dev', pinned: false,
    sensitive: true, movable: false, loose: true, icon: svgIcon('{}'), ext: '.json', target: '', url: '',
  });

  const state = () => structuredClone({
    items, categories: [...CATS, ...customs], primary: 'C:\\Users\\you\\Desktop',
    canUndo, hiddenCount: 0, prefs, panelsAvailable: true, canAutostart: true, panelsBlocked: false,
    panelPrefs, rules: rules.map((r) => ({ ...r, matches: items.filter((i) => r.value && i.name.toLowerCase().includes(r.value.toLowerCase())).length })),
    quick: { id: 'quick', name: 'Quick access', icon: 'Zap', color: '#fbbf24', keys: items.filter((i) => i.pinned).map((i) => i.key) },
    running: items.slice(0, 4).map((i) => i.key),
    scenes, scene: scenes.find((s) => s.id === prefs.scene) || null, widgetDefs: WIDGETS,
    weather: prefs.weatherCity ? { city: prefs.weatherCity, temp: 24, code: 1, isDay: true } : null,
    health: { hasBattery: true, hasGpuTemp: true, batteryPct: 56, gpuTemp: 56 },
    displays: [
      { id: '200', number: 1, name: 'DELL U2720Q', primary: false, width: 2560, height: 1440, scale: 1 },
      { id: '100', number: 2, name: 'Laptop panel', primary: true, width: 1707, height: 1067, scale: 1.5 },
    ],
    activeDisplay: '100',
    automation: { rules: autoRules, log: [{ t: Date.now() - 600000, text: 'When Steam is running, switch to Gaming' }] },
    libPins: [], libReady: true, hotkey: 'Alt+Space', panelsHidden: false, autoCollapsed: [],
    hubTabs: ['quick', 'games', 'dev', 'creative', 'work', 'media'],
  });
  const wait = (v, ms = 60) => new Promise((r) => setTimeout(() => r(v), ms));

  return {
    scan: () => wait(state(), 500),
    open: async () => null,
    reveal: async () => {},
    setCategory: (key, cat) => { const it = items.find((i) => i.key === key); if (it) it.category = cat || it.auto; return wait(state(), 0); },
    togglePin: (key) => { const it = items.find((i) => i.key === key); if (it) it.pinned = !it.pinned; return wait(state(), 0); },
    hide: (key) => { const i = items.findIndex((x) => x.key === key); if (i > -1) items.splice(i, 1); return wait(state(), 0); },
    unhideAll: () => wait(state(), 0),
    addCategory: ({ name, color }) => { customs.push({ id: 'c_' + Date.now(), name, color, icon: 'Tag', blurb: 'Custom category', custom: true }); return wait(state(), 0); },
    deleteCategory: (id) => { customs = customs.filter((c) => c.id !== id); items.forEach((i) => { if (i.category === id) i.category = i.auto; }); return wait(state(), 0); },
    setPrefs: async (p) => (prefs = { ...prefs, ...p }),
    tidyPreview: () => {
      const cats = [...CATS, ...customs];
      const movable = items.filter((i) => i.movable && i.loose && !tidied);
      const groups = cats.map((c) => ({
        cat: c.id, folder: c.name,
        moves: movable.filter((i) => i.category === c.id).map((i) => ({ key: i.key, name: i.name, icon: i.icon })),
      })).filter((g) => g.moves.length);
      return wait({
        groups, total: movable.length, primary: 'C:\\Users\\you\\Desktop',
        skipped: { sensitive: ['client_secret_911761538154.json'], publicItems: new Array(23).fill('x'), folders: 8, clashes: [] },
      }, 350);
    },
    tidyApply: () => { tidied = true; canUndo = true; items.forEach((i) => (i.loose = false)); return wait({ moved: 25, state: state() }, 900); },
    tidyUndo: () => { tidied = false; canUndo = false; items.forEach((i) => (i.loose = true)); return wait({ restored: 25, state: state() }, 400); },
    relaunchAdmin: async () => false,
    setPanelPrefs: (id, patch) => {
      const next = { ...(panelPrefs[id] || {}), ...patch };
      for (const k of Object.keys(next)) if (next[k] == null || next[k] === '') delete next[k];
      panelPrefs = { ...panelPrefs, [id]: next };
      return wait(state(), 0);
    },
    addRule: (r) => { rules = [...rules, { ...r, id: 'r_' + Date.now(), enabled: true }]; return wait(state(), 0); },
    deleteRule: (id) => { rules = rules.filter((r) => r.id !== id); return wait(state(), 0); },
    toggleRule: (id) => { rules = rules.map((r) => (r.id === id ? { ...r, enabled: r.enabled === false } : r)); return wait(state(), 0); },
    moveRule: (id, d) => {
      const i = rules.findIndex((r) => r.id === id); const j = i + d;
      if (i > -1 && j >= 0 && j < rules.length) { rules = [...rules]; [rules[i], rules[j]] = [rules[j], rules[i]]; }
      return wait(state(), 0);
    },
    onRunning: () => () => {},

    /* ----- library / scenes / performance (sample data for the browser preview) ----- */
    getLibrary: () => {
      const mk = (name, source, kind, i) => ({ key: kind + ':' + name.toLowerCase(), name, source, kind, icon: svgIcon(name), category: ['creative', 'dev', 'work', 'media', 'other', 'games'][i % 6], onDesktop: i % 5 === 0, pinnedToPanel: i % 7 === 0 });
      const names = ['Blender', 'Calculator', 'Canva', 'ChatGPT', 'Apple Devices', 'CADCraft', 'Blackmagic RAW Player', 'AMD Software', 'Camera', 'Character Map', 'Notepad', 'Paint', 'Photos', 'Settings', 'Clock', 'Maps', 'Terminal', 'WhatsApp', 'Xbox', 'Spotify', 'DaVinci Resolve', 'Figma', 'Notion', 'Slack'];
      return wait({
        apps: names.map((n, i) => mk(n, i % 3 === 0 ? 'Store app' : 'Program', 'app', i)),
        games: ['ARC Raiders', 'REANIMAL', 'Alan Wake 2'].map((n, i) => mk(n, 'Epic Games', 'game', i)),
        chrome: ['Personal', 'Focus'].map((n, i) => mk('Chrome · ' + n, n.toLowerCase() + '@example.com', 'chrome', i)),
        projects: ['website', 'api-server', 'crm-app', 'shop-v2'].map((n, i) => ({ key: 'project:' + n, name: n, kind: 'project', type: 'Node', source: 'Node', path: 'C:\\Users\\you\\projects\\' + n, branch: ['main', 'dev', 'LATEST', 'work'][i], dirty: i * 3, ahead: i === 1 ? 9 : 0, behind: i === 0 ? 11 : 0, noUpstream: i === 3, workspace: i === 0 ? { editor: true, terminal: false, urls: [], start: 'npm run dev' } : null, suggest: 'npm run dev', remote: 'git@github.com:me/' + n + '.git', last: Date.now() - i * 86400000 * 2, git: true })),
        t: Date.now() - 120000,
      }, 400);
    },
    getRecent: () => wait(['DESKLY', 'Downloads', 'Invoice.xlsx', 'logo.png', 'notes.md'].map((n) => ({ key: 'recent:' + n, name: n, source: 'C:\\Users\\you\\Documents', icon: svgIcon(n), path: 'C:\\' + n })), 200),
    pinLib: async () => state(),
    launchKey: async () => null,
    projectAction: async () => null,
    copyText: async () => {},
    applyScene: async (id) => { prefs = { ...prefs, scene: id }; return state(); },
    saveScene: async (sc) => { const id = sc.id || 's_' + Date.now(); scenes = scenes.some((s) => s.id === id) ? scenes.map((s) => (s.id === id ? { ...sc, id } : s)) : [...scenes, { ...sc, id }]; return state(); },
    deleteScene: async (id) => { scenes = scenes.filter((s) => s.id !== id); return state(); },
    setWeatherCity: async (c) => { prefs = { ...prefs, weatherCity: c }; return state(); },
    sysSubscribe: async () => fakeSample(),
    sysUnsubscribe: async () => {},
    onSys: (cb) => { const id = setInterval(() => cb(fakeSample()), 2000); return () => clearInterval(id); },
    killProcs: async () => ({ ok: true, killed: 1 }),
    openPort: async () => true,
    startupList: () => wait(['Steam', 'Epic Games Launcher', 'Google Drive', 'NVIDIA Broadcast', 'Logitech G HUB', 'Telegram', 'Microsoft Teams'].map((n, i) => ({ id: 'hkcu:' + n, key: 'startup:' + n, name: n, command: '"C:\\Program Files\\' + n + '\\' + n + '.exe" --minimized', scope: i === 6 ? 'All users' : 'You', editable: i !== 6, enabled: i % 3 !== 0, icon: svgIcon(n),
      impact: i % 3 === 0 ? { level: 'off' } : [{ level: 'high', ram: 610 * 1048576, cpu: 140, atBoot: true }, { level: 'medium', ram: 240 * 1048576, cpu: 40, atBoot: true }, { level: 'low', ram: 60 * 1048576, cpu: 3, atBoot: true }, { level: 'unknown', reason: 'not running right now' }][i % 4] })), 300),
    updateStatus: async () => ({ state: 'available', current: '2.0.0', version: '2.1.0', notes: 'Faster startup estimate, new screenshot filing options.', progress: 0, error: null, checkedAt: Date.now() - 60000, auto: true, installed: true }),
    updateCheck: async () => ({ state: 'current', current: '2.0.0', version: null, notes: '', progress: 0, error: null, checkedAt: Date.now(), auto: true, installed: true }),
    updateDownload: async () => ({ state: 'ready', current: '2.0.0', version: '2.1.0', notes: '', progress: 100, error: null, checkedAt: Date.now(), auto: true, installed: true }),
    updateInstall: async () => true,
    updateSetAuto: async (on) => ({ state: 'current', current: '2.0.0', version: null, notes: '', progress: 0, error: null, checkedAt: Date.now(), auto: on, installed: true }),
    onUpdate: () => () => {},
    setupSections: async () => [
      { id: 'look', label: 'Layout and look', hint: 'Panel style, tile size, transparency, dock, widgets, shortcut, panel names and colours' },
      { id: 'organise', label: 'Categories and rules', hint: 'Your own categories, sorting rules and manual category choices' },
      { id: 'favorites', label: 'Favorites and hidden items', hint: 'Pinned items and anything you hid from Deskly' },
      { id: 'scenes', label: 'Scenes', hint: 'Work, Gaming, your own scenes and which panels each shows' },
      { id: 'automation', label: 'Automation', hint: 'Auto-scene rules and which quiet alerts are on' },
      { id: 'workspaces', label: 'Project workspaces', hint: 'What Launch does per project, including the start command', risky: true },
    ],
    setupExport: async () => ({ ok: true, path: 'C:\\Users\\you\\Documents\\Deskly-setup-2026-11-01.json', sections: 5 }),
    setupPick: async () => ({ ok: true, file: 'Deskly-setup-2026-11-01.json', summary: { version: '2.0.0', sections: [
      { id: 'look', label: 'Layout and look', hint: 'Panel style, tile size, dock, widgets', count: 14 },
      { id: 'scenes', label: 'Scenes', hint: 'Work, Gaming, your own scenes', count: 5 },
      { id: 'automation', label: 'Automation', hint: 'Auto-scene rules and alerts', count: 2 },
      { id: 'workspaces', label: 'Project workspaces', hint: 'What Launch does per project, including the start command', count: 3, risky: true },
    ] } }),
    setupImport: async (ids) => ({ ok: true, done: ids, canUndo: true }),
    setupUndo: async () => ({ ok: true }),
    healthProbe: async () => ({ hasBattery: true, hasGpuTemp: true, batteryPct: 56, gpuTemp: 56 }),
    healthReport: async (span = 7) => {
      const GB = 1024 ** 3;
      const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const days = Array.from({ length: span }, (_, i) => {
        const d = new Date(Date.now() - (span - 1 - i) * 86400000);
        const ram = [62, 71, 88, 84, 66, 58, 79][i % 7];
        return { date: d.toISOString().slice(0, 10), weekday: names[(d.getDay() + 6) % 7], hours: i === 0 ? 0 : 6 + (i % 4), cpu: [18, 24, 41, 33, 20, 12, 29][i % 7], ram, ramMax: Math.min(99, ram + 9), gpuMax: 70 + (i % 5) * 4 };
      });
      return {
        span, have: days.filter((d) => d.hours).length, days, hours: 41, cpuAvg: 25.4, cpuMax: 96, ramAvg: 72.1, ramMax: 97, ramHighHours: 9.5, gpuMax: 86, gpuHotHours: 1.5, batteryHours: 6, batteryMin: 31, hasBattery: true,
        disks: [{ drive: 'C:', from: 120 * GB, to: 104 * GB, delta: -16 * GB }, { drive: 'G:', from: 310 * GB, to: 309 * GB, delta: -1 * GB }],
        topApps: [{ name: 'node', avg: 8.4 * GB, days: 6 }, { name: 'chrome', avg: 3.1 * GB, days: 7 }, { name: 'claude', avg: 1.9 * GB, days: 5 }, { name: 'code', avg: 1.2 * GB, days: 4 }],
        tips: ['Memory was above 85% for 9.5 hours. node is usually the biggest user (about 8.4 GB when open).', 'The graphics card reached 86°C and spent about 1.5 hours above 80°C. Check dust and airflow if that is not from gaming.', 'C: lost 16.0 GB of free space this period (104.0 GB left).', 'You ran on battery for about 6 hours, down to 31%.'],
        text: 'PC health, last 7 days (sample data)',
      };
    },
    startupSet: async () => ({ ok: true }),
    cleanScan: async () => {
      for (let i = 1; i <= 6; i++) { await new Promise((r) => setTimeout(r, 250)); onClean?.({ done: i, total: 6, current: ['website', 'api-server', 'catalog-app', 'site', 'resume-site', 'Tool cache'][i - 1] }); }
      return [
        { id: 'a', path: 'x', label: 'npm cache', project: 'Tool cache', safe: true, perm: true, group: 'caches', size: 14.3 * 1024 ** 3, files: 200000 },
        { id: 'b', path: 'x', label: 'node_modules', project: 'catalog-app', safe: true, perm: false, group: 'projects', size: 0.28 * 1024 ** 3, files: 30000 },
        { id: 'c', path: 'x', label: 'node_modules', project: 'website-lean', safe: true, perm: false, group: 'projects', size: 0.23 * 1024 ** 3, files: 24000 },
        { id: 'd', path: 'x', label: 'Build output (dist)', project: 'api-server', safe: false, perm: false, group: 'projects', size: 0.12 * 1024 ** 3, files: 800 },
      ];
    },
    cleanRemove: async (ids) => ({ freed: ids.length * 1.2 * 1024 ** 3, failed: [] }),
    onCleanProgress: (cb) => { onClean = cb; return () => { onClean = null; }; },
    filesDownloadsPlan: async () => {
      const mv = (n, s, g, d) => ({ id: g + n, name: n, size: s, mtime: Date.now() - d * 86400000, from: 'C:\\Users\\you\\Downloads\\' + n, group: g });
      const groups = [
        { id: 'installers', label: 'Installers', kind: 'downloads', selected: true, moves: [mv('NVIDIA_app_11.0.exe', 780e6, 'installers', 12), mv('VSCodeSetup-x64.exe', 98e6, 'installers', 30), mv('node-v22.msi', 30e6, 'installers', 41)] },
        { id: 'documents', label: 'Documents', kind: 'downloads', selected: true, moves: [mv('facture-octobre.pdf', 220e3, 'documents', 4), mv('contrat.pdf', 410e3, 'documents', 9), mv('notes.txt', 3e3, 'documents', 2)] },
        { id: 'images', label: 'Images', kind: 'downloads', selected: true, moves: [mv('IMG_2231.jpg', 3.2e6, 'images', 3), mv('logo-final.png', 640e3, 'images', 15)] },
        { id: 'archives', label: 'Archives', kind: 'downloads', selected: true, moves: [mv('assets.zip', 54e6, 'archives', 7)] },
        { id: 'other', label: 'Other', kind: 'downloads', selected: false, moves: [mv('mystery.xyz', 12e3, 'other', 50)] },
      ].map((g) => ({ ...g, count: g.moves.length, size: g.moves.reduce((a, m) => a + m.size, 0) }));
      return wait({ dir: 'C:\\Users\\you\\Downloads', total: 214, skipped: { recent: 6, partial: 1, secret: 1 }, groups }, 500);
    },
    filesScreenshotsPlan: async () => {
      const mv = (n, g, d) => ({ id: g + n, name: n, size: 280e3, mtime: Date.now() - d * 86400000, from: 'C:\\Users\\you\\Desktop\\' + n, group: g, source: 'Desktop' });
      const groups = [
        { id: '2026-10', label: '2026-10', kind: 'screenshots', selected: true, moves: [mv('Screenshot 2026-10-28 211014.png', '2026-10', 4), mv('Screenshot (41).png', '2026-10', 9), mv('Screenshot 2026-10-02 093011.png', '2026-10', 30)] },
        { id: '2026-09', label: '2026-09', kind: 'screenshots', selected: true, moves: [mv('Capture d’écran 2026-09-14 180302.png', '2026-09', 48), mv('Screenshot (12).png', '2026-09', 52)] },
      ].map((g) => ({ ...g, count: g.moves.length, size: g.moves.reduce((a, m) => a + m.size, 0) }));
      return wait({ dir: 'C:\\Users\\you\\Pictures\\Screenshots', from: { Desktop: 4, Downloads: 1 }, skipped: { recent: 1 }, groups }, 400);
    },
    filesApply: async () => ({ moved: 5, failed: [], batchId: 'b1' }),
    filesHistory: async () => [{ id: 'b0', ts: Date.now() - 3600000, label: 'Sorted Downloads', count: 31 }],
    filesUndo: async () => ({ restored: 31, failed: 0 }),
    filesThumb: async () => null,
    filesReveal: async () => true,
    filesTrash: async (ids) => ({ freed: ids.length * 180e6, count: ids.length, failed: [] }),
    filesCancel: async () => {},
    filesScanDupes: async () => {
      const p = [['Looking through your folders', 20000, 0], ['Comparing files', 800, 1800], ['Confirming duplicates', 2.1e9, 4.4e9]];
      for (const [phase, done, total] of p) { await new Promise((r) => setTimeout(r, 450)); onFiles?.({ phase, done, total, bytes: phase.startsWith('Confirming'), current: 'holiday.mp4' }); }
      const f = (dir, name, keep, d) => ({ id: dir + name, path: dir + '\\' + name, name, dir, mtime: Date.now() - d * 86400000, keep });
      return {
        totalGroups: 3, wasted: 2.6e9, scanned: 41230, truncated: false, cloudSkipped: 12,
        groups: [
          { id: 'g1', name: 'holiday-2025.mp4', size: 1.2e9, copies: 2, wasted: 1.2e9, files: [f('C:\\Users\\you\\Videos', 'holiday-2025.mp4', true, 300), f('C:\\Users\\you\\Downloads', 'holiday-2025 (1).mp4', false, 20)] },
          { id: 'g2', name: 'Windows11.iso', size: 0.9e9, copies: 2, wasted: 0.9e9, files: [f('C:\\Users\\you\\Documents\\iso', 'Windows11.iso', true, 120), f('C:\\Users\\you\\Desktop', 'Windows11.iso', false, 60)] },
          { id: 'g3', name: 'cv-2026.pdf', size: 0.5e9 / 100, copies: 3, wasted: 2 * 5e6, files: [f('C:\\Users\\you\\Documents', 'cv-2026.pdf', true, 90), f('C:\\Users\\you\\Downloads', 'cv-2026.pdf', false, 30), f('C:\\Users\\you\\Desktop', 'cv-2026 - Copy.pdf', false, 10)] },
        ],
      };
    },
    filesScanBig: async () => {
      await new Promise((r) => setTimeout(r, 500));
      const b = (name, dir, size, kind, d) => ({ id: dir + name, path: dir + '\\' + name, name, dir, size, mtime: Date.now() - d * 86400000, kind, old: d > 365 });
      return { scanned: 41230, truncated: false, cloudSkipped: 12, files: [
        b('Ubuntu-24.04.vhdx', 'C:\\Users\\you\\Documents\\VMs', 18.4e9, 'Game / VM / data', 500),
        b('raw-footage-2024.mov', 'C:\\Users\\you\\Videos', 6.1e9, 'Video', 420),
        b('Windows11.iso', 'C:\\Users\\you\\Downloads', 5.4e9, 'Installer / disk image', 80),
        b('backup-old.zip', 'C:\\Users\\you\\Documents', 2.2e9, 'Archive', 700),
        b('game-installer.exe', 'C:\\Users\\you\\Downloads', 0.9e9, 'Installer / disk image', 14),
      ] };
    },
    onFilesProgress: (cb) => { onFiles = cb; return () => { onFiles = null; }; },
    searchData: async () => ({
      entries: [...items.slice(0, 30).map((i) => ({ type: 'item', key: i.key, name: i.name, sub: i.category, kind: 'Desktop', icon: i.icon, use: i.pinned ? 4 : 0, pinned: i.pinned })),
        { type: 'project', key: 'p1', name: 'website', sub: 'main · Node', kind: 'Project', icon: null, use: 3 },
        ...scenes.map((s) => ({ type: 'scene', id: s.id, name: 'Scene: ' + s.name, sub: 'Switch panels', kind: 'Scene', icon: null, color: s.color, use: 0 })),
        { type: 'action', id: 'perf', name: 'Performance', sub: 'CPU, RAM, GPU…', kind: 'Action', icon: null, use: 0 }],
      indexing: false, hotkey: 'Alt+Space',
    }),
    searchRun: async () => {},
    searchHide: async () => {},
    onSearchShow: () => () => {},
    addAutoRule: async (r) => { autoRules = [...autoRules, { ...r, id: 'a_' + Date.now(), enabled: true }]; return state(); },
    deleteAutoRule: async (id) => { autoRules = autoRules.filter((r) => r.id !== id); return state(); },
    toggleAutoRule: async (id) => { autoRules = autoRules.map((r) => (r.id === id ? { ...r, enabled: r.enabled === false } : r)); return state(); },
    runningNames: async () => ['steam.exe', 'chrome.exe', 'obs64.exe', 'code.exe'],
    saveWorkspace: async (key, ws) => ws,
    launchWorkspace: async () => [],
    mgdList: async () => [{ id: 'm1', key: 'project:website', name: 'website', cmd: 'npm run dev', cwd: 'C:\\x', status: 'running', port: 5173, pid: 1, startedAt: Date.now() - 600000, code: null }],
    mgdLog: async () => ['  VITE v7.1.0  ready in 412 ms', '  ➜  Local:   http://localhost:5173/', '  ➜  press h + enter to show help'],
    mgdStop: async () => true,
    mgdRemove: async () => {},
    mgdStart: async () => ({ ok: true, id: 'm1' }),
    onMgd: () => () => {},
    onMgdLog: () => () => {},
    procScan: () => wait({
      total: 221, ram: 12.45 * 1024 ** 3,
      groups: [
        { key: 'a', by: 'Nothing (orphaned)', tool: 'MCP server', projects: ['playwright'], count: 196, ram: 10.65 * 1024 ** 3, orphans: 196, oldest: Date.now() - 86400000 * 3, stale: true, safe: true, pids: [1] },
        { key: 'b', by: 'wscript', tool: 'MCP server', projects: [], count: 14, ram: 1.27 * 1024 ** 3, orphans: 0, oldest: Date.now() - 3600000, stale: false, safe: false, pids: [2] },
        { key: 'c', by: 'claude', tool: 'MCP server', projects: [], count: 8, ram: 0.39 * 1024 ** 3, orphans: 0, oldest: Date.now() - 7200000, stale: false, safe: false, pids: [3] },
      ],
    }, 700),
    procEnd: async (keys) => ({ ok: true, ended: 196, freed: 10.65 * 1024 ** 3 }),
    runAsAdmin: async () => null,
    closeApp: async () => ({ ok: true }),
    peekFolder: async () => true,
    peekHide: async () => {},
    startDrag: () => {},
    onPeekShow: () => () => {},
    togglePeekAll: async () => false,
    toggleSearch: async () => {},
    dockData: async () => ({ apps: items.filter((i) => i.pinned).slice(0, 5).map((i) => ({ key: i.key, name: i.name, icon: i.icon, path: i.path })), scene: null, hidden: false, running: [] }),
    onSys2: null,
    setDesktopMode: async (on) => (prefs = { ...prefs, desktopMode: on }),
    setAutostart: async (on) => (prefs = { ...prefs, autostart: on }),
    resetPanels: async () => {},
    panelDrag: () => {},
    openMain: () => {},
    onNavigate: () => () => {},
    onChanged: () => () => {},
  };
}

export const api = isElectron ? window.deskly : createMock();
