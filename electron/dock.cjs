// The dock: a slim floating bar (search, your top apps, Performance, All apps, Scenes, peek).
// Unlike the desktop panels it floats above your windows, so it is always one click away.
const { BrowserWindow, screen } = require('electron');

const SLOT = 44; // one button
const SEP = 13; // a divider
const PADX = 22; // side padding inside the card
const H = 76; // window height (card 60 + 8px margin each side)
const FIXED_BUTTONS = 5; // search, performance, all apps, scenes, peek

function createDock({ preload, loadDock, getStore, getDockKeys, getDisplay = () => screen.getPrimaryDisplay() }) {
  let win = null;
  let shown = true; // false while auto-hidden
  let timer = null;
  let size = { w: 0, h: H };

  const prefs = () => getStore().prefs;
  const wa = () => getDisplay().workArea;

  const widthFor = (n) => PADX * 2 + (n + FIXED_BUTTONS) * SLOT + 2 * SEP;

  function bounds(visible) {
    const a = wa();
    const x = Math.round(a.x + (a.width - size.w) / 2);
    const y = a.y + a.height - H + 2;
    // auto-hidden: slide down until only a thin strip is left (still catches the mouse)
    return { x, y: visible ? y : a.y + a.height - 6, width: size.w, height: H };
  }

  function place(visible = shown) {
    if (!win || win.isDestroyed()) return;
    win.setBounds(bounds(visible));
  }

  async function create() {
    size = { w: widthFor(getDockKeys().length), h: H };
    win = new BrowserWindow({
      ...bounds(true),
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false, // clicking the dock must not steal focus from the app you are using
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#00000000',
      title: 'Deskly dock',
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.on('closed', () => (win = null));
    await loadDock(win);
    if (win && !win.isDestroyed()) {
      win.showInactive();
      place(true);
    }
  }

  // Auto-hide: slide away when the mouse is not near, back when it touches the bottom edge.
  function poll() {
    if (!win || win.isDestroyed() || !prefs().dockAutoHide) {
      if (!shown) {
        shown = true;
        place(true);
      }
      return;
    }
    const p = screen.getCursorScreenPoint();
    const a = wa();
    const b = bounds(true);
    const near = p.x >= b.x - 30 && p.x <= b.x + b.width + 30 && p.y >= a.y + a.height - (shown ? H + 20 : 8);
    if (near !== shown) {
      shown = near;
      place(shown);
    }
  }

  return {
    async enable() {
      if (win && !win.isDestroyed()) return;
      await create();
      clearInterval(timer);
      timer = setInterval(poll, 180);
    },
    disable() {
      clearInterval(timer);
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
    },
    // The number of app slots changed (or the screen did): resize and re-centre.
    sync() {
      if (!win || win.isDestroyed()) return;
      const w = widthFor(getDockKeys().length);
      if (w !== size.w) size = { w, h: H };
      place();
    },
    isOn: () => !!win && !win.isDestroyed(),
    SLOT,
  };
}

module.exports = { createDock };
