import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pin, PinOff, Search, Code2, Terminal, FolderOpen, GitBranch, ExternalLink, Play, Wand2, SlidersHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../api.js';
import { fmtAgo } from '../lib/format.js';
import WorkspaceEditor from './WorkspaceEditor.jsx';

const needsAttention = (p) => p.dirty > 0 || p.ahead > 0 || p.behind > 0 || p.noUpstream;

const FILTERS = [
  ['all', 'Everything'],
  ['program', 'Programs'],
  ['store', 'Store apps'],
  ['game', 'Games'],
  ['chrome', 'Browsers'],
  ['project', 'Projects'],
];

function AppTile({ item, color, onOpen, onPin }) {
  return (
    <button className="app-tile" style={{ '--c': color }} onClick={() => onOpen(item)} title={item.name}>
      <span className={'app-pin' + (item.pinnedToPanel ? ' on' : '')} role="button" aria-label={item.pinnedToPanel ? 'Remove from panels' : 'Show in a desktop panel'}
        title={item.pinnedToPanel ? 'Shown in your desktop panels (click to remove)' : 'Add to a desktop panel'}
        onClick={(e) => { e.stopPropagation(); onPin(item); }}>
        {item.pinnedToPanel ? <PinOff size={14} /> : <Pin size={14} />}
      </span>
      <span className="app-icon">{item.icon ? <img src={item.icon} alt="" draggable={false} /> : <span className="icon-fallback">{item.name[0]}</span>}</span>
      <span className="app-name">{item.name}</span>
      <span className="app-src">{item.onDesktop ? 'On desktop' : item.source}</span>
    </button>
  );
}

export default function AppsPage({ state, setState, say }) {
  const [lib, setLib] = useState(null);
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((force = false) => {
    setBusy(true);
    return api.getLibrary(force).then(setLib).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    load();
    const off = api.onChanged?.(() => api.getLibrary().then(setLib));
    return () => off?.();
  }, [load]);

  const catById = useMemo(() => Object.fromEntries(state.categories.map((c) => [c.id, c])), [state.categories]);

  const launchables = useMemo(() => {
    if (!lib) return [];
    return [...lib.apps, ...lib.games, ...lib.chrome];
  }, [lib]);

  const counts = useMemo(() => {
    if (!lib) return {};
    return {
      all: launchables.length,
      program: lib.apps.filter((a) => a.source === 'Program').length,
      store: lib.apps.filter((a) => a.source === 'Store app').length,
      game: lib.games.length,
      chrome: lib.chrome.length,
      project: lib.projects.length,
    };
  }, [lib, launchables]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    let list = launchables;
    if (filter === 'program') list = lib.apps.filter((a) => a.source === 'Program');
    else if (filter === 'store') list = lib.apps.filter((a) => a.source === 'Store app');
    else if (filter === 'game') list = lib.games;
    else if (filter === 'chrome') list = lib.chrome;
    if (cat !== 'all') list = list.filter((i) => i.category === cat);
    if (needle) list = list.filter((i) => i.name.toLowerCase().includes(needle) || (i.source || '').toLowerCase().includes(needle));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [launchables, lib, filter, cat, needle]);

  const projects = useMemo(() => {
    if (!lib) return [];
    return lib.projects.filter((p) => !needle || p.name.toLowerCase().includes(needle));
  }, [lib, needle]);

  const [onlyAttn, setOnlyAttn] = useState(false);
  const [editing, setEditing] = useState(null);
  const attn = useMemo(() => (lib ? lib.projects.filter(needsAttention) : []), [lib]);
  const stats = useMemo(() => {
    const ps = lib ? lib.projects : [];
    return {
      dirty: ps.filter((p) => p.dirty > 0).length,
      ahead: ps.filter((p) => p.ahead > 0).length,
      behind: ps.filter((p) => p.behind > 0).length,
      noUp: ps.filter((p) => p.noUpstream).length,
    };
  }, [lib]);
  const shownProjects = onlyAttn ? projects.filter(needsAttention) : projects;

  const launch = async (p) => {
    const errs = await api.launchWorkspace(p.key);
    say(errs && errs.length ? errs[0] : `Launching ${p.name}`);
  };

  const open = (item) => api.launchKey(item.key);

  const pin = async (item) => {
    const on = !item.pinnedToPanel;
    setLib((l) => {
      const patch = (arr) => arr.map((x) => (x.key === item.key ? { ...x, pinnedToPanel: on } : x));
      return { ...l, apps: patch(l.apps), games: patch(l.games), chrome: patch(l.chrome) };
    });
    setState(await api.pinLib(item.key, on));
    const where = catById[item.category]?.name || 'a panel';
    say(on ? `${item.name} now shows in your ${where} panel` : `Removed ${item.name} from your panels`);
  };

  if (!lib) {
    return (
      <div className="page">
        <section className="hero"><div><h1><span className="grad">All apps</span></h1><p>Indexing everything installed on this PC…</p></div></section>
        <div className="skeleton-grid" style={{ paddingTop: 10 }}>{Array.from({ length: 18 }, (_, i) => <div key={i} className="skeleton" style={{ '--i': i }} />)}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">All apps</span></h1>
          <p>{counts.all} apps and games · {counts.project} projects · indexed {fmtAgo(lib.t)}</p>
        </div>
        <button className={'btn-ghost rescan' + (busy ? ' busy' : '')} onClick={() => load(true)}><RefreshCw size={14} /> Rescan</button>
      </section>

      <div className="apps-bar">
        <div className="seg wide" role="group">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}<em>{counts[id]}</em></button>
          ))}
        </div>
        <label className="search small">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" spellCheck={false} />
        </label>
        {filter !== 'project' && (
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {filter === 'project' ? (
        <div className="projects">
          <div className="attention">
            <div>
              <strong><b>{attn.length}</b> of {lib.projects.length} projects need attention</strong>
              <small>{stats.dirty} with uncommitted changes · {stats.ahead} with unpushed commits · {stats.behind} behind the remote · {stats.noUp} on a branch never pushed</small>
            </div>
            <button className={'btn-ghost' + (onlyAttn ? ' on' : '')} onClick={() => setOnlyAttn(!onlyAttn)}>{onlyAttn ? 'Show all' : 'Show only these'}</button>
          </div>
          {shownProjects.map((p) => (
            <section className="card project" key={p.key}>
              <div className="project-main">
                <h3>{p.name}</h3>
                <small>
                  <span className="chip">{p.type}</span>
                  {p.branch && <span className="chip"><GitBranch size={11} /> {p.branch}</span>}
                  {p.dirty > 0 && <span className="chip warn">{p.dirty} uncommitted</span>}
                  {p.ahead > 0 && <span className="chip warn"><ArrowUp size={11} /> {p.ahead} to push</span>}
                  {p.behind > 0 && <span className="chip info"><ArrowDown size={11} /> {p.behind} to pull</span>}
                  {p.noUpstream && <span className="chip dim">never pushed</span>}
                  <span>last activity {fmtAgo(p.last)}</span>
                </small>
                <code>{p.path}</code>
              </div>
              <div className="project-actions">
                {p.workspace
                  ? <button className="btn-small launch" onClick={() => launch(p)}><Play size={13} fill="currentColor" /> Launch</button>
                  : <button className="btn-ghost" onClick={() => setEditing(p)}><Wand2 size={14} /> Set up workspace</button>}
                {p.workspace && <button className="icon-btn round sm" aria-label="Edit workspace" title="Edit workspace" onClick={() => setEditing(p)}><SlidersHorizontal size={14} /></button>}
                <button className="btn-ghost" onClick={() => api.projectAction(p.key, 'code')}><Code2 size={14} /> VS Code</button>
                <button className="btn-ghost" onClick={() => api.projectAction(p.key, 'terminal')}><Terminal size={14} /> Terminal</button>
                <button className="btn-ghost" onClick={() => api.projectAction(p.key, 'folder')}><FolderOpen size={14} /> Folder</button>
                {p.remote && <button className="btn-ghost" onClick={() => api.projectAction(p.key, 'remote')}><ExternalLink size={14} /> Repo</button>}
              </div>
            </section>
          ))}
          {!shownProjects.length && <p className="fine">No projects match.</p>}
          <p className="fine">“To push” and “to pull” are measured against the last time your repository fetched, so they are exact for what Git already knows.</p>
        </div>
      ) : (
        <>
          <div className="app-grid">
            {shown.map((it) => (
              <AppTile key={it.key} item={it} color={catById[it.category]?.color || '#8b5cf6'} onOpen={open} onPin={pin} />
            ))}
          </div>
          {!shown.length && <p className="fine">Nothing matches that filter.</p>}
          <p className="fine">Click an app to launch it. The pin adds it to a desktop panel (it joins the category Deskly sorted it into).</p>
        </>
      )}

      {editing && (
        <WorkspaceEditor
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); say('Workspace saved'); }}
        />
      )}
    </div>
  );
}
