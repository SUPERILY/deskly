// Updates for the installed (setup) build. The portable exe cannot replace itself, so it never checks.
//
// What it contacts: the GitHub release page set in package.json (build.publish), only to read which version is
// newest. Nothing is downloaded until you click Download, and nothing is installed until you click Restart.
// You can switch checking off in Panels. Releases are not code-signed yet, so Windows may show a SmartScreen
// warning for a new installer; the download is still verified against the checksum in the release.
const { app, Notification } = require('electron');

const HOUR = 3600 * 1000;

// Plain-language errors; a repo with no releases yet is normal, not a failure to shout about.
function friendly(err) {
  const m = String((err && err.message) || err || '');
  if (/404|Not Found|Cannot find latest|No published versions|releases\.atom|latest\.yml/i.test(m)) return 'No releases have been published yet.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::|getaddrinfo|network/i.test(m)) return 'Could not reach the update server. Check your internet connection.';
  if (/sha512|checksum/i.test(m)) return 'The downloaded update did not match its checksum, so it was discarded.';
  return 'The update check failed. Try again later.';
}

// `impl` can be replaced in tests with a fake that behaves like electron-updater's autoUpdater.
function createUpdater({ getStore, save, onChange, showMain, impl = null, installed = null }) {
  const isInstalled = installed !== null ? installed : app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
  let status = { state: isInstalled ? 'idle' : 'unsupported', current: app.getVersion(), version: null, notes: '', progress: 0, error: null, checkedAt: 0, manual: false };
  let au = null;
  let timers = [];
  let notifiedFor = null;

  const set = (patch) => {
    status = { ...status, ...patch };
    onChange && onChange(status);
  };
  const prefs = () => (getStore().prefs.updates ||= {});
  const autoOn = () => prefs().auto !== false;

  function init() {
    if (au || !isInstalled) return au;
    au = impl || require('electron-updater').autoUpdater;
    au.autoDownload = false;
    au.autoInstallOnAppQuit = false; // only ever install when you press Restart
    au.allowPrerelease = false;
    au.logger = null;
    // tests (and only tests) can point the feed at a local server; anything that is not localhost is ignored
    const feed = process.env.DESKLY_UPDATE_FEED;
    if (feed && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/.test(feed) && au.setFeedURL) au.setFeedURL({ provider: 'generic', url: feed });

    au.on('checking-for-update', () => set({ state: 'checking', error: null }));
    au.on('update-available', (info) => {
      set({ state: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 600) : '', checkedAt: Date.now() });
      if (!status.manual && notifiedFor !== info.version && Notification.isSupported()) {
        notifiedFor = info.version;
        const n = new Notification({ title: `Deskly ${info.version} is available`, body: 'Open Panels → Updates to download it.', silent: true });
        n.on('click', () => showMain && showMain('panels'));
        n.show();
      }
    });
    au.on('update-not-available', () => set({ state: 'current', version: null, checkedAt: Date.now() }));
    au.on('download-progress', (p) => set({ state: 'downloading', progress: Math.round(p.percent || 0) }));
    au.on('update-downloaded', (info) => set({ state: 'ready', version: info.version || status.version, progress: 100 }));
    au.on('error', (e) => set({ state: status.state === 'downloading' ? 'available' : 'error', error: friendly(e), checkedAt: Date.now(), progress: 0 }));
    return au;
  }

  async function check(manual = false) {
    if (!isInstalled) return status;
    if (['checking', 'downloading', 'ready'].includes(status.state)) return status;
    init();
    status.manual = manual;
    try {
      await au.checkForUpdates();
    } catch (e) {
      set({ state: 'error', error: friendly(e), checkedAt: Date.now() });
    }
    return status;
  }

  async function download() {
    if (!isInstalled || status.state !== 'available') return status;
    init();
    set({ state: 'downloading', progress: 0, error: null });
    try {
      await au.downloadUpdate();
    } catch (e) {
      set({ state: 'available', error: friendly(e), progress: 0 });
    }
    return status;
  }

  function install() {
    if (!isInstalled || status.state !== 'ready') return false;
    init();
    au.quitAndInstall(false, true); // not silent: shows the installer; restart afterwards
    return true;
  }

  return {
    start() {
      if (!isInstalled) return;
      // a quiet check shortly after start, then twice a day
      timers.push(setTimeout(() => autoOn() && check(false), 2 * 60 * 1000));
      timers.push(setInterval(() => autoOn() && check(false), 12 * HOUR));
    },
    stop() {
      for (const t of timers) {
        clearTimeout(t);
        clearInterval(t);
      }
      timers = [];
    },
    status: () => ({ ...status, auto: autoOn(), installed: isInstalled }),
    check,
    download,
    install,
    setAuto(on) {
      prefs().auto = !!on;
      save();
    },
  };
}

module.exports = { createUpdater, friendly };
