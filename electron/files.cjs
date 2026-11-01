// File helpers: sort Downloads, file screenshots by month, find duplicates and big or old files.
//
// Safety rules, in one place:
//  - moves never overwrite (a name clash gets " (1)"), skip secrets, half-downloaded and very recent files;
//    every batch is recorded and can be undone
//  - nothing is ever deleted outright: removals go to the Recycle Bin, only for paths from the last scan,
//    only if the file is unchanged since the scan, and never the last copy of a duplicate group
//  - files that only exist in the cloud (OneDrive placeholders) are never read or listed, so nothing is downloaded
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { app, shell, nativeImage } = require('electron');
const { execFile } = require('child_process');
const { isSensitive } = require('./categories.cjs');
const ws = require('./winshell.cjs');

const MB = 1024 * 1024;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const idOf = (s) => crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 16);

/* ---------------------------------- classification ---------------------------------- */
const DL_GROUPS = [
  { id: 'installers', label: 'Installers', ext: 'exe msi msix appx appxbundle msixbundle iso dmg apk' },
  { id: 'documents', label: 'Documents', ext: 'pdf doc docx xls xlsx ppt pptx txt md rtf odt ods odp csv epub' },
  { id: 'images', label: 'Images', ext: 'jpg jpeg png gif webp bmp svg heic heif ico avif tif tiff raw' },
  { id: 'video', label: 'Videos', ext: 'mp4 mkv mov avi webm wmv m4v flv' },
  { id: 'audio', label: 'Audio', ext: 'mp3 wav flac m4a ogg aac wma opus' },
  { id: 'archives', label: 'Archives', ext: 'zip rar 7z tar gz tgz bz2 xz' },
  { id: 'design', label: 'Design files', ext: 'psd ai fig sketch xd indd blend fbx obj stl' },
  { id: 'code', label: 'Code and data', ext: 'json xml yml yaml js ts jsx tsx py sql sh ps1 bat html css log db sqlite' },
];
const EXT_GROUP = new Map();
for (const g of DL_GROUPS) for (const e of g.ext.split(' ')) EXT_GROUP.set(e, g);

const PARTIAL = /\.(crdownload|part|partial|tmp|download|opdownload|aria2|!ut)$/i;
const IGNORED = new Set(['desktop.ini', 'thumbs.db', '.ds_store', '.localized']);
// "Screenshot 2026-10-01 120000.png", "Screenshot (12).png", "Capture d’écran 2026-…png", "Capture.PNG", "Snip_1.png"
const SHOT = /^(screenshot|screen ?shot|screen ?capture|capture( d.{1,2}cran)?|snip|cleanshot|lightshot|greenshot|scrnshot)[\s_\-]*(\(?\d.*)?\.(png|jpe?g|webp|bmp|gif)$/i;

let dirOverride = null; // tests point this at a throwaway folder
const dirs = () =>
  dirOverride || {
    downloads: app.getPath('downloads'),
    desktop: app.getPath('desktop'),
    pictures: app.getPath('pictures'),
    documents: app.getPath('documents'),
    videos: app.getPath('videos'),
    music: app.getPath('music'),
  };

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 1; i < 500; i++) {
    const c = path.join(dir, `${name} (${i})${ext}`);
    if (!fs.existsSync(c)) return c;
  }
  return null;
}

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(from);
  }
}

/* ---------------------------------- move plans ---------------------------------- */
let lastPlan = new Map(); // move id -> move

async function topFiles(dir) {
  let ents;
  try {
    ents = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of ents) {
    if (!e.isFile() || IGNORED.has(e.name.toLowerCase())) continue;
    const p = path.join(dir, e.name);
    try {
      const st = await fsp.stat(p);
      out.push({ name: e.name, path: p, size: st.size, mtime: st.mtimeMs, ext: path.extname(e.name).slice(1).toLowerCase() });
    } catch {}
  }
  return out;
}

function registerPlan(groups) {
  lastPlan = new Map();
  for (const g of groups) for (const m of g.moves) lastPlan.set(m.id, { ...m, kind: g.kind });
}

// Loose files in Downloads -> Downloads\<Group>. Files in the "Other" group are listed but not preselected.
async function downloadsPlan({ minAgeHours = 24 } = {}) {
  const dir = dirs().downloads;
  const files = await topFiles(dir);
  const cutoff = Date.now() - minAgeHours * HOUR;
  const skipped = { recent: 0, partial: 0, secret: 0 };
  const byGroup = new Map();
  let total = 0;
  for (const f of files) {
    total++;
    if (PARTIAL.test(f.name)) { skipped.partial++; continue; }
    if (isSensitive(f.name)) { skipped.secret++; continue; }
    if (f.mtime > cutoff) { skipped.recent++; continue; }
    const g = EXT_GROUP.get(f.ext) || { id: 'other', label: 'Other' };
    const to = path.join(dir, g.label, f.name);
    const m = { id: idOf(f.path), name: f.name, size: f.size, mtime: f.mtime, from: f.path, to, group: g.id };
    if (!byGroup.has(g.id)) byGroup.set(g.id, { id: g.id, label: g.label, kind: 'downloads', moves: [] });
    byGroup.get(g.id).moves.push(m);
  }
  const groups = [...byGroup.values()]
    .map((g) => ({ ...g, size: g.moves.reduce((a, m) => a + m.size, 0), count: g.moves.length, selected: g.id !== 'other' }))
    .sort((a, b) => (a.id === 'other') - (b.id === 'other') || b.size - a.size);
  for (const g of groups) g.moves.sort((a, b) => b.size - a.size);
  registerPlan(groups);
  return {
    dir,
    total,
    skipped,
    groups: groups.map((g) => ({ ...g, moves: g.moves.slice(0, 200) })),
  };
}

const isShot = (n) => SHOT.test(n);
const monthOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Screenshots lying around (Desktop, Downloads, Pictures, and loose in Pictures\Screenshots) -> Pictures\Screenshots\YYYY-MM
async function screenshotsPlan({ minAgeHours = 1 } = {}) {
  const d = dirs();
  const home = path.join(d.pictures, 'Screenshots');
  const sources = [
    ['Desktop', d.desktop],
    ['Downloads', d.downloads],
    ['Pictures', d.pictures],
    ['Pictures\\Screenshots', home],
  ];
  const cutoff = Date.now() - minAgeHours * HOUR;
  const byMonth = new Map();
  const from = {};
  let recent = 0;
  for (const [label, dir] of sources) {
    for (const f of await topFiles(dir)) {
      if (!isShot(f.name)) continue;
      if (f.mtime > cutoff) { recent++; continue; }
      from[label] = (from[label] || 0) + 1;
      const month = monthOf(f.mtime);
      const m = { id: idOf(f.path), name: f.name, size: f.size, mtime: f.mtime, from: f.path, to: path.join(home, month, f.name), group: month, source: label };
      if (!byMonth.has(month)) byMonth.set(month, { id: month, label: month, kind: 'screenshots', moves: [] });
      byMonth.get(month).moves.push(m);
    }
  }
  const groups = [...byMonth.values()]
    .map((g) => ({ ...g, size: g.moves.reduce((a, m) => a + m.size, 0), count: g.moves.length, selected: true }))
    .sort((a, b) => b.id.localeCompare(a.id));
  for (const g of groups) g.moves.sort((a, b) => b.mtime - a.mtime);
  registerPlan(groups);
  return { dir: home, from, skipped: { recent }, groups: groups.map((g) => ({ ...g, moves: g.moves.slice(0, 300) })) };
}

// Apply whole groups from the last plan (the preview only lists the first files of a group), minus the files unticked.
function applyGroups(kind, groupIds, excludeIds, store, label) {
  const g = new Set(groupIds || []);
  const x = new Set(excludeIds || []);
  const ids = [...lastPlan.values()].filter((m) => m.kind === kind && g.has(m.group) && !x.has(m.id)).map((m) => m.id);
  return applyMoves(ids, store, label);
}

function applyMoves(ids, store, label) {
  const done = [];
  const createdDirs = [];
  const failed = [];
  for (const id of ids || []) {
    const m = lastPlan.get(id);
    if (!m) continue;
    try {
      if (!fs.existsSync(m.from)) continue;
      const st = fs.statSync(m.from);
      if (st.size !== m.size) throw new Error('changed since the preview');
      const dir = path.dirname(m.to);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        createdDirs.push(dir);
      }
      const to = uniquePath(m.to);
      if (!to) throw new Error('name clash');
      moveFile(m.from, to);
      done.push({ from: m.from, to });
      lastPlan.delete(id);
    } catch (e) {
      failed.push({ name: m.name, error: e.code === 'EBUSY' || e.code === 'EPERM' ? 'in use' : e.message });
    }
  }
  let batch = null;
  if (done.length) {
    batch = { id: crypto.randomUUID(), ts: Date.now(), label, moves: done, dirs: createdDirs };
    store.fileHistory ||= [];
    store.fileHistory.push(batch);
    if (store.fileHistory.length > 20) store.fileHistory.splice(0, store.fileHistory.length - 20);
  }
  return { moved: done.length, failed, batchId: batch && batch.id };
}

function history(store) {
  return (store.fileHistory || []).map((b) => ({ id: b.id, ts: b.ts, label: b.label, count: b.moves.length })).reverse();
}

function undoMoves(store, batchId) {
  const list = store.fileHistory || [];
  const i = batchId ? list.findIndex((b) => b.id === batchId) : list.length - 1;
  if (i < 0) return { restored: 0, failed: 0 };
  const batch = list[i];
  let restored = 0;
  const left = [];
  for (const m of [...batch.moves].reverse()) {
    try {
      if (!fs.existsSync(m.to)) continue; // already gone: nothing to put back
      const back = fs.existsSync(m.from) ? uniquePath(m.from) : m.from;
      fs.mkdirSync(path.dirname(back), { recursive: true });
      moveFile(m.to, back);
      restored++;
    } catch (e) {
      left.push(m);
    }
  }
  for (const dir of batch.dirs || []) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {}
  }
  if (left.length) list[i] = { ...batch, moves: left.reverse() };
  else list.splice(i, 1);
  return { restored, failed: left.length };
}

/* ---------------------------------- walking the disk ---------------------------------- */
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.venv', 'venv', '__pycache__', '$recycle.bin', 'appdata', '.next', '.cache', '.gradle', '.m2', 'obj']);
const SKIP_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
// Duplicates are only looked for in things you made or downloaded to keep. Anything else (dll, exe inside an
// app folder, config, caches...) can be a byte-identical copy that a program still needs.
const CONTENT_EXT = new Set(
  ('jpg jpeg png gif webp bmp heic heif tif tiff raw cr2 nef arw dng svg psd ai ' +
    'mp4 mkv mov avi webm wmv m4v flv mp3 wav flac m4a ogg aac wma opus ' +
    'pdf doc docx xls xlsx ppt pptx txt md rtf odt ods odp csv epub ' +
    'zip rar 7z tar gz tgz iso dmg msi msix appx apk').split(' ')
);
const PROGRAM_EXT = new Set(['exe', 'dll', 'sys', 'node', 'pyd', 'ocx', 'drv', 'so', 'dylib']);
// an installer lying loose in a top-level folder is a normal duplicate; the same file deep inside an app folder is not
const looseInRoot = (f, roots) => roots.some((r) => path.dirname(f.path).toLowerCase() === r.toLowerCase());

let cancelled = false;
let walkCache = null; // { at, files, truncated }

const cancel = () => { cancelled = true; };

async function walk(onProgress) {
  if (walkCache && Date.now() - walkCache.at < 5 * 60 * 1000) return walkCache;
  const d = dirs();
  const roots = [...new Set([d.desktop, d.downloads, d.documents, d.pictures, d.videos, d.music].filter((p) => fs.existsSync(p)).map((p) => path.resolve(p)))];
  const files = [];
  const t0 = Date.now();
  let seen = 0;
  let truncated = false;
  const stack = [...roots];
  while (stack.length) {
    if (cancelled) break;
    if (seen > 600000 || Date.now() - t0 > 150000) { truncated = true; break; }
    const dir = stack.pop();
    let ents;
    try {
      ents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    await Promise.all(
      ents.map(async (e) => {
        const full = path.join(dir, e.name);
        if (e.isSymbolicLink()) return;
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name.toLowerCase())) stack.push(full);
          return;
        }
        if (!e.isFile()) return;
        const lower = e.name.toLowerCase();
        if (SKIP_FILES.has(lower)) return;
        seen++;
        try {
          const st = await fsp.stat(full);
          files.push({ path: full, size: st.size, mtime: st.mtimeMs, ext: path.extname(lower).slice(1) });
        } catch {}
      })
    );
    if (onProgress && seen % 500 < 40) onProgress({ phase: 'Looking through your folders', done: seen, total: 0, current: dir });
  }
  if (cancelled) return { at: 0, files: [], truncated: false, cancelled: true };
  walkCache = { at: Date.now(), files, truncated, roots };
  return walkCache;
}

// Paths among `list` that are cloud-only placeholders, reparse points, or offline: never read or listed.
function cloudOnly(list) {
  if (!list.length) return Promise.resolve(new Set());
  if (ws.available()) {
    const cloudSet = new Set();
    for (const p of list) {
      if (ws.isCloudPlaceholder(p)) cloudSet.add(p.toLowerCase());
    }
    return Promise.resolve(cloudSet);
  }

  const tmp = path.join(app.getPath('temp'), `deskly-attrs-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(list));
  const script =
    "$l = Get-Content -LiteralPath $env:DESKLY_LIST -Raw -Encoding UTF8 | ConvertFrom-Json; " +
    "$o = foreach ($p in $l) { try { $a = [int][IO.File]::GetAttributes($p); if ($a -band (0x1000 -bor 0x40000 -bor 0x400000 -bor 0x400)) { $p } } catch {} }; " +
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; @($o) | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 120000, maxBuffer: 64 * MB, encoding: 'utf8', env: { ...process.env, DESKLY_LIST: tmp } }, (err, out) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (err) return resolve(null); // unknown: caller must not read anything
      try {
        const j = JSON.parse(out.trim() || '[]');
        resolve(new Set((Array.isArray(j) ? j : [j]).filter(Boolean).map((p) => p.toLowerCase())));
      } catch {
        resolve(null);
      }
    });
  });
}

/* ---------------------------------- big and old files ---------------------------------- */
let lastBig = new Map();
let lastDupes = new Map(); // file id -> { path, size, mtime, group }
let dupGroups = new Map(); // group id -> [file ids]

const KIND = [
  ['Video', 'mp4 mkv mov avi webm wmv m4v'], ['Installer / disk image', 'exe msi iso dmg msix appx'], ['Archive', 'zip rar 7z tar gz'],
  ['Game / VM / data', 'vhd vhdx vmdk img bin pak pck dat db sqlite'], ['Audio', 'wav flac mp3 m4a'], ['Image', 'psd png jpg raw tif tiff'],
  ['Document', 'pdf pptx docx xlsx'],
];
const kindOf = (ext) => (KIND.find(([, e]) => e.split(' ').includes(ext)) || ['File'])[0];

async function scanBig({ minMB = 100, oldDays = 365, oldMinMB = 20 } = {}, onProgress) {
  cancelled = false;
  const w = await walk(onProgress);
  if (w.cancelled) return null;
  const now = Date.now();
  let cand = w.files.filter((f) => f.size >= minMB * MB || (f.size >= oldMinMB * MB && now - f.mtime > oldDays * DAY));
  cand.sort((a, b) => b.size - a.size);
  cand = cand.slice(0, 300);
  const cloud = await cloudOnly(cand.map((f) => f.path));
  if (!cloud) return { files: [], truncated: w.truncated, error: 'Could not check which files are cloud-only, so nothing is listed.' };
  const out = cand
    .filter((f) => !cloud.has(f.path.toLowerCase()))
    .map((f) => ({ id: idOf(f.path), path: f.path, name: path.basename(f.path), dir: path.dirname(f.path), size: f.size, mtime: f.mtime, kind: kindOf(f.ext), old: now - f.mtime > oldDays * DAY, program: PROGRAM_EXT.has(f.ext) && !looseInRoot(f, w.roots || []) }));
  lastBig = new Map(out.map((o) => [o.id, o]));
  return { files: out, truncated: w.truncated, scanned: w.files.length, cloudSkipped: cloud.size };
}

/* ---------------------------------- duplicates ---------------------------------- */
function hashQuick(p, size) {
  return new Promise((resolve) => {
    const h = crypto.createHash('sha1');
    h.update(String(size));
    let fd;
    try {
      fd = fs.openSync(p, 'r');
      const n = 64 * 1024;
      const buf = Buffer.alloc(n);
      let r = fs.readSync(fd, buf, 0, n, 0);
      h.update(buf.subarray(0, r));
      if (size > 2 * n) {
        r = fs.readSync(fd, buf, 0, n, size - n);
        h.update(buf.subarray(0, r));
        r = fs.readSync(fd, buf, 0, n, Math.floor(size / 2));
        h.update(buf.subarray(0, r));
      }
      resolve(h.digest('hex'));
    } catch {
      resolve(null);
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    }
  });
}

function hashFull(p, onBytes) {
  return new Promise((resolve) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(p, { highWaterMark: 1 * MB });
    let ended = false;
    s.on('data', (c) => {
      h.update(c);
      onBytes(c.length);
      if (cancelled) s.destroy();
    });
    s.on('error', () => resolve(null));
    s.on('end', () => {
      ended = true;
      resolve(h.digest('hex'));
    });
    s.on('close', () => {
      if (!ended) resolve(null); // cancelled or failed half-way
    });
  });
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length && !cancelled) await fn(items[i++]);
    })
  );
}

// Keep the copy that is most likely the "real" one: not in Downloads/Desktop, then oldest, then shortest path.
function keeperScore(f) {
  const d = dirs();
  const low = f.path.toLowerCase();
  const loose = low.startsWith(d.downloads.toLowerCase()) || low.startsWith(d.desktop.toLowerCase()) ? 1 : 0;
  return [loose, f.mtime, f.path.length];
}

async function scanDupes({ minKB = 64 } = {}, onProgress) {
  cancelled = false;
  const w = await walk(onProgress);
  if (w.cancelled) return null;

  const bySize = new Map();
  for (const f of w.files) {
    if (f.size < minKB * 1024) continue;
    if (!CONTENT_EXT.has(f.ext) && !(f.ext === 'exe' && looseInRoot(f, w.roots || []))) continue;
    (bySize.get(f.size) || bySize.set(f.size, []).get(f.size)).push(f);
  }
  let cand = [...bySize.values()].filter((g) => g.length > 1).flat();
  onProgress && onProgress({ phase: 'Checking for cloud-only files', done: 0, total: cand.length, current: '' });
  const cloud = await cloudOnly(cand.map((f) => f.path));
  if (!cloud) return { groups: [], error: 'Could not check which files are cloud-only, so nothing was read.' };
  cand = cand.filter((f) => !cloud.has(f.path.toLowerCase()));

  // pass 1: size + first/middle/last 64 KB
  const quick = new Map();
  let done = 0;
  await pool(cand, 4, async (f) => {
    const q = await hashQuick(f.path, f.size);
    done++;
    if (onProgress && done % 25 === 0) onProgress({ phase: 'Comparing files', done, total: cand.length, current: path.basename(f.path) });
    if (!q) return;
    (quick.get(q) || quick.set(q, []).get(q)).push(f);
  });
  const maybe = [...quick.values()].filter((g) => g.length > 1);

  // pass 2: whole-file hash, only for files that still look identical
  const totalBytes = maybe.reduce((a, g) => a + g.reduce((b, f) => b + f.size, 0), 0);
  let doneBytes = 0;
  const full = new Map();
  let tick = 0;
  const files = maybe.flat();
  await pool(files, 3, async (f) => {
    const hsh = await hashFull(f.path, (n) => {
      doneBytes += n;
      if (onProgress && ++tick % 40 === 0) onProgress({ phase: 'Confirming duplicates', done: doneBytes, total: totalBytes, bytes: true, current: path.basename(f.path) });
    });
    if (!hsh) return;
    const key = f.size + ':' + hsh;
    (full.get(key) || full.set(key, []).get(key)).push(f);
  });
  if (cancelled) return null;

  lastDupes = new Map();
  dupGroups = new Map();
  const groups = [];
  for (const [key, list] of full) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      const A = keeperScore(a);
      const B = keeperScore(b);
      return A[0] - B[0] || A[1] - B[1] || A[2] - B[2];
    });
    const gid = idOf(key + sorted[0].path);
    const members = sorted.map((f, i) => {
      const id = idOf(f.path);
      lastDupes.set(id, { ...f, group: gid });
      return { id, path: f.path, name: path.basename(f.path), dir: path.dirname(f.path), mtime: f.mtime, keep: i === 0 };
    });
    dupGroups.set(gid, members.map((m) => m.id));
    groups.push({ id: gid, name: members[0].name, size: list[0].size, copies: members.length, wasted: list[0].size * (members.length - 1), files: members });
  }
  groups.sort((a, b) => b.wasted - a.wasted);
  return {
    groups: groups.slice(0, 300),
    totalGroups: groups.length,
    wasted: groups.reduce((a, g) => a + g.wasted, 0),
    truncated: w.truncated,
    scanned: w.files.length,
    cloudSkipped: cloud.size,
  };
}

/* ---------------------------------- Recycle Bin ---------------------------------- */
// ids from the last big-files or duplicates scan. Duplicates: at least one copy of every group always stays.
async function trash(ids) {
  const want = new Set(ids || []);
  let freed = 0;
  let count = 0;
  const failed = [];
  const stillThere = (rec) => {
    try {
      const st = fs.statSync(rec.path);
      return st.size === rec.size && Math.abs(st.mtimeMs - rec.mtime) < 2000;
    } catch {
      return false;
    }
  };
  for (const id of want) {
    const big = lastBig.get(id);
    const dup = lastDupes.get(id);
    const rec = dup || big;
    if (!rec) continue;
    if (dup) {
      const keepers = (dupGroups.get(dup.group) || []).filter((o) => !want.has(o) && lastDupes.has(o) && stillThere(lastDupes.get(o)));
      if (!keepers.length) {
        failed.push({ name: path.basename(rec.path), error: 'it is the last copy that would be left' });
        continue;
      }
    }
    if (!stillThere(rec)) {
      failed.push({ name: path.basename(rec.path), error: 'changed or already gone since the scan' });
      continue;
    }
    try {
      await shell.trashItem(rec.path);
      freed += rec.size;
      count++;
      lastBig.delete(id);
      lastDupes.delete(id);
    } catch (e) {
      failed.push({ name: path.basename(rec.path), error: e.message });
    }
  }
  walkCache = null;
  return { freed, count, failed };
}

function revealId(id) {
  const rec = lastBig.get(id) || lastDupes.get(id);
  if (rec && fs.existsSync(rec.path)) {
    shell.showItemInFolder(rec.path);
    return true;
  }
  return false;
}

async function thumb(id) {
  const m = lastPlan.get(id);
  if (!m || !fs.existsSync(m.from)) return null;
  try {
    const img = await nativeImage.createThumbnailFromPath(m.from, { width: 160, height: 100 });
    return img.isEmpty() ? null : img.toDataURL();
  } catch {
    return null;
  }
}

async function getRecentScreenshots(limit = 6) {
  const d = dirs();
  const home = path.join(d.pictures, 'Screenshots');
  const sources = [home, d.desktop, d.pictures, d.downloads];
  const found = [];
  const seenPaths = new Set();
  for (const dir of sources) {
    for (const f of await topFiles(dir)) {
      if (!isShot(f.name) || seenPaths.has(f.path)) continue;
      seenPaths.add(f.path);
      found.push(f);
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  const picks = found.slice(0, limit);
  const out = [];
  for (const p of picks) {
    let t = null;
    try {
      if (nativeImage) {
        const img = await nativeImage.createThumbnailFromPath(p.path, { width: 160, height: 100 });
        if (!img.isEmpty()) t = img.toDataURL();
      }
    } catch {}
    out.push({ path: p.path, name: p.name, mtime: p.mtime, size: p.size, thumb: t });
  }
  return out;
}

module.exports = {
  downloadsPlan, screenshotsPlan, applyGroups, applyMoves, undoMoves, history,
  scanBig, scanDupes, cancel, trash, revealId, thumb, getRecentScreenshots,
  // exposed for tests
  _isShot: isShot,
  _classify: (ext) => (EXT_GROUP.get(ext) || { id: 'other' }).id,
  _setDirs: (d) => { dirOverride = d; walkCache = null; },
};
