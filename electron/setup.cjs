// Export / import your Deskly setup as one JSON file, so a new PC (or a fresh install) can look like this one.
//
// An imported file is untrusted input: every section is rebuilt from an allow-list with type, length and
// count limits, nothing is executed, and the current setup is backed up first. Project workspaces carry
// start commands that Deskly runs when you click Launch, so they are a separate opt-in section.
const { sanitizeWhen } = require('./automation.cjs');

const FORMAT = 1;
const MAX_BYTES = 2 * 1024 * 1024;

const SECTIONS = [
  { id: 'look', label: 'Layout and look', hint: 'Panel style, tile size, transparency, dock, widgets, shortcut, panel names and colours' },
  { id: 'organise', label: 'Categories and rules', hint: 'Your own categories, sorting rules and manual category choices' },
  { id: 'favorites', label: 'Favorites and hidden items', hint: 'Pinned items and anything you hid from Deskly' },
  { id: 'scenes', label: 'Scenes', hint: 'Work, Gaming, your own scenes and which panels each shows' },
  { id: 'automation', label: 'Automation', hint: 'Auto-scene rules and which quiet alerts are on' },
  { id: 'workspaces', label: 'Project workspaces', hint: 'What Launch does per project, including the start command', risky: true },
];

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[\w\-.:]{1,60}$/;
const WIDGET_IDS = ['w_sys', 'w_dev', 'w_projects', 'w_recent', 'w_clock'];
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const bool = (v) => v === true || v === false;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const keyOk = (k) => typeof k === 'string' && k.length > 0 && k.length <= 260;

/* ---------- sanitizers: each returns clean data, never the input object ---------- */
function cleanPrefs(p) {
  const out = {};
  if (!isObj(p)) return out;
  const pickEnum = (k, list) => { if (list.includes(p[k])) out[k] = p[k]; };
  pickEnum('size', ['s', 'm', 'l']);
  pickEnum('density', ['comfortable', 'compact', 'mini']);
  pickEnum('layoutMode', ['hub', 'classic']);
  pickEnum('layout', ['left', 'right', 'center']);
  pickEnum('dock', ['float', 'off']);
  if (num(p.panelOpacity, 0.3, 1)) out.panelOpacity = p.panelOpacity;
  for (const k of ['panelsLocked', 'snap', 'showQuick', 'showRunning', 'autoSort', 'background', 'smartQuick', 'dockAutoHide']) if (bool(p[k])) out[k] = p[k];
  if (isObj(p.widgets)) {
    out.widgets = {};
    for (const id of WIDGET_IDS) if (bool(p.widgets[id])) out.widgets[id] = p.widgets[id];
  }
  if (typeof p.searchHotkey === 'string' && /^[A-Za-z0-9+]{1,40}$/.test(p.searchHotkey)) out.searchHotkey = p.searchHotkey;
  if (typeof p.weatherCity === 'string') out.weatherCity = str(p.weatherCity, 60).trim();
  return out;
}

function cleanPanelPrefs(pp) {
  const out = {};
  if (!isObj(pp)) return out;
  for (const [id, v] of Object.entries(pp).slice(0, 80)) {
    if (!ID.test(id) || !isObj(v)) continue;
    const c = {};
    if (typeof v.name === 'string' && v.name.trim()) c.name = str(v.name, 40).trim();
    if (typeof v.color === 'string' && HEX.test(v.color)) c.color = v.color;
    if (['grid', 'list'].includes(v.view)) c.view = v.view;
    if (['comfortable', 'compact', 'mini'].includes(v.density)) c.density = v.density;
    if (bool(v.collapsed)) c.collapsed = v.collapsed;
    if (Object.keys(c).length) out[id] = c;
  }
  return out;
}

function cleanCategories(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list.slice(0, 40)) {
    if (!isObj(c) || !ID.test(String(c.id || '')) || seen.has(c.id) || typeof c.name !== 'string' || !c.name.trim()) continue;
    seen.add(c.id);
    out.push({ id: c.id, name: str(c.name, 24).trim(), color: HEX.test(c.color) ? c.color : '#8b5cf6', icon: /^[A-Za-z0-9]{1,30}$/.test(String(c.icon || '')) ? c.icon : 'Tag' });
  }
  return out;
}

function cleanRules(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list.slice(0, 200)) {
    if (!isObj(r) || typeof r.value !== 'string' || !r.value.trim() || typeof r.cat !== 'string' || !ID.test(r.cat)) continue;
    if (!['name', 'path', 'ext'].includes(r.field) || !['contains', 'startsWith', 'equals', 'regex'].includes(r.op)) continue;
    const value = str(r.value, 120).trim();
    if (r.op === 'regex') {
      try { new RegExp(value); } catch { continue; }
    }
    out.push({ id: ID.test(String(r.id || '')) ? r.id : 'r_' + Math.random().toString(36).slice(2, 8), field: r.field, op: r.op, value, cat: r.cat, enabled: r.enabled !== false });
  }
  return out;
}

function cleanKeyMap(m) {
  const out = {};
  if (!isObj(m)) return out;
  for (const [k, v] of Object.entries(m).slice(0, 2000)) if (keyOk(k) && typeof v === 'string' && ID.test(v)) out[k] = v;
  return out;
}

function cleanKeyList(l) {
  return Array.isArray(l) ? [...new Set(l.filter(keyOk))].slice(0, 2000) : [];
}

function cleanScenes(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const s of list.slice(0, 30)) {
    if (!isObj(s) || !ID.test(String(s.id || '')) || seen.has(s.id) || typeof s.name !== 'string' || !s.name.trim()) continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      name: str(s.name, 24).trim(),
      icon: /^[A-Za-z0-9]{1,30}$/.test(String(s.icon || '')) ? s.icon : 'Sparkles',
      color: HEX.test(s.color) ? s.color : '#8b5cf6',
      show: s.show === 'all' ? 'all' : (Array.isArray(s.show) ? s.show.filter((x) => typeof x === 'string' && ID.test(x)).slice(0, 60) : []),
      launch: (Array.isArray(s.launch) ? s.launch.filter(keyOk) : []).slice(0, 12),
    });
  }
  return out;
}

function cleanAutomation(a, sceneIds) {
  const rules = [];
  for (const r of (isObj(a) && Array.isArray(a.rules) ? a.rules : []).slice(0, 60)) {
    if (!isObj(r) || !sceneIds.has(r.scene)) continue;
    const when = sanitizeWhen(r.when);
    if (!when) continue;
    rules.push({ id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), when, scene: r.scene, restore: r.restore !== false, enabled: r.enabled !== false });
  }
  const alerts = {};
  if (isObj(a) && isObj(a.alerts)) for (const k of ['ram', 'disk', 'servers', 'leftovers', 'weekly']) if (bool(a.alerts[k])) alerts[k] = a.alerts[k];
  return { rules, alerts };
}

function cleanWorkspaces(w) {
  const out = {};
  if (!isObj(w)) return out;
  for (const [key, v] of Object.entries(w).slice(0, 300)) {
    if (!keyOk(key) || !isObj(v)) continue;
    const clean = {
      editor: v.editor !== false,
      terminal: !!v.terminal,
      urls: (Array.isArray(v.urls) ? v.urls : []).map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8),
      start: String(v.start || '').trim().slice(0, 240),
    };
    if (clean.terminal || !clean.editor || clean.urls.length || clean.start) out[key] = clean;
  }
  return out;
}

/* ---------- export ---------- */
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const LOOK_KEYS = ['size', 'density', 'layoutMode', 'layout', 'dock', 'panelOpacity', 'panelsLocked', 'snap', 'showQuick', 'showRunning', 'autoSort', 'background', 'smartQuick', 'dockAutoHide', 'widgets', 'searchHotkey', 'weatherCity'];

function build(store, sectionIds, version) {
  const want = new Set(sectionIds);
  const sections = {};
  if (want.has('look')) sections.look = { prefs: pick(store.prefs || {}, LOOK_KEYS), panelPrefs: store.panelPrefs || {} };
  if (want.has('organise')) sections.organise = { customCategories: store.customCategories || [], rules: store.rules || [], overrides: store.overrides || {} };
  if (want.has('favorites')) sections.favorites = { pins: store.pins || [], hidden: store.hidden || [], libPins: store.libPins || [] };
  if (want.has('scenes')) sections.scenes = store.scenes || [];
  if (want.has('automation')) sections.automation = { rules: (store.automation && store.automation.rules) || [], alerts: (store.prefs && store.prefs.alerts) || {} };
  if (want.has('workspaces')) sections.workspaces = store.workspaces || {};
  return { app: 'Deskly', format: FORMAT, version, exportedAt: new Date().toISOString(), sections };
}

/* ---------- reading a file ---------- */
// Returns { ok, doc, summary } or { ok:false, error }. `doc.sections` is already sanitized.
function parse(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) return { ok: false, error: 'That file is too big to be a Deskly setup.' };
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isObj(j) || j.app !== 'Deskly' || !isObj(j.sections)) return { ok: false, error: 'That is not a Deskly setup file.' };
  if (!Number.isInteger(j.format) || j.format > FORMAT) return { ok: false, error: 'That setup was made by a newer Deskly. Update Deskly first.' };

  const s = j.sections;
  const doc = { sections: {} };
  const counts = {};
  if (isObj(s.look)) {
    doc.sections.look = { prefs: cleanPrefs(s.look.prefs), panelPrefs: cleanPanelPrefs(s.look.panelPrefs) };
    counts.look = Object.keys(doc.sections.look.prefs).length + Object.keys(doc.sections.look.panelPrefs).length;
  }
  if (isObj(s.organise)) {
    doc.sections.organise = { customCategories: cleanCategories(s.organise.customCategories), rules: cleanRules(s.organise.rules), overrides: cleanKeyMap(s.organise.overrides) };
    const o = doc.sections.organise;
    counts.organise = o.customCategories.length + o.rules.length + Object.keys(o.overrides).length;
  }
  if (isObj(s.favorites)) {
    doc.sections.favorites = { pins: cleanKeyList(s.favorites.pins), hidden: cleanKeyList(s.favorites.hidden), libPins: cleanKeyList(s.favorites.libPins) };
    counts.favorites = doc.sections.favorites.pins.length + doc.sections.favorites.hidden.length + doc.sections.favorites.libPins.length;
  }
  if (Array.isArray(s.scenes)) {
    doc.sections.scenes = cleanScenes(s.scenes);
    counts.scenes = doc.sections.scenes.length;
  }
  if (isObj(s.automation)) {
    // rules need scenes: the scenes in the file if it has them, otherwise the ones already on this PC (checked on apply)
    doc.sections.automation = { raw: s.automation };
    counts.automation = Array.isArray(s.automation.rules) ? Math.min(s.automation.rules.length, 60) : 0;
  }
  if (isObj(s.workspaces)) {
    doc.sections.workspaces = cleanWorkspaces(s.workspaces);
    counts.workspaces = Object.keys(doc.sections.workspaces).length;
  }

  const summary = {
    exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt.slice(0, 40) : '',
    version: str(j.version, 20),
    sections: SECTIONS.filter((x) => doc.sections[x.id]).map((x) => ({ ...x, count: counts[x.id] || 0 })),
  };
  return { ok: true, doc, summary };
}

/* ---------- applying ---------- */
// Replaces the chosen sections of `store` with the (already sanitized) ones in `doc`. Anything not chosen is untouched.
function apply(store, doc, sectionIds) {
  const want = new Set(sectionIds);
  const done = [];
  const d = doc.sections;
  if (want.has('look') && d.look) {
    store.prefs = { ...store.prefs, ...d.look.prefs, widgets: { ...(store.prefs.widgets || {}), ...(d.look.prefs.widgets || {}) } };
    store.panelPrefs = d.look.panelPrefs;
    delete store.panels; // dragged positions belong to the old screen
    done.push('look');
  }
  if (want.has('organise') && d.organise) {
    store.customCategories = d.organise.customCategories;
    store.rules = d.organise.rules;
    store.overrides = d.organise.overrides;
    done.push('organise');
  }
  if (want.has('favorites') && d.favorites) {
    store.pins = d.favorites.pins;
    store.hidden = d.favorites.hidden;
    store.libPins = d.favorites.libPins;
    done.push('favorites');
  }
  if (want.has('scenes') && d.scenes) {
    store.scenes = d.scenes.length ? d.scenes : store.scenes;
    if (store.prefs.scene && !(store.scenes || []).some((x) => x.id === store.prefs.scene)) store.prefs.scene = null;
    store.prefs.lightSceneAdded = true;
    done.push('scenes');
  }
  if (want.has('automation') && d.automation) {
    const ids = new Set((store.scenes || []).map((x) => x.id));
    const a = cleanAutomation(d.automation.raw, ids);
    store.automation = { rules: a.rules, log: [] };
    store.prefs.alerts = { ...(store.prefs.alerts || {}), ...a.alerts };
    done.push('automation');
  }
  if (want.has('workspaces') && d.workspaces) {
    store.workspaces = d.workspaces;
    done.push('workspaces');
  }
  return done;
}

module.exports = { SECTIONS, FORMAT, MAX_BYTES, build, parse, apply };
