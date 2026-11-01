import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw, Sparkles, Star, ArrowRight, Inbox, Zap } from 'lucide-react';
import { api } from './api.js';
import { CatIcon } from './icons.jsx';
import Sidebar from './components/Sidebar.jsx';
import Tile from './components/Tile.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import TidyModal from './components/TidyModal.jsx';
import PanelsSettings from './components/PanelsSettings.jsx';
import RulesEditor from './components/RulesEditor.jsx';
import PerformancePage from './components/PerformancePage.jsx';
import AppsPage from './components/AppsPage.jsx';
import ScenesPage from './components/ScenesPage.jsx';
import AutomationPage from './components/AutomationPage.jsx';
import FilesPage from './components/FilesPage.jsx';
import Welcome from './components/Welcome.jsx';

const SIZES = {
  s: { tile: '120px', icon: '48px' },
  m: { tile: '148px', icon: '64px' },
  l: { tile: '180px', icon: '84px' },
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export default function App() {
  const [state, setState] = useState(null);
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(null);
  const [tidyOpen, setTidyOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [launching, setLaunching] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(new Set());
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  const say = useCallback((message, action) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 8000 : 3200);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = await api.scan();
      setState(s);
      setRunning(new Set(s.running || []));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const offChanged = api.onChanged?.(refresh);
    // A desktop panel asked to open its category in this window.
    const offNav = api.onNavigate?.((id) => { setActive(id); setQuery(''); });
    const offRunning = api.onRunning?.((keys) => setRunning(new Set(keys)));
    return () => { offChanged?.(); offNav?.(); offRunning?.(); };
  }, [refresh]);

  // Keyboard: Ctrl+K or just start typing to search; Esc clears.
  useEffect(() => {
    const h = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape') {
        setMenu(null);
        if (query) setQuery('');
        searchRef.current?.blur();
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !tidyOpen) {
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [query, tidyOpen]);

  const cats = state?.categories || [];
  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const items = state?.items || [];

  const counts = useMemo(() => {
    const m = {};
    for (const it of items) m[it.category] = (m[it.category] || 0) + 1;
    return m;
  }, [items]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const favs = useMemo(() => items.filter((i) => i.pinned).sort(byName), [items]);
  const looseCount = useMemo(() => items.filter((i) => i.movable && i.loose).length, [items]);

  const results = useMemo(() => {
    if (!searching) return [];
    return items
      .filter((i) => i.name.toLowerCase().includes(q) || (catById[i.category]?.name || '').toLowerCase().includes(q))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || byName(a, b));
  }, [items, q, searching, catById]);

  const sections = useMemo(() => {
    if (searching) return [];
    if (active === 'all') {
      return cats
        .map((c) => ({ cat: c, items: items.filter((i) => i.category === c.id).sort(byName) }))
        .filter((s) => s.items.length);
    }
    if (active === 'fav') return [];
    const c = catById[active];
    return c ? [{ cat: c, items: items.filter((i) => i.category === c.id).sort(byName) }] : [];
  }, [active, cats, items, catById, searching]);

  /* ---------- actions ---------- */
  const open = useCallback(async (item) => {
    setLaunching(item.key);
    setTimeout(() => setLaunching(null), 650);
    const err = await api.open(item.path, item.key);
    if (err) say(`Couldn't open ${item.name}`);
  }, [say]);

  const pin = async (item) => setState(await api.togglePin(item.key));
  const reveal = (item) => api.reveal(item.path);
  const hide = async (item) => {
    setState(await api.hide(item.key));
    say(`Hid ${item.name} from Deskly (the file is untouched)`);
  };
  const move = async (item, cat) => {
    setState(await api.setCategory(item.key, cat ? cat.id : null));
    say(cat ? `Moved ${item.name} to ${cat.name}` : `${item.name} is back on automatic`);
  };
  const dropKey = async (key, cat) => {
    const it = items.find((i) => i.key === key);
    if (!it || it.category === cat.id) return;
    setState(await api.setCategory(key, cat.id));
    say(`Moved ${it.name} to ${cat.name}`);
  };
  const addCategory = async (c) => {
    setState(await api.addCategory(c));
    say(`Created ${c.name}. Drag tiles onto it.`);
  };
  const deleteCategory = async (c) => {
    setState(await api.deleteCategory(c.id));
    if (active === c.id) setActive('all');
    say(`Deleted ${c.name}`);
  };

  const undoTidy = async () => {
    const r = await api.tidyUndo();
    setState(r.state);
    say(
      `Put ${r.restored} items back where they were` +
        (r.failed ? `. ${r.failed} need Deskly running as administrator.` : '')
    );
  };

  const tidyDone = (r) => {
    setTidyOpen(false);
    setState(r.state);
    const short = r.attempted - r.moved;
    say(
      `Tidied ${r.moved} items into folders` + (short > 0 ? ` (${short} could not be moved)` : ''),
      { label: 'Undo', run: undoTidy }
    );
  };

  const patchPrefs = (p) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));

  const toggleDesktop = async (on) => {
    const p = await api.setDesktopMode(on);
    patchPrefs(p);
    if (p.error) say(p.error);
    else if (on) say('Desktop panels are on. Closing this window keeps them running from the tray.');
    else say('Desktop panels are off. Your desktop icons are back.');
  };

  const toggleAutostart = async (on) => {
    const p = await api.setAutostart(on);
    patchPrefs(p);
    say(p.autostart ? 'Deskly will start with Windows' : 'Deskly will no longer start with Windows');
  };

  const setSize = async (size) => {
    setState((s) => ({ ...s, prefs: { ...s.prefs, size } }));
    api.setPrefs({ size });
  };

  const size = SIZES[state?.prefs?.size || 'm'];
  const activeCat = catById[active];
  const PAGE_ACCENT = { filetools: '#2dd4bf', automation: '#fb923c', rules: '#34d399', performance: '#38bdf8', scenes: '#f472b6', apps: '#8b5cf6', panels: '#8b5cf6' };
  const accent = active === 'fav' ? '#fbbf24' : PAGE_ACCENT[active] || activeCat?.color || '#8b5cf6';

  const quickItems = useMemo(() => {
    if (!state?.quick) return [];
    const byKey = new Map(items.map((i) => [i.key, i]));
    return state.quick.keys.map((k) => byKey.get(k)).filter(Boolean);
  }, [state, items]);

  // Settings pages replace the tile view (search still wins).
  const page = searching || !state ? null
    : active === 'panels' ? <PanelsSettings state={state} setState={setState} say={say} onToggleDesktop={toggleDesktop} />
    : active === 'rules' ? <RulesEditor state={state} setState={setState} say={say} />
    : active === 'performance' ? <PerformancePage state={state} say={say} />
    : active === 'apps' ? <AppsPage state={state} setState={setState} say={say} />
    : active === 'scenes' ? <ScenesPage state={state} setState={setState} say={say} />
    : active === 'automation' ? <AutomationPage state={state} setState={setState} say={say} />
    : active === 'filetools' ? <FilesPage say={say} />
    : null;

  const renderTile = (it, i, extra = {}) => (
    <Tile
      key={it.key}
      item={it}
      index={i}
      color={catById[it.category]?.color || '#8b5cf6'}
      launching={launching === it.key}
      running={state?.prefs?.showRunning !== false && running.has(it.key)}
      onOpen={open}
      onPin={pin}
      onMenu={(e, item) => setMenu({ x: e.clientX, y: e.clientY, item })}
      {...extra}
    />
  );

  return (
    <div className="app" style={{ '--tile': size.tile, '--icon': size.icon, '--accent': accent }}>
      <div className="bg" />

      <Sidebar
        categories={cats}
        counts={counts}
        active={active}
        onSelect={(id) => { setActive(id); setQuery(''); }}
        total={items.length}
        favCount={favs.length}
        onDropKey={dropKey}
        onAddCategory={addCategory}
        onDeleteCategory={deleteCategory}
        onTidy={() => setTidyOpen(true)}
        onUndo={undoTidy}
        canUndo={!!state?.canUndo}
        hiddenCount={state?.hiddenCount || 0}
        onUnhide={async () => { setState(await api.unhideAll()); say('Restored hidden items'); }}
        prefs={state?.prefs}
        panelsAvailable={!!state?.panelsAvailable}
        panelsBlocked={!!state?.panelsBlocked}
        canAutostart={!!state?.canAutostart}
        sceneName={state?.scene?.name}
        onToggleDesktop={toggleDesktop}
        onToggleAutostart={toggleAutostart}
        onResetPanels={async () => { await api.resetPanels(); say('Panels are back in their default layout'); }}
      />

      <main className="main">
        <header className="topbar drag">
          <label className="search nodrag">
            <Search size={17} />
            <input
              ref={searchRef}
              value={query}
              placeholder="Search apps, games, folders…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) open(results[0]);
              }}
              spellCheck={false}
            />
            {query ? <kbd onClick={() => setQuery('')}>Esc</kbd> : <kbd>Ctrl K</kbd>}
          </label>

          <div className="top-actions nodrag">
            <div className="seg" role="group" aria-label="Tile size">
              {['s', 'm', 'l'].map((k) => (
                <button key={k} className={state?.prefs?.size === k || (!state?.prefs?.size && k === 'm') ? 'on' : ''} onClick={() => setSize(k)}>
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
            <button className={'icon-btn round' + (refreshing ? ' spin' : '')} onClick={refresh} aria-label="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </header>

        <div className="scroll">
          {!state ? (
            <div className="skeleton-grid">
              {Array.from({ length: 18 }, (_, i) => <div key={i} className="skeleton" style={{ '--i': i }} />)}
            </div>
          ) : page ? (
            page
          ) : (
            <>
              {/* ---------- hero ---------- */}
              <section className="hero">
                {searching ? (
                  <>
                    <h1>{results.length} result{results.length === 1 ? '' : 's'}</h1>
                    <p>for “{query.trim()}”. Press Enter to open the first one.</p>
                  </>
                ) : active === 'all' ? (
                  <>
                    <h1><span className="grad">{greeting()}.</span></h1>
                    <p>{items.length} items across {Object.keys(counts).length} categories, all in one place.</p>
                  </>
                ) : active === 'fav' ? (
                  <>
                    <h1><span className="grad">Favorites</span></h1>
                    <p>Your pinned shortcuts. Click the star on any tile to add more.</p>
                  </>
                ) : (
                  <>
                    <div className="hero-chip" style={{ '--c': accent }}>
                      <CatIcon name={activeCat?.icon} size={26} />
                    </div>
                    <div>
                      <h1><span className="grad">{activeCat?.name}</span></h1>
                      <p>{activeCat?.blurb} · {counts[active] || 0} item{counts[active] === 1 ? '' : 's'}</p>
                    </div>
                  </>
                )}
              </section>

              {/* ---------- tidy banner ---------- */}
              {active === 'all' && !searching && looseCount > 0 && (
                <button className="banner" onClick={() => setTidyOpen(true)}>
                  <span className="banner-icon"><Sparkles size={20} /></span>
                  <span className="banner-text">
                    <strong>{looseCount} loose shortcuts are cluttering your desktop</strong>
                    <small>Preview a one-click tidy into neat folders. Fully undoable.</small>
                  </span>
                  <span className="banner-cta">Preview tidy <ArrowRight size={16} /></span>
                </button>
              )}

              {/* ---------- favorites row in Everything ---------- */}
              {active === 'all' && !searching && favs.length > 0 && (
                <section className="section">
                  <h2 className="section-title" style={{ '--c': '#fbbf24' }}>
                    <span className="sec-chip"><Star size={14} fill="currentColor" /></span> Favorites
                    <em>{favs.length}</em>
                  </h2>
                  <div className="grid">{favs.map((it, i) => renderTile(it, i))}</div>
                </section>
              )}

              {/* ---------- most used ---------- */}
              {active === 'all' && !searching && quickItems.length > 0 && (
                <section className="section">
                  <h2 className="section-title" style={{ '--c': '#fbbf24' }}>
                    <span className="sec-chip"><Zap size={14} /></span> Most used
                    <em>{quickItems.length}</em>
                  </h2>
                  <div className="grid">{quickItems.map((it, i) => renderTile(it, i, { showCat: true, catName: catById[it.category]?.name }))}</div>
                </section>
              )}

              {/* ---------- results ---------- */}
              {searching && (
                results.length ? (
                  <div className="grid">
                    {results.map((it, i) => renderTile(it, i, { showCat: true, catName: catById[it.category]?.name }))}
                  </div>
                ) : (
                  <Empty title="Nothing matches" text="Try another name, or check the category on the left." />
                )
              )}

              {/* ---------- favorites view ---------- */}
              {!searching && active === 'fav' && (
                favs.length ? (
                  <div className="grid">{favs.map((it, i) => renderTile(it, i, { showCat: true, catName: catById[it.category]?.name }))}</div>
                ) : (
                  <Empty title="No favorites yet" text="Hover a tile and click its star to pin it here." />
                )
              )}

              {/* ---------- categories ---------- */}
              {!searching && active !== 'fav' && sections.map(({ cat, items: list }) => (
                <section className="section" key={cat.id}>
                  {active === 'all' && (
                    <h2 className="section-title" style={{ '--c': cat.color }} onClick={() => setActive(cat.id)}>
                      <span className="sec-chip"><CatIcon name={cat.icon} size={14} /></span> {cat.name}
                      <em>{list.length}</em>
                    </h2>
                  )}
                  <div className="grid">{list.map((it, i) => renderTile(it, i))}</div>
                </section>
              ))}

              {!searching && active !== 'all' && active !== 'fav' && !(counts[active] > 0) && (
                <Empty
                  title={`${activeCat?.name || 'This category'} is empty`}
                  text="Drag a tile onto this category in the sidebar, or use right-click → Move to."
                />
              )}
            </>
          )}
        </div>
      </main>

      {menu && (
        <ContextMenu
          menu={menu}
          categories={cats}
          onClose={() => setMenu(null)}
          onOpen={open}
          onReveal={reveal}
          onPin={pin}
          onHide={hide}
          onMove={move}
        />
      )}

      {tidyOpen && <TidyModal categories={cats} onClose={() => setTidyOpen(false)} onDone={tidyDone} />}
      {state && state.prefs.onboarded === false && (
        <Welcome state={state} patchPrefs={patchPrefs} onToggleDesktop={toggleDesktop} onToggleAutostart={toggleAutostart} />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ title, text }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Inbox size={28} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
