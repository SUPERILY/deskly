// Live system monitor: CPU, RAM, GPU, disks, top resource hogs and dev servers.
// It only runs while at least one window is showing it, so it never costs you performance when idle.
const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');

// Programs we refuse to end from the UI (Windows needs them, or it would end Deskly itself).
const PROTECTED = new Set([
  'system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm',
  'fontdrvhost', 'explorer', 'sihost', 'ctfmon', 'taskhostw', 'audiodg', 'memory compression', 'secure system',
  'msmpeng', 'nissrv', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'runtimebroker', 'wudfhost',
  'spoolsv', 'lsaiso', 'securityhealthservice', 'deskly',
]);

function createSysmon({ onSample }) {
  const subs = new Set();
  const detailed = new Set(); // windows showing per-process GPU (the costly counter)
  const gpuFlag = path.join(os.tmpdir(), 'deskly-gpu-detail.flag');
  let gpuApps = [];
  let ps = null;
  let fast = null;
  let disksTimer = null;
  let stopTimer = null;
  let buf = '';
  let psData = { cpu: [], ram: [], gpu: [], servers: [], procCount: 0 };
  let disks = [];
  let gpu = null;
  let cpuPrev = null;
  let cpuPct = 0;
  let gpuTick = 0;
  let last = null;

  const script = () => path.join(__dirname, 'sample.ps1').replace('app.asar', 'app.asar.unpacked');

  const cpuTimes = () => {
    let idle = 0;
    let total = 0;
    for (const c of os.cpus()) {
      for (const k of Object.keys(c.times)) total += c.times[k];
      idle += c.times.idle;
    }
    return { idle, total };
  };

  function readGpu() {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 4000 },
      (err, out) => {
        if (err) return;
        const [name, util, used, total, temp, power] = out.trim().split(/\s*,\s*/);
        gpu = {
          name,
          util: Number(util),
          memUsed: Number(used) * 1024 * 1024,
          memTotal: Number(total) * 1024 * 1024,
          temp: Number(temp),
          power: Number(power) || null,
        };
      }
    );
  }

  // Which programs have the GPU open (nvidia-smi shows the list but no per-process percentages on Windows).
  function readGpuApps() {
    execFile('nvidia-smi', ['pmon', '-c', '1'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      if (err) return;
      const names = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (line.startsWith('#') || !line.trim()) continue;
        const cols = line.trim().split(/\s+/);
        const exe = cols[cols.length - 1];
        if (exe && exe !== '-') names.add(exe.replace(/\.exe$/i, ''));
      }
      gpuApps = [...names];
    });
  }

  function syncGpuFlag() {
    const fs = require('fs');
    try {
      if (detailed.size) fs.writeFileSync(gpuFlag, '1');
      else fs.unlinkSync(gpuFlag);
    } catch {}
  }

  function readDisks() {
    const list = [];
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      try {
        const root = l + ':\\';
        const s = fs.statfsSync(root);
        const total = Number(s.blocks) * Number(s.bsize);
        const free = Number(s.bavail) * Number(s.bsize);
        if (total > 0) {
          list.push({ drive: l + ':', label: '', total, free });
        }
      } catch {}
    }
    if (list.length) {
      disks = list;
      return;
    }

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress'],
      { windowsHide: true, timeout: 8000 },
      (err, out) => {
        if (err) return;
        try {
          const j = JSON.parse(out);
          disks = (Array.isArray(j) ? j : [j]).map((d) => ({ drive: d.DeviceID, label: d.VolumeName || '', total: Number(d.Size), free: Number(d.FreeSpace) }));
        } catch {}
      }
    );
  }

  function handleLine(line) {
    try {
      const j = JSON.parse(line);
      if (!j.first) psData = j;
    } catch {}
  }

  function tick() {
    // total CPU from the OS counters (cheap, in-process)
    const now = cpuTimes();
    if (cpuPrev) {
      const dt = now.total - cpuPrev.total;
      const di = now.idle - cpuPrev.idle;
      cpuPct = dt > 0 ? Math.max(0, Math.min(100, (1 - di / dt) * 100)) : 0;
    }
    cpuPrev = now;
    if (gpuTick++ % 2 === 0) {
      readGpu();
      readGpuApps();
    }

    const total = os.totalmem();
    const free = os.freemem();
    last = {
      t: Date.now(),
      cpu: Math.round(cpuPct * 10) / 10,
      cores: os.cpus().length,
      ram: { used: total - free, total },
      gpu: gpu ? { ...gpu, apps: gpuApps } : null,
      disks,
      hogs: { cpu: psData.cpu || [], ram: psData.ram || [], gpu: psData.gpu || [] },
      servers: psData.servers || [],
      procCount: psData.procCount || 0,
    };
    onSample(last, [...subs]);
  }

  function start() {
    clearTimeout(stopTimer);
    if (ps) return;
    buf = '';
    cpuPrev = cpuTimes();
    ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script(), '-Interval', '3000', '-GpuFlag', gpuFlag], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handleLine(line);
      }
    });
    ps.on('exit', () => (ps = null));
    readDisks();
    readGpu();
    disksTimer = setInterval(readDisks, 30000);
    fast = setInterval(tick, 2000);
  }

  function stop() {
    clearInterval(fast);
    clearInterval(disksTimer);
    fast = disksTimer = null;
    if (ps) {
      try {
        ps.kill();
      } catch {}
      ps = null;
    }
  }

  return {
    // `detail`: also compute per-process GPU use (only the Performance page asks for that).
    subscribe(id, detail = false) {
      subs.add(id);
      if (detail) detailed.add(id);
      syncGpuFlag();
      start();
      return last;
    },
    unsubscribe(id) {
      subs.delete(id);
      detailed.delete(id);
      syncGpuFlag();
      if (!subs.size) {
        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => !subs.size && stop(), 5000); // grace period for page switches
      }
    },
    latest: () => last,
    stop,

    // End a program (all of its processes). Only pids we have just listed may be ended.
    kill(pids) {
      const allowed = new Set();
      const names = new Map();
      for (const list of [psData.cpu, psData.ram, psData.gpu]) {
        for (const g of list || []) for (const p of g.pids || []) (allowed.add(p), names.set(p, g.name));
      }
      for (const s of psData.servers || []) (allowed.add(s.pid), names.set(s.pid, s.name));
      const todo = (pids || []).map(Number).filter((p) => allowed.has(p) && p !== process.pid);
      const blocked = todo.filter((p) => PROTECTED.has(String(names.get(p)).toLowerCase()));
      if (blocked.length) return Promise.resolve({ ok: false, error: `${names.get(blocked[0])} is needed by Windows or Deskly and can't be ended here.` });
      if (!todo.length) return Promise.resolve({ ok: false, error: 'That program is no longer running.' });
      return Promise.all(
        todo.map(
          (p) =>
            new Promise((res) => {
              execFile('taskkill', ['/PID', String(p), '/T', '/F'], { windowsHide: true }, (err) => res(!err));
            })
        )
      ).then((r) => {
        // forget what we just ended so the UI updates at once, not on the next sample
        const gone = new Set(todo);
        const strip = (list) => (list || []).filter((g) => !(g.pids || []).some((p) => gone.has(p)));
        psData = { ...psData, cpu: strip(psData.cpu), ram: strip(psData.ram), gpu: strip(psData.gpu), servers: (psData.servers || []).filter((s) => !gone.has(s.pid)) };
        tick();
        return { ok: r.some(Boolean), killed: r.filter(Boolean).length };
      });
    },
  };
}

module.exports = { createSysmon, PROTECTED };
