// Reads every desktop location, describes each item and pulls a crisp icon.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app, shell } = require('electron');
const { categorize, isSensitive, matchRule, userCategory } = require('./categories.cjs');

const SKIP = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
const iconMem = new Map();

function primaryDesktop() {
  return app.getPath('desktop');
}

// Windows shows Desktop + OneDrive Desktop + Public Desktop merged together.
function desktopRoots() {
  const found = new Map();
  const add = (p, owner) => {
    if (p && fs.existsSync(p)) found.set(p.toLowerCase(), { path: p, owner });
  };
  add(primaryDesktop(), 'user');
  add(path.join(os.homedir(), 'Desktop'), 'user');
  for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    if (process.env[v]) add(path.join(process.env[v], 'Desktop'), 'user');
  }
  add(path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'), 'public');
  return [...found.values()];
}

function readdir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !SKIP.has(e.name.toLowerCase()));
  } catch {
    return [];
  }
}

function parseUrlFile(p) {
  try {
    const text = fs.readFileSync(p, 'utf8');
    const url = text.match(/^URL=(.+)$/im);
    const icon = text.match(/^IconFile=(.+)$/im);
    return { url: url ? url[1].trim() : '', iconFile: icon ? icon[1].trim() : '' };
  } catch {
    return { url: '', iconFile: '' };
  }
}

const ICON_HOSTS = /\.(ico|exe|dll|png|jpe?g|bmp)$/i;
const usable = (p) => !!p && ICON_HOSTS.test(p) && fs.existsSync(p);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function describe(entry, store, elevated, validCats) {
  const { full, ent, owner, forced } = entry;
  const file = ent.name;
  const ext = path.extname(file).toLowerCase();
  const key = file.toLowerCase();
  let kind = ent.isDirectory() ? 'dir' : 'file';
  let target = '';
  let url = '';
  let targetIsDir = false;
  let iconSrc = full;
  let iconFlags = ent.isDirectory() ? 4 : 0;

  if (ext === '.lnk') {
    kind = 'shortcut';
    let link = {};
    try {
      link = shell.readShortcutLink(full);
    } catch {}
    target = link.target || '';
    targetIsDir = !!target && isDir(target);
    // The real program icon beats the generic "page with an arrow" of the .lnk itself.
    const pick = [link.icon, target].find(usable);
    if (pick) {
      iconSrc = pick;
      iconFlags = 4;
    }
  } else if (ext === '.url') {
    kind = 'url';
    const parsed = parseUrlFile(full);
    url = parsed.url;
    if (usable(parsed.iconFile)) {
      iconSrc = parsed.iconFile;
      iconFlags = 4;
    }
  }

  const base = kind === 'shortcut' || kind === 'url' ? path.basename(file, ext) : file;
  const sensitive = isSensitive(file);
  const facts = { file, base, kind, ext, target, targetIsDir, url, path: full };
  // Precedence: a manual move, then your rules, then the folder it sits in, then the built-in rules.
  const ruleCat = userCategory(store.rules, facts, validCats);
  const auto = ruleCat || categorize(facts);
  const category = store.overrides[key] || ruleCat || forced || auto;

  return {
    key,
    name: base,
    file,
    path: full,
    kind,
    ext,
    owner,
    target,
    url,
    exe: /\.exe$/i.test(target) ? path.basename(target).toLowerCase() : '',
    isFolder: kind === 'dir' || targetIsDir,
    sensitive,
    auto,
    category,
    pinned: store.pins.includes(key),
    movable: (owner === 'user' || elevated) && kind !== 'dir' && !sensitive,
    loose: !forced,
    icon: null,
    _iconSrc: iconSrc,
    _iconFlags: iconFlags,
  };
}

const ICON_DIR = () => path.join(app.getPath('userData'), 'icon-cache');
const iconDir = ICON_DIR;
const ICON_PX = 256;

function cachePathFor(item) {
  let stamp = 0;
  try {
    stamp = fs.statSync(item.path).mtimeMs;
  } catch {}
  const hash = crypto
    .createHash('sha1')
    .update(`${item.key}|${stamp}|${item._iconSrc}|v2`)
    .digest('hex')
    .slice(0, 20);
  return path.join(ICON_DIR(), hash + '.png');
}

// One PowerShell process extracts every missing icon at 256px via the Windows shell.
function runIconHelper(jobs) {
  return new Promise((resolve) => {
    if (!jobs.length) return resolve();
    const script = path.join(__dirname, 'icons.ps1').replace('app.asar', 'app.asar.unpacked');
    const jobsFile = path.join(ICON_DIR(), `jobs-${process.pid}.json`);
    try {
      fs.mkdirSync(ICON_DIR(), { recursive: true });
      fs.writeFileSync(jobsFile, JSON.stringify(jobs));
    } catch {
      return resolve();
    }
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, jobsFile],
      { windowsHide: true, stdio: 'ignore' }
    );
    const done = () => {
      try {
        fs.unlinkSync(jobsFile);
      } catch {}
      resolve();
    };
    ps.on('error', done);
    ps.on('exit', done);
  });
}

async function fallbackIcon(item, cached) {
  // Windows caps this at 48px, but it works for anything.
  for (const src of [item._iconSrc, item.path]) {
    try {
      const img = await app.getFileIcon(src, { size: 'large' });
      if (img && !img.isEmpty()) {
        fs.writeFileSync(cached, img.toPNG());
        return;
      }
    } catch {}
  }
}

async function withIcons(items) {
  const todo = [];
  for (const it of items) {
    it._cache = cachePathFor(it);
    if (!iconMem.has(it._cache) && !fs.existsSync(it._cache)) {
      todo.push(it);
    }
  }
  await runIconHelper(
    todo.map((it) => ({ src: it._iconSrc, dst: it._cache, px: ICON_PX, flags: it._iconFlags }))
  );
  for (const it of todo) {
    if (!fs.existsSync(it._cache)) await fallbackIcon(it, it._cache);
  }
  for (const it of items) {
    if (!iconMem.has(it._cache)) {
      // Served through the deskly-icon:// protocol (see main.cjs): no multi-megabyte base64 in every message.
      iconMem.set(it._cache, fs.existsSync(it._cache) ? 'deskly-icon://i/' + path.basename(it._cache) : null);
    }
    it.icon = iconMem.get(it._cache);
    delete it._cache;
    delete it._iconSrc;
    delete it._iconFlags;
  }
  return items;
}

const SPECIALS = [
  { name: 'This PC', clsid: '{20D04FE0-3AEA-1069-A2D8-08002B30309D}' },
  { name: 'Recycle Bin', clsid: '{645FF040-5081-101B-9F08-00AA002F954E}' },
];

function special({ name, clsid }, store) {
  const key = name.toLowerCase();
  return {
    key,
    name,
    file: name,
    path: `shell:::${clsid}`,
    kind: 'special',
    ext: '',
    owner: 'system',
    target: '',
    url: '',
    exe: '',
    isNew: false,
    sensitive: false,
    auto: 'system',
    category: store.overrides[key] || 'system',
    pinned: store.pins.includes(key),
    movable: false,
    loose: false,
    icon: null,
    _iconSrc: `::${clsid}`,
    _iconFlags: 4,
  };
}

async function scan(store, elevated = false, validCats) {
  const managed = new Map(store.managedDirs.map((d) => [d.path.toLowerCase(), d.cat]));
  const raw = [];

  for (const root of desktopRoots()) {
    for (const ent of readdir(root.path)) {
      const full = path.join(root.path, ent.name);
      const managedCat = ent.isDirectory() ? managed.get(full.toLowerCase()) : null;
      if (managedCat) {
        // A folder Deskly created: show its contents, not the folder itself.
        for (const child of readdir(full)) {
          raw.push({ full: path.join(full, child.name), ent: child, owner: root.owner, forced: managedCat });
        }
        continue;
      }
      raw.push({ full, ent, owner: root.owner });
    }
  }

  // De-duplicate by key (same file name on two desktops): user copy wins.
  const seen = new Map();
  for (const r of raw) {
    const k = r.ent.name.toLowerCase();
    if (!seen.has(k) || r.owner === 'user') seen.set(k, r);
  }

  const valid = validCats || new Set();
  const described = [...seen.values()].map((r) => ({ it: describe(r, store, elevated, valid), r }));
  const all = described.map((d) => d.it);

  // How many items each user rule matches (shown on the Rules page).
  const ruleCounts = {};
  for (const rule of store.rules || []) {
    ruleCounts[rule.id] = described.filter(({ it, r }) =>
      matchRule(rule, { base: it.name, ext: it.ext, target: it.target, url: it.url, path: r.full })
    ).length;
  }

  // "New" badge: remember when each item was first seen. The very first run marks everything as old.
  let dirty = false;
  const now = Date.now();
  if (!store.seen) {
    store.seen = {};
    for (const it of all) store.seen[it.key] = 0;
    dirty = true;
  }
  for (const it of all) {
    if (store.seen[it.key] === undefined) {
      store.seen[it.key] = now;
      dirty = true;
    }
    const t = store.seen[it.key];
    it.isNew = t > 0 && now - t < 24 * 3600 * 1000;
    it.firstSeen = t;
  }

  // Windows' own desktop icons: they vanish from the desktop when panels hide it, so keep them reachable.
  for (const sp of SPECIALS) all.push(special(sp, store));
  const hidden = new Set(store.hidden);
  const visible = all.filter((it) => !hidden.has(it.key));
  await withIcons(visible);
  return { items: visible, hiddenCount: all.length - visible.length, dirty, ruleCounts };
}

module.exports = { scan, desktopRoots, primaryDesktop, withIcons, iconDir };
