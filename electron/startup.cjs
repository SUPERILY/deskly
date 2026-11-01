// Startup apps: what launches when Windows starts. Toggling uses the same switch as Task Manager
// (StartupApproved), so nothing is deleted and it is fully reversible. Only your own entries are editable.
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const scanner = require('./scanner.cjs');

const script = () => path.join(__dirname, 'startup.ps1').replace('app.asar', 'app.asar.unpacked');

let last = [];

function exeOf(command) {
  const c = String(command || '').trim();
  const q = /^"([^"]+)"/.exec(c);
  const raw = q ? q[1] : (/^(\S+\.(exe|lnk|bat|cmd))/i.exec(c) || [])[1] || c.split(' ')[0];
  const expanded = (raw || '').replace(/%([^%]+)%/g, (_, v) => process.env[v] || '');
  try {
    return fs.existsSync(expanded) ? expanded : '';
  } catch {
    return '';
  }
}

const impactScript = () => path.join(__dirname, 'impact.ps1').replace('app.asar', 'app.asar.unpacked');

function snapshot() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', impactScript()], { windowsHide: true, timeout: 25000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
      if (err) return resolve(null);
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve(null);
      }
    });
  });
}

const MB = 1024 * 1024;
const USAGE_DRIVEN = new Set(['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc']);
const BOOT_WINDOW = 20 * 60 * 1000; // programs started within 20 minutes of boot count as "started with Windows"

// An estimate, not a stopwatch: Windows does not keep per-program boot timings on most PCs, so we look at what
// each startup program has actually used since it started: CPU seconds (only comparable when it started at
// boot) and memory. Programs that are not running now get "unknown".
function estimate(items, snap) {
  const procs = (snap && snap.procs) || [];
  const boot = snap && snap.boot ? Date.parse(snap.boot) : null;
  const byPath = new Map();
  const byName = new Map();
  for (const p of procs) {
    if (p.p) (byPath.get(p.p.toLowerCase()) || byPath.set(p.p.toLowerCase(), []).get(p.p.toLowerCase())).push(p);
    const n = String(p.n).toLowerCase();
    (byName.get(n) || byName.set(n, []).get(n)).push(p);
  }
  for (const it of items) {
    if (!it.enabled) {
      it.impact = { level: 'off' };
      continue;
    }
    const exe = it.path && /\.exe$/i.test(it.path) ? it.path : '';
    const matched = exe ? byPath.get(exe.toLowerCase()) || byName.get(path.basename(exe, '.exe').toLowerCase()) || [] : [];
    if (!exe || !snap) {
      it.impact = { level: 'unknown', reason: !snap ? 'could not read running programs' : 'not a program Deskly can measure' };
      continue;
    }
    if (!matched.length) {
      it.impact = { level: 'unknown', reason: 'not running right now' };
      continue;
    }
    const ram = matched.reduce((a, p) => a + p.ws, 0);
    const cpu = matched.reduce((a, p) => a + (p.cpu || 0), 0);
    const atBoot = boot != null && matched.some((p) => p.st && Math.abs(Date.parse(p.st) - boot) <= BOOT_WINDOW);
    // Browsers grow with every tab you open, so their memory says nothing about what starting them costs.
    const usageDriven = USAGE_DRIVEN.has(path.basename(exe, '.exe').toLowerCase());
    const ramPts = usageDriven ? 0 : ram >= 500 * MB ? 3 : ram >= 200 * MB ? 2 : ram >= 80 * MB ? 1 : 0;
    const cpuPts = !atBoot ? 0 : cpu >= 120 ? 3 : cpu >= 30 ? 2 : cpu >= 8 ? 1 : 0;
    const pts = ramPts + cpuPts;
    it.impact = { level: pts >= 4 ? 'high' : pts >= 2 ? 'medium' : 'low', ram, cpu: Math.round(cpu), atBoot, processes: matched.length, note: usageDriven ? 'Memory not counted: it grows with what you open' : undefined };
  }
  return items;
}

function list() {
  return new Promise((resolve) => {
    const snapP = snapshot();
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script()], { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, async (err, out) => {
      if (err) return resolve(last);
      let rows = [];
      try {
        const j = JSON.parse(out);
        rows = Array.isArray(j) ? j : [j];
      } catch {}
      const items = rows.map((r) => {
        const exe = exeOf(r.command);
        return { ...r, key: 'startup:' + r.id.toLowerCase(), path: exe, _iconSrc: exe || undefined, _iconFlags: 4 };
      });
      estimate(items, await snapP);
      const withIcon = items.filter((i) => i._iconSrc);
      await scanner.withIcons(withIcon);
      for (const i of items) {
        delete i._iconSrc;
        delete i._iconFlags;
      }
      last = items;
      resolve(items);
    });
  });
}

// Enable/disable one of the user's own entries (Run key value or Startup-folder file).
function setEnabled(id, enabled) {
  return new Promise((resolve) => {
    const item = last.find((i) => i.id === id);
    if (!item || !item.editable) return resolve({ ok: false, error: 'This entry belongs to all users and needs administrator rights to change.' });
    const isFolder = id.startsWith('folder:');
    const valueName = isFolder ? id.slice('folder:'.length) : id.slice(id.indexOf(':') + 1);
    const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\${isFolder ? 'StartupFolder' : 'Run'}`;
    const data = (enabled ? '02' : '03') + '0000000000000000000000'; // 12 bytes, same format Task Manager writes
    execFile('reg', ['add', key, '/v', valueName, '/t', 'REG_BINARY', '/d', data, '/f'], { windowsHide: true }, (err) => {
      if (!err) item.enabled = enabled;
      resolve({ ok: !err });
    });
  });
}

module.exports = { list, setEnabled, estimate };
