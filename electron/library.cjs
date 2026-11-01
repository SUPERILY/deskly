// The library: everything installed on this PC, not just what sits on the desktop.
// Sources: Start menu (classic + Store apps), Steam and Epic games, git projects, Chrome profiles,
// and your recent files.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { shell } = require('electron');
const { categorize, userCategory } = require('./categories.cjs');
const scanner = require('./scanner.cjs');

const run = (file, args, timeout = 30000) =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout, encoding: 'utf8' }, (err, out) => resolve(err ? null : out));
  });

const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

// ---- Start menu: classic programs and Store apps in one list ----
const JUNK_APP = /^(uninstall|readme|read me|release notes|license|licence|help\b|documentation|manual|visit |website|web site|support|about |changelog|what'?s new)|\buninstall(er)?\b$|\bhelp$/i;

async function startApps() {
  const out = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'],
    45000
  );
  if (!out) return [];
  let list;
  try {
    list = JSON.parse(out);
  } catch {
    return [];
  }
  const seen = new Set();
  const items = [];
  for (const a of Array.isArray(list) ? list : [list]) {
    const name = String(a.Name || '').trim();
    const id = String(a.AppID || '').trim();
    if (!name || !id || JUNK_APP.test(name)) continue;
    const dupe = name.toLowerCase();
    if (seen.has(dupe)) continue;
    seen.add(dupe);
    const target = 'shell:AppsFolder\\' + id;
    items.push({
      key: 'app:' + id.toLowerCase(),
      name,
      kind: 'app',
      source: id.includes('!') ? 'Store app' : 'Program',
      launch: { type: 'shell', value: target },
      path: target,
      _iconSrc: target,
      _iconFlags: 4,
    });
  }
  return items;
}

// ---- Games ----
function steamRoot() {
  const guesses = [process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'), 'C:\\Program Files (x86)\\Steam'];
  return guesses.find((g) => g && exists(path.join(g, 'steamapps')));
}

function biggestExe(dir, depth = 2) {
  let best = null;
  const walk = (d, lvl) => {
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && lvl < depth) walk(full, lvl + 1);
      else if (/\.exe$/i.test(e.name) && !/(unins|crash|redist|vc_|dxsetup|setup|helper|cef|launcher_)/i.test(e.name)) {
        try {
          const size = fs.statSync(full).size;
          if (!best || size > best.size) best = { full, size };
        } catch {}
      }
    }
  };
  walk(dir, 0);
  return best && best.full;
}

function steamGames() {
  const root = steamRoot();
  if (!root) return [];
  const libs = new Set([path.join(root, 'steamapps')]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps'));
  } catch {}
  const games = [];
  for (const lib of libs) {
    let files = [];
    try {
      files = fs.readdirSync(lib).filter((f) => /^appmanifest_\d+\.acf$/i.test(f));
    } catch {}
    for (const f of files) {
      try {
        const txt = fs.readFileSync(path.join(lib, f), 'utf8');
        const appid = /"appid"\s+"(\d+)"/.exec(txt)?.[1];
        const name = /"name"\s+"([^"]+)"/.exec(txt)?.[1];
        const dir = /"installdir"\s+"([^"]+)"/.exec(txt)?.[1];
        if (!appid || !name || /(redistributable|steamworks|proton|runtime|dedicated server)/i.test(name)) continue;
        const cached = ['_icon.jpg', '_library_600x900.jpg'].map((s) => path.join(root, 'appcache', 'librarycache', appid + s)).find(exists);
        const exe = dir && biggestExe(path.join(lib, 'common', dir));
        const iconSrc = cached || exe || path.join(root, 'steam.exe');
        games.push({
          key: 'game:steam:' + appid,
          name,
          kind: 'game',
          source: 'Steam',
          launch: { type: 'url', value: `steam://rungameid/${appid}` },
          path: `steam://rungameid/${appid}`,
          _iconSrc: iconSrc,
          _iconFlags: cached ? 0 : 4,
        });
      } catch {}
    }
  }
  return games;
}

function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.item'));
  } catch {
    return [];
  }
  const games = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!j.DisplayName || !j.AppName || !j.CatalogNamespace || !j.CatalogItemId) continue;
      if (j.bIsIncompleteInstall) continue;
      if (/(unreal engine|launcher|redistributable)/i.test(j.DisplayName) && !j.LaunchExecutable) continue;
      const exe = j.InstallLocation && j.LaunchExecutable ? path.join(j.InstallLocation, j.LaunchExecutable) : '';
      const url = `com.epicgames.launcher://apps/${j.CatalogNamespace}%3A${j.CatalogItemId}%3A${j.AppName}?action=launch&silent=true`;
      games.push({
        key: 'game:epic:' + String(j.AppName).toLowerCase(),
        name: j.DisplayName,
        kind: 'game',
        source: 'Epic Games',
        launch: { type: 'url', value: url },
        path: url,
        _iconSrc: exists(exe) ? exe : 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
        _iconFlags: 4,
      });
    } catch {}
  }
  return games;
}

// ---- Chrome profiles ----
function chromeProfiles() {
  const exe = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].find(exists);
  if (!exe) return [];
  let cache = {};
  try {
    const st = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Local State'), 'utf8'));
    cache = (st.profile && st.profile.info_cache) || {};
  } catch {
    return [];
  }
  return Object.entries(cache).map(([dir, info]) => ({
    key: 'chrome:' + dir.toLowerCase(),
    name: `Chrome · ${info.name || dir}`,
    kind: 'chrome',
    source: info.user_name || 'Chrome profile',
    launch: { type: 'exec', file: exe, args: [`--profile-directory=${dir}`] },
    path: exe,
    _iconSrc: exe,
    _iconFlags: 4,
  }));
}

// ---- Dev projects ----
function projectRoots(store) {
  const home = os.homedir();
  const guesses = [
    ...(store.projectRoots || []),
    path.join(home, 'My projects'),
    path.join(home, 'Documents', 'GitHub'),
    path.join(home, 'source', 'repos'),
    path.join(home, 'Projects'),
    path.join(home, 'dev'),
    path.join(home, 'code'),
  ];
  return [...new Set(guesses.filter((g) => g && exists(g)))];
}

const MARKERS = ['.git', 'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'composer.json'];

const git = (cwd, args, timeout = 4000) => run('git', ['-C', cwd, ...args], timeout);

async function describeProject(dir) {
  const name = path.basename(dir);
  const has = (m) => exists(path.join(dir, m));
  const type = has('Cargo.toml') ? 'Rust' : has('go.mod') ? 'Go' : has('pyproject.toml') || has('requirements.txt') ? 'Python'
    : has('composer.json') ? 'PHP' : has('package.json') ? 'Node' : has('pom.xml') || has('build.gradle') ? 'Java' : 'Project';
  let last = 0;
  try {
    last = fs.statSync(dir).mtimeMs;
  } catch {}
  let branch = '';
  let dirty = 0;
  let remote = '';
  let ahead = 0; // commits not pushed yet
  let behind = 0; // commits on the remote you have not pulled (as of the last fetch)
  let noUpstream = false;
  if (has('.git')) {
    const [ct, br, st, rm, ab] = await Promise.all([
      git(dir, ['log', '-1', '--format=%ct']),
      git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(dir, ['status', '--porcelain'], 6000),
      git(dir, ['config', '--get', 'remote.origin.url']),
      git(dir, ['rev-list', '--left-right', '--count', '@{u}...HEAD']),
    ]);
    if (ct && Number(ct) > 0) last = Number(ct) * 1000;
    branch = (br || '').trim();
    dirty = st ? st.split(/\r?\n/).filter(Boolean).length : 0;
    remote = (rm || '').trim();
    const m = /^(\d+)\s+(\d+)/.exec((ab || '').trim());
    if (m) {
      behind = Number(m[1]);
      ahead = Number(m[2]);
    } else {
      noUpstream = !!remote || !!branch; // a branch that was never pushed
    }
  }
  return {
    key: 'project:' + dir.toLowerCase(),
    name,
    kind: 'project',
    source: type,
    type,
    path: dir,
    branch,
    dirty,
    ahead,
    behind,
    noUpstream,
    remote,
    last,
    git: has('.git'),
  };
}

async function projects(store) {
  const dirs = [];
  for (const root of projectRoots(store)) {
    let ents = [];
    try {
      ents = fs.readdirSync(root, { withFileTypes: true });
    } catch {}
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'node_modules') continue;
      const full = path.join(root, e.name);
      if (MARKERS.some((m) => exists(path.join(full, m)))) dirs.push(full);
    }
  }
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (i < dirs.length) out.push(await describeProject(dirs[i++]));
    })
  );
  return out.sort((a, b) => b.last - a.last);
}

// ---- Recent files ----
async function recent() {
  const dir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.lnk'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 60);
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const { f, t } of files) {
    let target = '';
    try {
      target = shell.readShortcutLink(path.join(dir, f)).target || '';
    } catch {}
    if (!target || seen.has(target.toLowerCase()) || !exists(target)) continue;
    let isDir = false;
    try {
      isDir = fs.statSync(target).isDirectory();
    } catch {}
    seen.add(target.toLowerCase());
    out.push({
      key: 'recent:' + target.toLowerCase(),
      name: path.basename(target),
      kind: 'recent',
      source: path.dirname(target),
      launch: { type: 'path', value: target },
      path: target,
      isDir,
      t,
      _iconSrc: target,
      _iconFlags: isDir ? 4 : 0,
    });
    if (out.length >= 14) break;
  }
  return out;
}

// ---- assemble ----
function assignCategories(items, store, validCats) {
  for (const it of items) {
    const facts = { file: it.name, base: it.name, kind: 'shortcut', ext: '', target: '', url: '', path: it.path };
    const ruleCat = userCategory(store.rules, facts, validCats);
    const auto = it.kind === 'game' ? 'games' : it.kind === 'chrome' ? 'web' : ruleCat || categorize(facts);
    it.auto = auto;
    it.category = store.overrides[it.key] || ruleCat || auto;
  }
}

function normName(n) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function scanLibrary(store, validCats) {
  const [apps, projs] = await Promise.all([startApps(), projects(store)]);
  const games = [...steamGames(), ...epicGames()];
  const chrome = chromeProfiles();

  // a game found in a launcher replaces a same-named Start menu entry
  const gameNames = new Set(games.map((g) => normName(g.name)));
  const appList = apps.filter((a) => !gameNames.has(normName(a.name)));

  const launchables = [...appList, ...games, ...chrome];
  assignCategories(launchables, store, validCats);
  await scanner.withIcons(launchables);
  return { apps: appList, games, chrome, projects: projs, t: Date.now() };
}

async function scanRecent() {
  const items = await recent();
  await scanner.withIcons(items);
  return items;
}

// Run a library item (anything with a launch descriptor).
function launch(l) {
  const { spawn } = require('child_process');
  if (!l) return 'Nothing to launch';
  if (l.type === 'shell') spawn('explorer.exe', [l.value], { detached: true, stdio: 'ignore' }).unref();
  else if (l.type === 'url') shell.openExternal(l.value);
  else if (l.type === 'exec') spawn(l.file, l.args || [], { detached: true, stdio: 'ignore' }).unref();
  else if (l.type === 'path') shell.openPath(l.value);
  return null;
}

// Projects: open in an editor/terminal/folder/GitHub.
function projectAction(p, action) {
  const { spawn } = require('child_process');
  if (!p || !exists(p.path)) return 'Project folder not found';
  if (action === 'code') spawn('code', [p.path], { detached: true, stdio: 'ignore', shell: true, windowsHide: true }).unref();
  else if (action === 'terminal') spawn('wt', ['-d', p.path], { detached: true, stdio: 'ignore', shell: true, windowsHide: true }).unref();
  else if (action === 'folder') shell.openPath(p.path);
  else if (action === 'remote' && p.remote) {
    const url = p.remote.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  }
  return null;
}

module.exports = { scanLibrary, scanRecent, launch, projectAction, projectRoots, assignCategories };
