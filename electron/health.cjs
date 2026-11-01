// Health: a light probe (battery level, GPU temperature) for automation, plus a small history so Deskly
// can write a weekly report. Everything stays on this PC, in the Deskly settings file.
//
// Cost: the history takes one reading every 5 minutes (CPU and memory come from Node itself, no process
// is started for them); the probe only runs often (every 30 s) when you have a battery or heat rule.
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const SAMPLE_MS = 5 * 60 * 1000;
const KEEP_DAYS = 35;
const GB = 1024 ** 3;
const NOISE = new Set(['system', 'system idle process', 'registry', 'memory compression', 'secure system', 'svchost', 'idle']);

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const round1 = (n) => Math.round(n * 10) / 10;

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

function readBattery() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress'],
      { windowsHide: true, timeout: 12000 },
      (err, out) => {
        if (err) return resolve(undefined); // unknown right now
        try {
          const j = JSON.parse(out);
          if (!j || j.EstimatedChargeRemaining == null) return resolve(null); // this PC has no battery
          // 1 discharging, 4 low, 5 critical: running on battery. Everything else: on power.
          resolve({ pct: Number(j.EstimatedChargeRemaining), onBattery: [1, 4, 5].includes(Number(j.BatteryStatus)) });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function readGpuTemp() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve(err.code === 'ENOENT' ? null : undefined);
      const t = Number(String(out).trim().split(/\r?\n/)[0]);
      resolve(Number.isFinite(t) ? t : undefined);
    });
  });
}

// Top programs by memory, summed per program name ("chrome.exe" has many processes).
function readTopApps() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([]);
      const by = new Map();
      for (const line of String(out).split(/\r?\n/)) {
        const m = /^"([^"]+)","\d+","[^"]*","\d+","([\d.,\s ]+)\s*K"/.exec(line);
        if (!m) continue;
        const name = m[1].replace(/\.exe$/i, '').toLowerCase();
        if (NOISE.has(name)) continue;
        const kb = Number(m[2].replace(/[^\d]/g, ''));
        if (kb) by.set(name, (by.get(name) || 0) + kb * 1024);
      }
      resolve([...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
    });
  });
}

function driveFree() {
  const out = {};
  for (const l of 'CDEFGH') {
    try {
      const s = fs.statfsSync(l + ':\\');
      out[l] = Number(s.bavail) * Number(s.bsize);
    } catch {}
  }
  return out;
}

function createHealth({ getStore, save }) {
  const timers = [];
  let latest = { t: 0, battery: undefined, gpuTemp: undefined };
  let temps = []; // recent GPU readings, newest last
  let cpuPrev = cpuTimes();
  let sampleNo = 0;

  const state = () => {
    const s = getStore();
    s.health ||= { days: {} };
    s.health.days ||= {};
    return s.health;
  };

  async function probe() {
    const [battery, gpuTemp] = await Promise.all([readBattery(), readGpuTemp()]);
    if (battery !== undefined) latest.battery = battery;
    if (gpuTemp !== undefined) {
      latest.gpuTemp = gpuTemp;
      if (gpuTemp !== null) temps = [...temps, gpuTemp].slice(-6);
    }
    latest.t = Date.now();
    return latest;
  }

  // ---- history ----
  function record(sample, when = new Date()) {
    const days = state().days;
    const k = dayKey(when);
    const d = (days[k] ||= { n: 0, cpu: 0, cpuMax: 0, ram: 0, ramMax: 0, hi: 0, gN: 0, gpuMax: 0, hot: 0, bN: 0, bat: 0, batMin: 100, disks: {}, apps: {} });
    d.n++;
    d.cpu += sample.cpu;
    d.cpuMax = Math.max(d.cpuMax, sample.cpu);
    d.ram += sample.ram;
    d.ramMax = Math.max(d.ramMax, sample.ram);
    if (sample.ram >= 85) d.hi++;
    if (sample.gpuTemp != null) {
      d.gN++;
      d.gpuMax = Math.max(d.gpuMax, sample.gpuTemp);
      if (sample.gpuTemp >= 80) d.hot++;
    }
    if (sample.battery) {
      d.bN++;
      if (sample.battery.onBattery) {
        d.bat++;
        d.batMin = Math.min(d.batMin, sample.battery.pct);
      }
    }
    if (sample.disks) d.disks = sample.disks;
    for (const [name, bytes] of sample.apps || []) {
      const a = (d.apps[name] ||= { s: 0, n: 0 });
      a.s += bytes;
      a.n++;
    }
    // keep only the last KEEP_DAYS days
    const keys = Object.keys(days).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete days[old];
    save();
  }

  async function sampleNow() {
    const now = cpuTimes();
    const dt = now.total - cpuPrev.total;
    const cpu = dt > 0 ? Math.max(0, Math.min(100, (1 - (now.idle - cpuPrev.idle) / dt) * 100)) : 0;
    cpuPrev = now;
    await probe();
    const ram = (1 - os.freemem() / os.totalmem()) * 100;
    const apps = sampleNo++ % 3 === 0 ? await readTopApps() : [];
    record({ cpu, ram, gpuTemp: latest.gpuTemp, battery: latest.battery, disks: driveFree(), apps });
  }

  // ---- what automation asks ----
  const needsProbe = () => (getStore().automation?.rules || []).some((r) => r.enabled !== false && r.when && (r.when.kind === 'lowbat' || r.when.kind === 'hot'));

  // ---- the weekly report ----
  function report(span = 7, today = new Date()) {
    const days = state().days;
    const rows = [];
    for (let i = span - 1; i >= 0; i--) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const k = dayKey(dt);
      const d = days[k];
      rows.push({
        date: k,
        weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }),
        hours: d ? round1((d.n * SAMPLE_MS) / 3600000) : 0,
        cpu: d && d.n ? round1(d.cpu / d.n) : null,
        ram: d && d.n ? round1(d.ram / d.n) : null,
        ramMax: d ? round1(d.ramMax) : null,
        gpuMax: d && d.gN ? d.gpuMax : null,
      });
    }
    const have = rows.filter((r) => r.hours > 0).length;
    const used = rows.map((r) => days[r.date]).filter((d) => d && d.n);
    const sum = (f) => used.reduce((a, d) => a + f(d), 0);
    const n = sum((d) => d.n);
    const gN = sum((d) => d.gN);
    const out = {
      span,
      have,
      days: rows,
      hours: round1((n * SAMPLE_MS) / 3600000),
      cpuAvg: n ? round1(sum((d) => d.cpu) / n) : null,
      cpuMax: used.length ? round1(Math.max(...used.map((d) => d.cpuMax))) : null,
      ramAvg: n ? round1(sum((d) => d.ram) / n) : null,
      ramMax: used.length ? round1(Math.max(...used.map((d) => d.ramMax))) : null,
      ramHighHours: round1((sum((d) => d.hi) * SAMPLE_MS) / 3600000),
      gpuMax: gN ? Math.max(...used.filter((d) => d.gN).map((d) => d.gpuMax)) : null,
      gpuHotHours: round1((sum((d) => d.hot) * SAMPLE_MS) / 3600000),
      batteryHours: round1((sum((d) => d.bat) * SAMPLE_MS) / 3600000),
      batteryMin: used.some((d) => d.bat) ? Math.min(...used.filter((d) => d.bat).map((d) => d.batMin)) : null,
      hasBattery: used.some((d) => d.bN > 0),
    };

    // drives: free space at the start of the period vs now
    const first = used[0];
    const last = used[used.length - 1];
    out.disks = [];
    if (first && last && first !== last) {
      for (const l of Object.keys(last.disks || {})) {
        if (first.disks && first.disks[l] != null) out.disks.push({ drive: l + ':', from: first.disks[l], to: last.disks[l], delta: last.disks[l] - first.disks[l] });
      }
    }

    // programs that held the most memory while they were open
    const apps = new Map();
    for (const d of used) for (const [name, a] of Object.entries(d.apps || {})) {
      const x = apps.get(name) || { s: 0, n: 0, days: 0 };
      x.s += a.s;
      x.n += a.n;
      x.days++;
      apps.set(name, x);
    }
    out.topApps = [...apps.entries()].map(([name, x]) => ({ name, avg: x.s / x.n, days: x.days })).filter((a) => a.n !== 0).sort((a, b) => b.avg - a.avg).slice(0, 6);

    // plain sentences
    const tips = [];
    const gbs = (b) => (b / GB).toFixed(1) + ' GB';
    if (out.ramHighHours >= 0.5) {
      tips.push(`Memory was above 85% for ${out.ramHighHours} hours${out.topApps[0] ? `. ${out.topApps[0].name} is usually the biggest user (about ${gbs(out.topApps[0].avg)} when open)` : ''}.`);
    }
    if (out.gpuMax != null && out.gpuMax >= 85) tips.push(`The graphics card reached ${out.gpuMax}°C${out.gpuHotHours >= 0.25 ? ` and spent about ${out.gpuHotHours} hours above 80°C` : ''}. Check dust and airflow if that is not from gaming.`);
    for (const d of out.disks) {
      if (d.delta < -2 * GB) tips.push(`${d.drive} lost ${gbs(-d.delta)} of free space this period (${gbs(d.to)} left).`);
      else if (d.delta > 2 * GB) tips.push(`${d.drive} gained ${gbs(d.delta)} of free space (${gbs(d.to)} free now).`);
    }
    if (out.batteryHours >= 1) tips.push(`You ran on battery for about ${out.batteryHours} hours${out.batteryMin != null ? `, down to ${out.batteryMin}%` : ''}.`);
    if (out.cpuAvg != null && out.cpuAvg >= 40) tips.push(`The processor averaged ${out.cpuAvg}% while Deskly was running, which is high. Performance → Overview shows who uses it.`);
    out.tips = tips.length ? tips : have ? ['Nothing worth worrying about.'] : [];

    out.text = reportText(out);
    return out;
  }

  function reportText(r) {
    if (!r.have) return 'Deskly has not collected any health data yet.';
    const L = [`PC health, last ${r.span} days (${r.have} day${r.have === 1 ? '' : 's'} with data, ${r.hours} hours watched)`, ''];
    L.push(`Processor: ${r.cpuAvg}% on average, peak ${r.cpuMax}%`);
    L.push(`Memory: ${r.ramAvg}% on average, peak ${r.ramMax}%, above 85% for ${r.ramHighHours} h`);
    if (r.gpuMax != null) L.push(`Graphics card: peak ${r.gpuMax}°C, above 80°C for ${r.gpuHotHours} h`);
    if (r.hasBattery) L.push(`Battery: ${r.batteryHours} h on battery${r.batteryMin != null ? `, lowest ${r.batteryMin}%` : ''}`);
    for (const d of r.disks) L.push(`${d.drive} free space: ${(d.from / GB).toFixed(1)} GB → ${(d.to / GB).toFixed(1)} GB`);
    if (r.topApps.length) L.push('', 'Biggest memory users: ' + r.topApps.map((a) => `${a.name} (${(a.avg / GB).toFixed(1)} GB)`).join(', '));
    if (r.tips.length) L.push('', ...r.tips.map((t) => '• ' + t));
    return L.join('\n');
  }

  return {
    start() {
      // the first reading comes after a minute so starting Windows is never slowed down
      timers.push(setTimeout(() => sampleNow().catch(() => {}), 90 * 1000));
      timers.push(setInterval(() => sampleNow().catch(() => {}), SAMPLE_MS));
      timers.push(setInterval(() => needsProbe() && probe().catch(() => {}), 30 * 1000));
      if (needsProbe()) setTimeout(() => probe().catch(() => {}), 3000);
    },
    stop() {
      for (const t of timers) {
        clearInterval(t);
        clearTimeout(t);
      }
    },
    probe,
    latest: () => ({ ...latest, temps: [...temps] }),
    summary: () => ({ hasBattery: latest.battery !== null && latest.battery !== undefined ? true : latest.battery === null ? false : null, hasGpuTemp: latest.gpuTemp === null ? false : latest.gpuTemp === undefined ? null : true, batteryPct: latest.battery ? latest.battery.pct : null, gpuTemp: latest.gpuTemp == null ? null : latest.gpuTemp }),
    report,
    // exposed for tests
    record,
    sampleNow,
    needsProbe,
    _setTemps: (t) => (temps = t),
  };
}

module.exports = { createHealth, dayKey, SAMPLE_MS };
