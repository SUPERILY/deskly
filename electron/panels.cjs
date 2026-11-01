// Desktop panels: transparent windows living on the desktop itself.
// Two styles: "hub" (one tabbed card + widgets) and "classic" (one panel per category).
const { BrowserWindow, screen } = require('electron');
const ws = require('./winshell.cjs');
const { WIDGETS, byId: widgetById } = require('./widgets.cjs');

// Must match src/panel.css and src/Panel.jsx (all values in DIPs).
const PAD = 16;
const HEAD = 56;
const TABS_H = 46; // the hub's tab bar
const MARGIN = 8; // transparent margin around the visible card (room for its shadow)
const GAP = 14;
const ROW_H = 38;
const LIST_W = 232 + PAD * 2 + MARGIN * 2;
const LIST_MAX_ROWS = 10; // taller lists scroll
const SNAP = 12;
const DOCK_RESERVE = 84; // keep the bottom strip free for the dock

// Tile sizes per density. `rows` is how many rows show before the card scrolls.
const DENS = {
  comfortable: { tw: 96, th: 100, rows: 5, hubCols: 4, cols: (n) => (n <= 2 ? 2 : n <= 6 ? 3 : 4) },
  compact: { tw: 72, th: 78, rows: 6, hubCols: 5, cols: (n) => (n <= 3 ? 3 : n <= 8 ? 4 : 5) },
  mini: { tw: 48, th: 48, rows: 8, hubCols: 8, cols: (n) => (n <= 4 ? 4 : n <= 12 ? 6 : 8) },
};
const densityOf = (id, pp, prefs) => {
  const d = (pp[id] && pp[id].density) || prefs.density || 'compact';
  return DENS[d] ? d : 'compact';
};

// Window size for a panel spec. `collapsed` keeps only the header bar. Widgets have fixed sizes.
function dimsOf(s) {
  const D = DENS[s.density] || DENS.comfortable;
  if (s.widget && widgetById[s.widget]) {
    const wd = widgetById[s.widget];
    return { w: wd.w, h: s.collapsed ? HEAD + MARGIN * 2 : wd.h };
  }
  if (s.hub) {
    const w = D.hubCols * D.tw + PAD * 2 + MARGIN * 2;
    if (s.collapsed) return { w, h: HEAD + MARGIN * 2 };
    const rows = Math.min(Math.max(1, Math.ceil(s.n / D.hubCols)), D.rows);
    return { w, h: HEAD + TABS_H + rows * D.th + PAD + MARGIN * 2 };
  }
  const cols = D.cols(s.n);
  const w = s.view === 'list' ? LIST_W : cols * D.tw + PAD * 2 + MARGIN * 2;
  if (s.collapsed) return { w, h: HEAD + MARGIN * 2 };
  if (s.view === 'list') return { w, h: HEAD + Math.min(Math.max(s.n, 1), LIST_MAX_ROWS) * ROW_H + PAD + MARGIN * 2 };
  const rows = Math.min(Math.max(1, Math.ceil(s.n / cols)), D.rows);
  return { w, h: HEAD + rows * D.th + PAD + MARGIN * 2 };
}

// Which panels exist for this state, in display order.
function specsOf(state) {
  const counts = {};
  for (const it of state.items) counts[it.category] = (counts[it.category] || 0) + 1;
  const pp = state.panelPrefs || {};
  const prefs = state.prefs || {};
  const wprefs = prefs.widgets || {};
  const scene = state.scene;
  // An active scene (other than "Everything") decides exactly which panels exist; otherwise
  // categories always show and widgets follow their own switches.
  const scoped = scene && scene.show !== 'all' && Array.isArray(scene.show);
  const visible = (id, isWidget) => (scoped ? scene.show.includes(id) : isWidget ? !!wprefs[id] : true);
  const common = (s) => ({
    ...s,
    view: (pp[s.id] && pp[s.id].view) === 'list' ? 'list' : 'grid',
    collapsed: !!(pp[s.id] && pp[s.id].collapsed),
    density: densityOf(s.id, pp, prefs),
  });

  const tabs = [];
  if (state.quick && state.quick.keys.length && visible('quick', false)) tabs.push({ id: 'quick', n: state.quick.keys.length, cat: state.quick });
  for (const c of state.categories) if (counts[c.id] && visible(c.id, false)) tabs.push({ id: c.id, n: counts[c.id], cat: c });

  const list = [];
  if (prefs.layoutMode === 'classic') {
    for (const t of tabs) list.push(common(t));
  } else if (tabs.length) {
    list.push(common({ id: 'hub', hub: true, n: Math.max(...tabs.map((t) => t.n)), cat: { id: 'hub', name: 'Deskly' }, tabIds: tabs.map((t) => t.id) }));
  }
  for (const w of WIDGETS) if (visible(w.id, true)) list.push(common({ id: w.id, n: 0, cat: w, widget: w.id }));
  return list;
}

// When everything cannot fit on screen, fold the least important panels first (classic style only).
const COLLAPSE_ORDER = ['files', 'other', 'folders', 'system', 'comms', 'web', 'media', 'work', 'creative', 'games', 'dev'];

function createPanels({ preload, loadPanel, getStore, save, onAutoCollapse, getDisplay = () => screen.getPrimaryDisplay() }) {
  let displayKey = null; // which screen (and size) the current layout was made for
  let autoSet = new Set(); // panel ids folded automatically to make everything fit (not a user choice)
  const wins = new Map(); // panel id -> { id, win, sig, w, h, x, y, drag }
  let enabled = false;
  let hiddenAll = false; // "peek": panels temporarily hidden
  let progman = 0n;
  let timer = null;
  let last = null;
  let queue = Promise.resolve();

  const prefs = () => getStore().prefs;
  const area = () => {
    const a = getDisplay().workArea;
    const reserve = prefs().dock === 'off' ? 0 : DOCK_RESERVE;
    return { x: a.x, y: a.y, width: a.width, height: a.height - reserve };
  };

  const clamp = (pos, d) => {
    const a = area();
    return {
      x: Math.min(Math.max(pos.x, a.x - MARGIN), a.x + a.width - d.w + MARGIN),
      y: Math.min(Math.max(pos.y, a.y - MARGIN), a.y + a.height - d.h + MARGIN),
    };
  };

  // Stack panels into columns, top to bottom, starting a new column when the screen height is used up.
  // `dir` 1 flows columns left to right from `edge`; -1 flows right to left.
  function flow(specs, edge, dir, out) {
    const a = area();
    const startY = a.y + 12;
    let y = startY;
    let maxW = 0;
    let col = [];
    const commit = () => {
      if (!col.length) return;
      // the visible cards are `GAP` apart: windows overlap by their transparent margins
      const x0 = dir === 1 ? edge : edge - maxW;
      for (const s of col) out[s.id] = { x: x0, y: s.y };
      edge = dir === 1 ? edge + maxW - 2 * MARGIN + GAP : edge - maxW + 2 * MARGIN - GAP;
      col = [];
      maxW = 0;
    };
    for (const s of specs) {
      const d = dimsOf(s);
      if (col.length && y + d.h > a.y + a.height) {
        commit();
        y = startY;
      }
      col.push({ id: s.id, y });
      y += d.h - 2 * MARGIN + GAP;
      maxW = Math.max(maxW, d.w);
    }
    commit();
    return out;
  }

  // Default arrangement. Hub style: the hub on one side, widgets stacked on the other (preset left/right/center).
  function autoLayout(specs) {
    const a = area();
    const out = {};
    const hub = specs.find((s) => s.hub);
    if (!hub) return flow(specs, a.x + 12, 1, out);

    const hd = dimsOf(hub);
    const others = specs.filter((s) => !s.hub);
    const layout = prefs().layout || 'left';
    const right = a.x + a.width - 12; // right edge of the windows (cards sit one margin inside)
    if (layout === 'right') {
      out[hub.id] = { x: right - hd.w, y: a.y + 12 };
      flow(others, a.x + 12, 1, out);
    } else if (layout === 'center') {
      out[hub.id] = { x: a.x + Math.round((a.width - hd.w) / 2), y: a.y + 12 };
      const half = Math.ceil(others.length / 2);
      flow(others.slice(0, half), a.x + 12, 1, out);
      flow(others.slice(half), right, -1, out);
    } else {
      out[hub.id] = { x: a.x + 12, y: a.y + 12 };
      // widgets flow from the right edge inwards
      flow(others, right, -1, out);
    }
    return out;
  }

  // Classic style: fold panels (least important first) until the default layout fits the screen width.
  function fit(free, pp) {
    const a = area();
    const limit = a.x + a.width - 8;
    const extent = () => {
      const lay = autoLayout(free);
      let right = 0;
      for (const s of free) right = Math.max(right, lay[s.id].x + dimsOf(s).w - MARGIN);
      return right;
    };
    const folded = new Set();
    if (free.some((s) => s.hub)) return folded; // the hub is one card; nothing to fold
    for (const id of COLLAPSE_ORDER) {
      if (extent() <= limit) break;
      const s = free.find((x) => x.id === id);
      // collapsed === false means the user expanded it on purpose: never fold that one
      if (s && !s.collapsed && !(pp[id] && pp[id].collapsed === false)) {
        s.collapsed = true;
        folded.add(id);
      }
    }
    return folded;
  }

  // Snap the dragged card to screen edges and to its neighbours (aligned, or a gap apart).
  function snapPos(e, x, y) {
    const a = area();
    const cw = e.w - 2 * MARGIN;
    const ch = e.h - 2 * MARGIN;
    const xs = [a.x + 12, a.x + a.width - 12 - cw];
    const ys = [a.y + 12, a.y + a.height - 12 - ch];
    for (const o of wins.values()) {
      if (o === e || o.win.isDestroyed()) continue;
      const ox = o.x + MARGIN;
      const oy = o.y + MARGIN;
      const ow = o.w - 2 * MARGIN;
      const oh = o.h - 2 * MARGIN;
      xs.push(ox, ox + ow - cw, ox + ow + GAP, ox - GAP - cw);
      ys.push(oy, oy + oh - ch, oy + oh + GAP, oy - GAP - ch);
    }
    const pick = (v, cands) => {
      let best = v;
      let dist = SNAP + 1;
      for (const c of cands) {
        const d = Math.abs(c - v);
        if (d < dist) {
          dist = d;
          best = c;
        }
      }
      return dist <= SNAP ? best : v;
    };
    return { x: pick(x + MARGIN, xs) - MARGIN, y: pick(y + MARGIN, ys) - MARGIN };
  }

  const sigOf = (s) => [s.n, s.view, s.collapsed, s.density, s.hub ? (s.tabIds || []).join(',') : ''].join('|');

  async function create(spec, pos) {
    const d = dimsOf(spec);
    const win = new BrowserWindow({
      width: d.w,
      height: d.h,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false, // clicking a panel must never pull it above your apps
      show: false,
      backgroundColor: '#00000000',
      title: 'Deskly panel',
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    const entry = { id: spec.id, win, sig: sigOf(spec), w: d.w, h: d.h, x: pos.x, y: pos.y, drag: null };
    wins.set(spec.id, entry);
    win.on('closed', () => {
      if (wins.get(spec.id) === entry) wins.delete(spec.id);
    });
    await loadPanel(win, spec.id);
    if (win.isDestroyed()) return;
    win.showInactive();
    const pm = ws.attach(win);
    if (!pm) {
      // Explorer's desktop is not up yet (e.g. right after sign-in). A panel must never float
      // loose above your apps, so drop it; the watchdog rebuilds once the desktop exists.
      wins.delete(spec.id);
      if (!win.isDestroyed()) win.destroy();
      return;
    }
    progman = pm;
    ws.place(win, entry.x, entry.y, entry.w, entry.h);
    if (hiddenAll) win.hide();
  }

  async function doSync(state) {
    last = state;
    if (!enabled) return;
    const specs = specsOf(state);

    // A different screen (chosen, unplugged, replugged) or a new resolution: dragged positions belonged to the
    // old geometry, so start from the default layout there, and move every window.
    const d = getDisplay();
    const key = `${d.id}:${d.workArea.x},${d.workArea.y},${d.workArea.width}x${d.workArea.height}:${d.scaleFactor}`;
    const sameScreen = displayKey && displayKey.split(':')[0] === String(d.id);
    const moved = displayKey !== null && key !== displayKey;
    if (moved && !sameScreen) delete getStore().panels;
    displayKey = key;
    if (moved && !sameScreen) save();
    const saved = getStore().panels || {};
    // panels the user dragged keep their place; the rest are arranged (and folded if needed) to fit
    const free = specs.filter((s) => !saved[s.id]);
    const folded = fit(free, state.panelPrefs || {});
    const auto = autoLayout(free);
    const ids = new Set(specs.map((s) => s.id));
    const sig = [...folded].sort().join('|');
    if (sig !== [...autoSet].sort().join('|')) {
      autoSet = folded;
      if (onAutoCollapse) setTimeout(onAutoCollapse, 50); // tell the panel windows to redraw as folded
    }

    for (const [id, e] of [...wins]) {
      if (!ids.has(id)) {
        wins.delete(id);
        if (!e.win.isDestroyed()) e.win.destroy();
      }
    }
    for (const s of specs) {
      const d = dimsOf(s);
      const e = wins.get(s.id);
      const pos = saved[s.id] || auto[s.id];
      if (!e) {
        await create(s, clamp(pos, d));
      } else if (!e.win.isDestroyed() && (moved || e.sig !== sigOf(s) || (!saved[s.id] && (Math.round(e.x) !== Math.round(pos.x) || Math.round(e.y) !== Math.round(pos.y))))) {
        e.sig = sigOf(s);
        e.w = d.w;
        e.h = d.h;
        const p = clamp(saved[s.id] || pos, d);
        e.x = p.x;
        e.y = p.y;
        ws.place(e.win, e.x, e.y, e.w, e.h);
      }
    }
  }

  const sync = (state) => (queue = queue.then(() => doSync(state)).catch((e) => console.error('panel sync failed', e)));

  // Hide Explorer's own desktop icons (remembering that we did, so we can always give them back).
  function hideNativeIcons() {
    if (ws.setIconsHidden(true)) {
      getStore().iconsHiddenByUs = true;
      save();
    }
  }

  function restoreIcons() {
    const s = getStore();
    if (s.iconsHiddenByUs) {
      ws.setIconsHidden(false);
      s.iconsHiddenByUs = false;
      save();
    }
  }

  // Explorer restarts (crash, taskbar fix) destroy the desktop window and our panels with it.
  function watchdog() {
    if (!enabled) return;
    const cur = ws.progman();
    if (cur && cur !== progman) {
      for (const e of wins.values()) if (!e.win.isDestroyed()) e.win.destroy();
      wins.clear();
      progman = cur;
      hideNativeIcons();
      if (last) sync(last);
    }
  }

  return {
    available: ws.available,
    isEnabled: () => enabled,
    autoCollapsed: () => [...autoSet],
    isHidden: () => hiddenAll,

    async enable(state) {
      if (!ws.available()) return false;
      enabled = true;
      progman = ws.progman();
      hideNativeIcons();
      await sync(state);
      clearInterval(timer);
      timer = setInterval(watchdog, 4000);
      return true;
    },

    disable() {
      enabled = false;
      hiddenAll = false;
      clearInterval(timer);
      for (const e of wins.values()) if (!e.win.isDestroyed()) e.win.destroy();
      wins.clear();
      restoreIcons();
    },

    sync,
    restoreIcons,

    // "Peek": hide every panel to see your wallpaper, or bring them back. Returns the new state.
    setHidden(h) {
      hiddenAll = !!h;
      for (const e of wins.values()) {
        if (e.win.isDestroyed()) continue;
        if (hiddenAll) e.win.hide();
        else {
          e.win.showInactive();
          ws.place(e.win, e.x, e.y, e.w, e.h);
        }
      }
      return hiddenAll;
    },

    // Forget dragged positions and flow everything back into the default layout.
    resetLayout(state) {
      delete getStore().panels;
      save();
      for (const e of wins.values()) if (!e.win.isDestroyed()) e.win.destroy();
      wins.clear();
      return sync(state);
    },

    // Manual drag: child windows of the desktop have no title bar to grab.
    drag(webContentsId, phase, sx, sy) {
      if (prefs().panelsLocked) return;
      const e = [...wins.values()].find((w) => !w.win.isDestroyed() && w.win.webContents.id === webContentsId);
      if (!e) return;
      if (phase === 'start') {
        e.drag = { sx, sy, x: e.x, y: e.y };
      } else if (phase === 'move' && e.drag) {
        let p = { x: e.drag.x + (sx - e.drag.sx), y: e.drag.y + (sy - e.drag.sy) };
        if (prefs().snap) p = snapPos(e, p.x, p.y);
        p = clamp(p, e);
        e.x = p.x;
        e.y = p.y;
        ws.place(e.win, e.x, e.y, e.w, e.h);
      } else if (phase === 'end' && e.drag) {
        e.drag = null;
        const s = getStore();
        (s.panels ||= {})[e.id] = { x: Math.round(e.x), y: Math.round(e.y) };
        save();
      }
    },
  };
}

module.exports = { createPanels, dimsOf, specsOf, DENS };
