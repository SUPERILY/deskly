// Quiet alerts: a notification only when something is really worth your attention, with a long
// cool-down so the same problem never nags. Each kind can be switched off.
const { Notification } = require('electron');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const procgroups = require('./procgroups.cjs');

const gb = (b) => (b / 1024 ** 3).toFixed(1) + ' GB';
const HOUR = 3600 * 1000;

function createAlerts({ getStore, save, showMain, getReport = null }) {
  const timers = [];
  let ramHigh = 0; // consecutive checks above the threshold

  const on = (kind) => getStore().prefs.alerts?.[kind] !== false;

  // true if this alert may fire now (and records that it did)
  function cooled(key, ms) {
    const s = getStore();
    s.alertLog ||= {};
    if (Date.now() - (s.alertLog[key] || 0) < ms) return false;
    s.alertLog[key] = Date.now();
    save();
    return true;
  }

  function notify(title, body, page = 'performance') {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: true });
    n.on('click', () => showMain(page));
    n.show();
  }

  // ---- memory: 90% or more for about 90 seconds ----
  function checkRam() {
    if (!on('ram')) return (ramHigh = 0);
    const used = 1 - os.freemem() / os.totalmem();
    ramHigh = used >= 0.9 ? ramHigh + 1 : 0;
    if (ramHigh < 3 || !cooled('ram', 2 * HOUR)) return;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-Process | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{ n = $_.Name; m = ($_.Group | Measure-Object WorkingSet64 -Sum).Sum } } | Sort-Object m -Descending | Select-Object -First 1 | ConvertTo-Json -Compress)'],
      { windowsHide: true, timeout: 8000 },
      (err, out) => {
        let top = '';
        try {
          const j = JSON.parse(out);
          top = ` ${j.n} is using the most (${gb(j.m)}).`;
        } catch {}
        notify('Memory is almost full', `${Math.round(used * 100)}% in use.${top} Open Performance to see what you can end.`);
      }
    );
  }

  // ---- disks: under 10% free ----
  function checkDisks() {
    if (!on('disk')) return;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress'],
      { windowsHide: true, timeout: 10000 },
      (err, out) => {
        if (err) return;
        try {
          const j = JSON.parse(out);
          for (const d of Array.isArray(j) ? j : [j]) {
            const free = Number(d.FreeSpace);
            const size = Number(d.Size);
            if (size && free / size < 0.1 && cooled('disk:' + d.DeviceID, 24 * HOUR)) {
              notify(`${d.DeviceID} is almost full`, `Only ${gb(free)} left. Performance → Storage can find what to clear.`);
            }
          }
        } catch {}
      }
    );
  }

  // ---- dev servers running for more than 8 hours ----
  function checkServers() {
    if (!on('servers')) return;
    const script = path.join(__dirname, 'sample.ps1').replace('app.asar', 'app.asar.unpacked');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Once'], { windowsHide: true, timeout: 25000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
      if (err) return;
      try {
        const j = JSON.parse(out.trim().split('\n').filter(Boolean)[0]);
        for (const sv of j.servers || []) {
          if (sv.start && Date.now() - sv.start > 8 * HOUR && cooled(`server:${sv.pid}:${sv.port}`, 7 * 24 * HOUR)) {
            notify('A dev server has been running for hours', `:${sv.port} (${sv.name}) has been up for ${Math.floor((Date.now() - sv.start) / HOUR)} hours and uses ${gb(sv.ram)}. Forgotten?`);
          }
        }
      } catch {}
    });
  }

  // ---- leftover helper processes worth freeing ----
  async function checkLeftovers() {
    if (!on('leftovers')) return;
    try {
      const d = await procgroups.scan();
      const safe = d.groups.filter((g) => g.safe);
      const ram = safe.reduce((a, g) => a + g.ram, 0);
      const count = safe.reduce((a, g) => a + g.count, 0);
      if (ram >= 2 * 1024 ** 3 && cooled('leftovers', 24 * HOUR)) {
        notify('Leftover helper processes found', `${count} helper programs from apps that closed are using ${gb(ram)}. Performance → Cleanup can end them.`);
      }
    } catch {}
  }

  // ---- once a week: "your report is ready" (needs at least 3 days of data) ----
  function checkWeekly() {
    if (!on('weekly') || !getReport) return;
    try {
      const r = getReport();
      if (r.have < 3 || !cooled('weekly', 6.5 * 24 * HOUR)) return;
      const lead = r.tips && r.tips[0] ? r.tips[0] : 'Nothing worth worrying about.';
      notify('Your weekly PC report is ready', `${lead} Open Performance → This week.`);
    } catch {}
  }

  return {
    start() {
      timers.push(setTimeout(checkWeekly, 10 * 60 * 1000));
      timers.push(setInterval(checkWeekly, 6 * HOUR));
      // nothing runs for the first minute, so starting Windows is never slowed down
      timers.push(setInterval(checkRam, 30 * 1000));
      timers.push(setTimeout(checkDisks, 60 * 1000));
      timers.push(setInterval(checkDisks, 30 * 60 * 1000));
      timers.push(setTimeout(checkServers, 90 * 1000));
      timers.push(setInterval(checkServers, 15 * 60 * 1000));
      timers.push(setTimeout(checkLeftovers, 120 * 1000));
      timers.push(setInterval(checkLeftovers, 45 * 60 * 1000));
    },
    stop() {
      for (const t of timers) {
        clearInterval(t);
        clearTimeout(t);
      }
    },
    // exposed for tests
    checkRam, checkDisks, checkServers, checkLeftovers, checkWeekly, cooled,
  };
}

module.exports = { createAlerts };
