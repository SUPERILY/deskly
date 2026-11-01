import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X, Play } from 'lucide-react';
import { api } from '../api.js';
import { CatIcon } from '../icons.jsx';
import Switch from './Switch.jsx';

const SWATCHES = ['#ff4d8d', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#8b5cf6', '#f472b6'];
const ICONS = ['Briefcase', 'Gamepad2', 'Palette', 'Code2', 'Clapperboard', 'Zap', 'Globe', 'Sparkles', 'BatteryLow'];

export default function ScenesPage({ state, setState, say }) {
  const scenes = state.scenes || [];
  const active = state.prefs.scene;
  const [edit, setEdit] = useState(null);

  const activate = async (id) => {
    setState(await api.applyScene(id));
    say(id ? `Scene “${scenes.find((s) => s.id === id)?.name}” is on` : 'Back to your normal desktop');
  };

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">Scenes</span></h1>
          <p>One click to reshape your desktop for what you are doing. Switch from here, the tray, Alt+Space, or Ctrl+Alt+1…9.</p>
        </div>
        <button className="btn-primary" onClick={() => setEdit({ name: '', icon: 'Sparkles', color: '#8b5cf6', show: [], launch: [] })}><Plus size={16} /> New scene</button>
      </section>

      {!state.prefs.desktopMode && (
        <div className="notice">
          <span>Scenes control which panels are on your desktop. Turn on Desktop panels (sidebar) to see them in action.</span>
        </div>
      )}

      <div className="scene-grid">
        <button className={'scene-card plain' + (!active ? ' active' : '')} onClick={() => activate(null)}>
          <span className="scene-icon" style={{ '--c': '#94a3b8' }}><X size={22} /></span>
          <strong>No scene</strong>
          <small>Your own panel setup</small>
          {!active && <span className="scene-on"><Check size={13} /> Active</span>}
        </button>
        {scenes.map((sc, i) => {
          const n = sc.show === 'all' ? 'All panels' : `${sc.show.length} panels`;
          return (
            <div className={'scene-card' + (active === sc.id ? ' active' : '')} key={sc.id} style={{ '--c': sc.color }}>
              <span className="scene-icon"><CatIcon name={sc.icon} size={24} /></span>
              <strong>{sc.name}</strong>
              <small>{n}{sc.launch && sc.launch.length ? ` · opens ${sc.launch.length} app${sc.launch.length > 1 ? 's' : ''}` : ''}</small>
              {i < 9 && <kbd>Ctrl Alt {i + 1}</kbd>}
              <div className="scene-actions">
                <button className="btn-small" onClick={() => activate(sc.id)}><Play size={13} fill="currentColor" /> {active === sc.id ? 'Re-apply' : 'Activate'}</button>
                <button className="icon-btn round sm" aria-label="Edit scene" onClick={() => setEdit({ ...sc, show: sc.show === 'all' ? 'all' : [...sc.show], launch: [...(sc.launch || [])] })}><Pencil size={14} /></button>
              </div>
              {active === sc.id && <span className="scene-on"><Check size={13} /> Active</span>}
            </div>
          );
        })}
      </div>

      {edit && <SceneEditor scene={edit} state={state} onClose={() => setEdit(null)} onSaved={(st) => { setState(st); setEdit(null); say('Scene saved'); }} onDeleted={(st) => { setState(st); setEdit(null); say('Scene deleted'); }} />}
    </div>
  );
}

function SceneEditor({ scene, state, onClose, onSaved, onDeleted }) {
  const [sc, setSc] = useState(scene);
  const [lib, setLib] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.getLibrary().then(setLib); }, []);
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const panelChoices = useMemo(() => {
    const counts = {};
    for (const i of state.items) counts[i.category] = (counts[i.category] || 0) + 1;
    return [
      { id: 'quick', name: 'Quick access', icon: 'Zap', color: '#fbbf24' },
      ...state.categories.filter((c) => counts[c.id]),
      ...(state.widgetDefs || []),
    ];
  }, [state]);

  const pool = useMemo(() => {
    const m = new Map();
    for (const i of state.items) m.set(i.key, { key: i.key, name: i.name, icon: i.icon });
    if (lib) for (const l of [...lib.apps, ...lib.games, ...lib.chrome, ...lib.projects]) if (!m.has(l.key)) m.set(l.key, { key: l.key, name: l.name, icon: l.icon });
    return m;
  }, [state.items, lib]);

  const all = sc.show === 'all';
  const togglePanel = (id) => setSc((s) => ({ ...s, show: s.show.includes(id) ? s.show.filter((x) => x !== id) : [...s.show, id] }));
  const needle = q.trim().toLowerCase();
  const matches = needle ? [...pool.values()].filter((p) => p.name.toLowerCase().includes(needle) && !sc.launch.includes(p.key)).slice(0, 8) : [];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal scene-editor" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Edit scene">
        <header className="modal-head">
          <span className="modal-badge" style={{ background: sc.color }}><CatIcon name={sc.icon} size={20} /></span>
          <div><h2>{scene.id ? 'Edit scene' : 'New scene'}</h2><p>Pick what shows on your desktop and what opens.</p></div>
          <button className="icon-btn close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="editor-body">
          <label className="field"><span>Name</span><input value={sc.name} maxLength={24} placeholder="Deep work" onChange={(e) => setSc({ ...sc, name: e.target.value })} autoFocus /></label>

          <div className="field">
            <span>Look</span>
            <div className="pick-row">
              {ICONS.map((n) => <button key={n} className={'pick' + (sc.icon === n ? ' on' : '')} onClick={() => setSc({ ...sc, icon: n })} aria-label={n}><CatIcon name={n} size={16} /></button>)}
              <i className="sep" />
              {SWATCHES.map((c) => <button key={c} className={'swatch' + (sc.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setSc({ ...sc, color: c })} aria-label={c} />)}
            </div>
          </div>

          <div className="field">
            <span>Panels on the desktop</span>
            <Switch on={all} onChange={(v) => setSc({ ...sc, show: v ? 'all' : panelChoices.map((p) => p.id) })} label="Show everything" hint="All your category panels, plus the widgets you turned on" />
            {!all && (
              <div className="chips-pick">
                {panelChoices.map((p) => (
                  <button key={p.id} className={'chip-pick' + (sc.show.includes(p.id) ? ' on' : '')} style={{ '--c': p.color }} onClick={() => togglePanel(p.id)}>
                    <CatIcon name={p.icon} size={14} /> {p.name}{sc.show.includes(p.id) && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <span>Open these when the scene starts <small>(optional, up to 12)</small></span>
            <div className="launch-list">
              {sc.launch.map((k) => (
                <span className="launch-chip" key={k}>
                  {pool.get(k)?.icon && <img src={pool.get(k).icon} alt="" />} {pool.get(k)?.name || k}
                  <button aria-label="Remove" onClick={() => setSc({ ...sc, launch: sc.launch.filter((x) => x !== k) })}><X size={12} /></button>
                </span>
              ))}
            </div>
            <input value={q} placeholder="Search an app, game or project to add…" onChange={(e) => setQ(e.target.value)} />
            {matches.length > 0 && (
              <div className="launch-results">
                {matches.map((m) => (
                  <button key={m.key} onClick={() => { setSc({ ...sc, launch: [...sc.launch, m.key].slice(0, 12) }); setQ(''); }}>
                    {m.icon ? <img src={m.icon} alt="" /> : <span className="p-fallback sm">{m.name[0]}</span>} {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="modal-foot">
          {scene.id && <button className="btn-ghost danger left" onClick={async () => onDeleted(await api.deleteScene(scene.id))}><Trash2 size={14} /> Delete</button>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!sc.name.trim()} onClick={async () => onSaved(await api.saveScene(sc))}>Save scene</button>
        </footer>
      </div>
    </div>
  );
}
