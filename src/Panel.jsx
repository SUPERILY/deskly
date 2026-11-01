import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp, FolderOpen, ShieldCheck, Power, Eye, Search, Palette, RotateCcw } from 'lucide-react';
import { api } from './api.js';
import { CatIcon } from './icons.jsx';
import { SysWidget, DevWidget, ProjectsWidget, RecentWidget, ClockWidget, CaptureWidget } from './widgets/Widgets.jsx';

const WIDGET_PAGE = { w_sys: 'performance', w_dev: 'performance', w_projects: 'apps', w_recent: 'apps', w_clock: 'scenes', w_capture: 'filetools' };
const SWATCHES = ['#ff4d8d', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#8b5cf6', '#f472b6'];

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// Must match DENS in electron/panels.cjs: keeps each window and its card the same size.
const DENS = {
  comfortable: { hubCols: 4, cols: (n) => (n <= 2 ? 2 : n <= 6 ? 3 : 4) },
  compact: { hubCols: 5, cols: (n) => (n <= 3 ? 3 : n <= 8 ? 4 : 5) },
  mini: { hubCols: 8, cols: (n) => (n <= 4 ? 4 : n <= 12 ? 6 : 8) },
};

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function Icon({ item }) {
  if (item.icon) return <img src={item.icon} alt="" draggable={false} />;
  const l = (item.name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase();
  return <span className="p-fallback">{l}</span>;
}

export default function Panel({ catId }) {
  const [state, setState] = useState(null);
  const [running, setRunning] = useState(new Set());
  const [launching, setLaunching] = useState(null);
  const [tab, setTab] = useState(() => lsGet('deskly.hubTab'));
  const [lib, setLib] = useState(null);
  const [q, setQ] = useState('');
  const [customizing, setCustomizing] = useState(false);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const raf = useRef(0);

  const refresh = useCallback(async () => {
    const s = await api.scan();
    setState(s);
    setRunning(new Set(s.running || []));
  }, []);

  useEffect(() => {
    refresh();
    const offChanged = api.onChanged?.(refresh);
    const offRunning = api.onRunning?.((keys) => setRunning(new Set(keys)));
    return () => { offChanged?.(); offRunning?.(); };
  }, [refresh]);

  const isHub = catId === 'hub';

  useEffect(() => {
    if (isHub || catId === 'quick') {
      api.getLibrary?.().then(setLib);
    }
  }, [isHub, catId]);

  const tabIds = useMemo(() => {
    const list = (state && state.hubTabs) ? [...state.hubTabs] : [];
    if (!list.includes('all')) list.push('all');
    return list;
  }, [state]);

  const activeTab = isHub ? (tabIds.includes(tab) ? tab : tabIds[0]) : null;
  const contentId = isHub ? activeTab : catId; // the category (or "quick" or "all") whose tiles are shown

  const isQuick = contentId === 'quick';
  const isAll = contentId === 'all';
  const allBase = useMemo(() => ({ id: 'all', name: 'All Apps', icon: 'LayoutGrid', color: '#8b5cf6' }), []);

  const wd = state && !isHub && (state.widgetDefs || []).find((w) => w.id === catId);
  const base = state
    ? wd || (isAll ? allBase : isQuick ? state.quick : state.categories.find((c) => c.id === contentId))
    : null;
  const pp = (state && state.panelPrefs && state.panelPrefs[catId]) || {};
  const cp = (state && state.panelPrefs && state.panelPrefs[contentId]) || {}; // look of the shown category

  const items = useMemo(() => {
    if (!state || !base || wd) return [];
    if (isAll) {
      const apps = lib ? lib.apps : [];
      let list = apps.map((a) => ({ key: a.key, name: a.name, icon: a.icon, path: a.path, lib: true, category: a.category })).sort(byName);
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        list = list.filter((i) => i.name.toLowerCase().includes(needle));
      }
      return list;
    }
    if (isQuick) {
      const byKey = new Map(state.items.map((i) => [i.key, i]));
      let list = state.quick.keys.map((k) => byKey.get(k)).filter(Boolean);
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        list = list.filter((i) => i.name.toLowerCase().includes(needle));
      }
      return list;
    }
    let list = state.items.filter((i) => i.category === contentId).sort(byName);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(needle));
    }
    return list;
  }, [state, base, isAll, isQuick, wd, contentId, lib, q]);

  if (!state || !base) return null;

  const prefs = state.prefs || {};
  const color = (isHub ? cp.color : pp.color) || base.color;
  const name = (isHub ? cp.name : pp.name) || base.name;
  const view = !isHub && pp.view === 'list' ? 'list' : 'grid';
  const density = DENS[pp.density || prefs.density] ? pp.density || prefs.density : 'compact';
  const D = DENS[density];
  const cols = isHub ? D.hubCols : D.cols(items.length);
  // folded by you, or automatically because everything would not otherwise fit on screen
  const autoFolded = (state.autoCollapsed || []).includes(catId);
  const collapsed = pp.collapsed === false ? false : !!pp.collapsed || autoFolded;
  const locked = !!prefs.panelsLocked;
  const showRunning = prefs.showRunning !== false;
  const op = Math.min(1, Math.max(0.3, prefs.panelOpacity ?? 0.9));

  const open = async (item) => {
    setLaunching(item.key);
    setTimeout(() => setLaunching(null), 600);
    await api.open(item.path, item.key);
  };

  const pickTab = (id) => {
    setTab(id);
    lsSet('deskly.hubTab', id);
    setQ('');
  };

  // `false` is stored on purpose: it tells the auto-fit "the user wants this one open".
  const toggleFold = async () => setState(await api.setPanelPrefs(catId, { collapsed: !collapsed }));

  const onDown = (e) => {
    if (locked || e.button !== 0 || e.target.closest('button, input')) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    api.panelDrag('start', e.screenX, e.screenY);
  };
  const onMove = (e) => {
    if (!dragging.current) return;
    const sx = e.screenX;
    const sy = e.screenY;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => api.panelDrag('move', sx, sy));
  };
  const onUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelAnimationFrame(raf.current);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    api.panelDrag('end', e.screenX, e.screenY);
  };

  // Resize grip handlers
  const onResizeDown = (e) => {
    if (locked || e.button !== 0) return;
    e.stopPropagation();
    resizing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    api.panelResize('start', e.screenX, e.screenY);
  };
  const onResizeMove = (e) => {
    if (!resizing.current) return;
    cancelAnimationFrame(raf.current);
    const sx = e.screenX;
    const sy = e.screenY;
    raf.current = requestAnimationFrame(() => api.panelResize('move', sx, sy));
  };
  const onResizeUp = (e) => {
    if (!resizing.current) return;
    resizing.current = false;
    cancelAnimationFrame(raf.current);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    api.panelResize('end', e.screenX, e.screenY);
  };

  const badges = (it) => {
    const isRunning = showRunning && running.has(it.key);
    return (
      <>
        {isRunning && <span className="p-run" title="Running right now" />}
        {it.isNew && <span className="p-new" title="New shortcut on your desktop" />}
      </>
    );
  };

  const tools = (it) => {
    const isRunning = showRunning && running.has(it.key);
    const real = !it.lib && it.kind !== 'special';
    const folder = it.isFolder;
    const stop = (fn) => (e) => { e.stopPropagation(); e.preventDefault(); fn(); };
    return (
      <span className="p-tools">
        {folder && <span className="p-tool" role="button" title="Peek inside" onClick={stop(() => api.peekFolder(it.kind === 'dir' ? it.path : it.target))}><Eye size={12} /></span>}
        {real && <span className="p-tool" role="button" title="Show in folder" onClick={stop(() => api.reveal(it.path))}><FolderOpen size={12} /></span>}
        {real && !folder && it.kind === 'shortcut' && <span className="p-tool" role="button" title="Run as administrator" onClick={stop(() => api.runAsAdmin(it.path))}><ShieldCheck size={12} /></span>}
        {isRunning && <span className="p-tool warn" role="button" title="Close this app" onClick={stop(() => api.closeApp(it.key))}><Power size={12} /></span>}
      </span>
    );
  };

  return (
    <div
      className={`p-win d-${density}` + (collapsed ? ' collapsed' : '')}
      style={{ '--c': color, '--cols': cols, '--op': op }}
    >
      <div className="p-card">
        <header
          className={'p-head' + (locked ? ' locked' : '')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={(e) => { if (!e.target.closest('button, input')) toggleFold(); }}
        >
          <span className="p-chip"><CatIcon name={base.icon} size={16} /></span>
          <span className="p-title">{name}</span>
          {!wd && <span className="p-count">{items.length}</span>}
          {wd && <span className="p-spacer" />}
          {!wd && (
            <button className={'p-btn' + (customizing ? ' on' : '')} title="Customize category color & view" onClick={() => setCustomizing(!customizing)}>
              <Palette size={14} />
            </button>
          )}
          <button className="p-btn" title={collapsed ? 'Expand' : 'Collapse'} aria-label={collapsed ? 'Expand' : 'Collapse'} onClick={toggleFold}>
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          <button className="p-btn" title="Open in Deskly" aria-label="Open in Deskly" onClick={() => api.openMain(wd ? WIDGET_PAGE[catId] : isQuick || isHub ? (isHub && !isQuick && !isAll ? contentId : 'all') : catId)}>
            <ArrowUpRight size={15} />
          </button>
        </header>

        {customizing && !collapsed && (
          <div className="p-cat-popup">
            <div className="p-cat-row">
              <span className="p-cat-label">Name</span>
              <input
                type="text"
                className="p-cat-input"
                defaultValue={name}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val && val !== name) setState(await api.setPanelPrefs(catId, { name: val }));
                }}
              />
            </div>
            <div className="p-cat-row">
              <span className="p-cat-label">Color</span>
              <div className="p-swatches">
                {SWATCHES.map((sw) => (
                  <button
                    key={sw}
                    className={'p-swatch' + (sw === color ? ' on' : '')}
                    style={{ '--sw': sw }}
                    onClick={async () => setState(await api.setPanelPrefs(catId, { color: sw }))}
                  />
                ))}
              </div>
            </div>
            <div className="p-cat-row">
              <span className="p-cat-label">View</span>
              <div className="p-view-toggle">
                <button
                  className={'p-seg-btn' + (view === 'grid' ? ' on' : '')}
                  onClick={async () => setState(await api.setPanelPrefs(catId, { view: 'grid' }))}
                >
                  Grid
                </button>
                <button
                  className={'p-seg-btn' + (view === 'list' ? ' on' : '')}
                  onClick={async () => setState(await api.setPanelPrefs(catId, { view: 'list' }))}
                >
                  List
                </button>
              </div>
            </div>
            {(pp.customW || pp.customH) && (
              <button
                className="p-reset-btn"
                onClick={async () => setState(await api.setPanelPrefs(catId, { customW: null, customH: null }))}
              >
                Reset size to default
              </button>
            )}
          </div>
        )}

        {!collapsed && isHub && (
          <nav className="hub-tabs" aria-label="Categories">
            {tabIds.map((id) => {
              const t = id === 'quick' ? state.quick : id === 'all' ? allBase : state.categories.find((c) => c.id === id);
              if (!t) return null;
              const tc = (state.panelPrefs && state.panelPrefs[id] && state.panelPrefs[id].color) || t.color;
              return (
                <button key={id} className={'hub-tab' + (id === activeTab ? ' on' : '')} style={{ '--tc': tc }} title={(state.panelPrefs?.[id]?.name) || t.name} onClick={() => pickTab(id)}>
                  <CatIcon name={t.icon} size={15} />
                </button>
              );
            })}
          </nav>
        )}

        {!collapsed && (
          <div className="p-body">
            {wd ? (
              <>
                {catId === 'w_sys' && <SysWidget onOpen={() => api.openMain('performance')} />}
                {catId === 'w_dev' && <DevWidget />}
                {catId === 'w_projects' && <ProjectsWidget />}
                {catId === 'w_recent' && <RecentWidget />}
                {catId === 'w_clock' && <ClockWidget />}
                {catId === 'w_capture' && <CaptureWidget />}
              </>
            ) : (
              <>
                {isAll && (
                  <div className="p-filter-bar">
                    <Search size={13} className="p-filter-ico" />
                    <input
                      type="text"
                      className="p-filter-input"
                      placeholder="Search all installed apps…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </div>
                )}
                {view === 'grid' ? (
                  <div className="p-grid">
                    {items.map((it, i) => (
                      <button
                        key={it.key}
                        className={'p-tile' + (launching === it.key ? ' launching' : '')}
                        style={{ '--i': Math.min(i, 20) }}
                        title={density === 'mini' ? it.name : it.target || it.url || it.name}
                        onClick={() => open(it)}
                      >
                        {tools(it)}
                        <span className="p-icon"><Icon item={it} />{badges(it)}</span>
                        {density !== 'mini' && <span className="p-name">{it.name}</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-list">
                    {items.map((it, i) => (
                      <button
                        key={it.key}
                        className={'p-row' + (launching === it.key ? ' launching' : '')}
                        style={{ '--i': Math.min(i, 20) }}
                        title={it.target || it.url || it.name}
                        onClick={() => open(it)}
                      >
                        <span className="p-icon sm"><Icon item={it} />{badges(it)}</span>
                        <span className="p-row-name">{it.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Bottom-right Corner Resize Grip */}
        <div
          className="p-resize-grip"
          title="Drag to resize panel"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        >
          <svg viewBox="0 0 10 10" width="10" height="10">
            <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="8" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
