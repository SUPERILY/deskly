// Tiny JSON store in the app's userData folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  overrides: {},        // item key -> category id (manual choice)
  pins: [],             // item keys
  hidden: [],           // item keys hidden from Deskly (files untouched)
  customCategories: [], // { id, name, color, icon }
  managedDirs: [],      // { path, cat } folders created by Tidy
  tidyHistory: [],      // { id, ts, moves: [{from,to}], dirs: [path] }
  fileHistory: [],      // Downloads / screenshots batches: { id, ts, label, moves: [{from,to}], dirs: [path] }
  prefs: {
    size: 'm',
    desktopMode: false,
    autostart: false,
    panelOpacity: 0.9,   // 0.3 - 1
    panelsLocked: false, // lock layout: panels cannot be dragged
    snap: true,          // snap panels to each other and the screen edges while dragging
    showQuick: true,     // "Quick access" panel (most used)
    showRunning: true,   // green dot on apps that are running
    autoSort: false,     // move brand-new shortcuts into category folders
    background: true,    // closing the window keeps Deskly running in the tray (hotkey, panels)
    scene: null,         // active scene id, or null for "no scene"
    widgets: { w_sys: true, w_dev: true, w_projects: false, w_recent: false, w_clock: false },
    searchHotkey: 'Alt+Space',
    smartQuick: true,         // Quick access also learns what you use at this time of day
    alerts: { ram: true, disk: true, servers: true, leftovers: true, weekly: true },
    density: 'compact',      // 'comfortable' | 'compact' | 'mini' (tile size on the desktop)
    layoutMode: 'hub',        // 'hub' (one tabbed card) | 'classic' (a panel per category)
    layout: 'left',           // hub placement: 'left' | 'right' | 'center'
    dock: 'float',            // 'float' (above your windows) | 'off'
    dockAutoHide: false,
    weatherCity: '',     // optional: a city name for the clock widget (looked up on open-meteo.com)
  },
  scenes: null,          // seeded on first run (Work / Gaming / Content / Everything)
  automation: { rules: [], log: [] }, // auto-scene rules { id, when:{kind,...}, scene, restore, enabled } and an activity log
  alertLog: {},          // alert key -> last time it was shown (cool-downs)
  workspaces: {},        // project key -> { editor, terminal, urls[], start } (what "Launch workspace" does)
  libPins: [],           // library item keys (apps, games...) pinned into the category panels
  projectRoots: [],      // extra folders to look for git projects in
  weather: null,         // last weather reading { city, temp, code, isDay, t }
  rules: [],             // user sorting rules, evaluated before the built-in ones
  panelPrefs: {},        // category id -> { name, color, view: 'grid'|'list', collapsed }
  usage: {},             // item key -> { n, t } launch count and last launch time
  seen: null,            // item key -> first-seen timestamp (0 = was there on first run)
  panels: {},           // category id -> { x, y } (DIPs) after the user drags a desktop panel
  iconsHiddenByUs: false, // we hid Explorer's desktop icons and must restore them
};

let cache = null;
let fresh = false; // true when this launch found no settings file: a brand-new install
const file = () => path.join(app.getPath('userData'), 'deskly-store.json');

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = { ...DEFAULTS, ...raw, prefs: { ...DEFAULTS.prefs, ...(raw.prefs || {}) } };
  } catch (e) {
    fresh = !!e && e.code === 'ENOENT';
    cache = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return cache;
}

// Swap in a whole saved setup (used to undo an import).
function replace(obj) {
  cache = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...obj, prefs: { ...DEFAULTS.prefs, ...((obj && obj.prefs) || {}) } };
  save();
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('store save failed', e);
  }
}

module.exports = { load, save, replace, isFresh: () => fresh };
