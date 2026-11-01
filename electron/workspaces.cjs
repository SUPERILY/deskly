// Project workspaces and servers started from Deskly.
//
// A workspace is what you set up once per project: open it in VS Code, open a terminal there,
// open some links, and start its dev server. Deskly only runs the command you saved, in the
// project's own folder, when you click Launch.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const ANSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
const MAX_LOG = 600;

// Suggest a start command from package.json ("npm run dev" before "npm start").
function suggestStart(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const s = pkg.scripts || {};
    const pm = fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(dir, 'bun.lockb')) ? 'bun' : 'npm';
    for (const name of ['dev', 'start', 'serve']) if (s[name]) return pm === 'npm' ? `npm run ${name}` : `${pm} ${name}`;
  } catch {}
  return '';
}

function createManaged({ onChange, onLog }) {
  const procs = new Map(); // id -> record
  let seq = 0;

  const view = (r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    cmd: r.cmd,
    cwd: r.cwd,
    status: r.status, // starting | running | stopped | crashed
    port: r.port || null,
    pid: r.pid,
    startedAt: r.startedAt,
    code: r.code,
  });

  function addLines(r, text) {
    const lines = String(text).replace(ANSI, '').split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) return;
    for (const l of lines) {
      const m = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/i.exec(l);
      if (m && !r.port) {
        r.port = Number(m[1]);
        r.status = 'running';
        onChange();
      }
    }
    r.log.push(...lines);
    if (r.log.length > MAX_LOG) r.log.splice(0, r.log.length - MAX_LOG);
    r.pending.push(...lines);
    if (!r.flush) {
      r.flush = setTimeout(() => {
        r.flush = null;
        const out = r.pending.splice(0);
        if (out.length) onLog(r.id, out);
      }, 150);
    }
  }

  function start({ key, name, cwd, cmd }) {
    const live = [...procs.values()].find((r) => r.key === key && (r.status === 'starting' || r.status === 'running'));
    if (live) return live.id;
    if (!cmd || !cwd || !fs.existsSync(cwd)) throw new Error('Set a start command for this project first.');
    const id = 'm' + ++seq;
    const child = spawn('cmd.exe', ['/d', '/s', '/c', cmd], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none' } });
    const r = { id, key, name, cmd, cwd, status: 'starting', pid: child.pid, port: null, startedAt: Date.now(), log: [], pending: [], flush: null, child, code: null };
    procs.set(id, r);
    child.stdout.on('data', (d) => addLines(r, d.toString('utf8')));
    child.stderr.on('data', (d) => addLines(r, d.toString('utf8')));
    child.on('error', (e) => {
      addLines(r, `Could not start: ${e.message}`);
      r.status = 'crashed';
      onChange();
    });
    child.on('exit', (code) => {
      r.code = code;
      if (r.status !== 'stopped') r.status = code === 0 || code === null ? 'stopped' : 'crashed';
      addLines(r, `Process ended (exit code ${code}).`);
      onChange();
    });
    // a server that never prints its address still counts as running after a moment
    setTimeout(() => {
      if (r.status === 'starting' && !r.child.killed && r.code === null) {
        r.status = 'running';
        onChange();
      }
    }, 6000);
    onChange();
    return id;
  }

  function stop(id) {
    const r = procs.get(id);
    if (!r) return Promise.resolve(false);
    r.status = 'stopped';
    onChange();
    return new Promise((resolve) => execFile('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true }, (err) => resolve(!err)));
  }

  return {
    start,
    stop,
    list: () => [...procs.values()].map(view),
    log: (id) => (procs.get(id) ? procs.get(id).log.slice(-300) : []),
    remove: (id) => {
      const r = procs.get(id);
      if (r && (r.status === 'stopped' || r.status === 'crashed')) procs.delete(id);
    },
    stopAll: () => Promise.all([...procs.keys()].map(stop)),
    // Used while the app is quitting: must finish before the process exits, so it is synchronous.
    stopAllSync: () => {
      const { spawnSync } = require('child_process');
      for (const r of procs.values()) {
        if (r.status === 'starting' || r.status === 'running') {
          r.status = 'stopped';
          try {
            spawnSync('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true, timeout: 4000 });
          } catch {}
        }
      }
    },
    running: () => [...procs.values()].some((r) => r.status === 'starting' || r.status === 'running'),
  };
}

// Open everything a workspace asks for. `project` comes from the library, `ws` from the saved settings.
function launchWorkspace(project, ws, library, managed) {
  const out = [];
  if (!project) return ['Project not found'];
  if (ws.editor !== false) library.projectAction(project, 'code');
  if (ws.terminal) library.projectAction(project, 'terminal');
  for (const u of ws.urls || []) {
    if (/^https?:\/\//i.test(u)) shell.openExternal(u);
  }
  if (ws.start && String(ws.start).trim()) {
    try {
      managed.start({ key: project.key, name: project.name, cwd: project.path, cmd: String(ws.start).trim() });
    } catch (e) {
      out.push(e.message);
    }
  }
  return out;
}

module.exports = { createManaged, launchWorkspace, suggestStart };
