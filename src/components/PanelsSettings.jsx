import { useEffect, useState } from 'react';
import { RotateCcw, LayoutGrid, List, ChevronUp, ChevronDown, Magnet, Lock, Activity, Zap } from 'lucide-react';
import { api } from '../api.js';
import { CatIcon } from '../icons.jsx';
import Switch from './Switch.jsx';
import SetupCard from './SetupCard.jsx';
import UpdateCard from './UpdateCard.jsx';

const SWATCHES = ['#ff4d8d', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#8b5cf6', '#f472b6'];

export default function PanelsSettings({ state, setState, say, onToggleDesktop }) {
  const prefs = state.prefs;
  const pp = state.panelPrefs || {};
  const [op, setOp] = useState(prefs.panelOpacity ?? 0.9);
  const [colorFor, setColorFor] = useState(null);
  useEffect(() => setOp(prefs.panelOpacity ?? 0.9), [prefs.panelOpacity]);

  const setPref = async (patch) => {
    const p = await api.setPrefs(patch);
    setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));
  };
  const setPanel = async (id, patch) => setState(await api.setPanelPrefs(id, patch));

  const counts = {};
  for (const it of state.items) counts[it.category] = (counts[it.category] || 0) + 1;
  const rows = [
    ...(state.quick ? [{ ...state.quick, n: state.quick.keys.length }] : []),
    ...state.categories.filter((c) => counts[c.id]).map((c) => ({ ...c, n: counts[c.id] })),
  ];
  const sample = state.items.filter((i) => i.icon).slice(0, 4);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">Panels</span></h1>
          <p>Make the desktop panels yours: look, layout and behaviour.</p>
        </div>
      </section>

      <section className="card layout-card">
        <h2 className="card-title">Layout</h2>
        <div className="layout-opts">
          {[
            ['hub', 'Hub', 'One tabbed card for all your apps, plus widgets. The most compact.'],
            ['classic', 'Classic', 'A separate panel for every category.'],
          ].map(([id, title, desc]) => (
            <button key={id} className={'layout-opt' + ((prefs.layoutMode || 'hub') === id ? ' on' : '')} onClick={() => setPref({ layoutMode: id })}>
              <span className={'layout-art ' + id}><i /><i /><i /><i /></span>
              <strong>{title}</strong>
              <small>{desc}</small>
            </button>
          ))}
        </div>
        <div className="opt-row">
          <span>Tile size</span>
          <div className="seg wide" role="group" aria-label="Tile size">
            {[['comfortable', 'Comfortable'], ['compact', 'Compact'], ['mini', 'Mini']].map(([id, label]) => (
              <button key={id} className={(prefs.density || 'compact') === id ? 'on' : ''} onClick={() => setPref({ density: id })}>{label}</button>
            ))}
          </div>
        </div>
        {(prefs.layoutMode || 'hub') === 'hub' && (
          <div className="opt-row">
            <span>Hub position</span>
            <div className="seg wide" role="group" aria-label="Hub position">
              {[['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([id, label]) => (
                <button key={id} className={(prefs.layout || 'left') === id ? 'on' : ''} onClick={() => setPref({ layout: id })}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="switch-list">
          <Switch on={prefs.dock !== 'off'} onChange={(v) => setPref({ dock: v ? 'float' : 'off' })} label="Dock" hint="A floating bar above your windows with search, your top apps and shortcuts" />
          {prefs.dock !== 'off' && (
            <Switch on={!!prefs.dockAutoHide} onChange={(v) => setPref({ dockAutoHide: v })} label="Auto-hide the dock" hint="Slides away until the mouse touches the bottom of the screen" />
          )}
        </div>
        <p className="kbd-note">Hide or show all panels at any time with <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>H</kbd> or the eye button on the dock.</p>
      </section>

      {!prefs.desktopMode && (
        <div className="notice">
          <span>Desktop panels are off, so changes here show up once you turn them on.</span>
          <button className="btn-small" disabled={state.panelsBlocked} onClick={() => onToggleDesktop(true)}>Turn on</button>
        </div>
      )}

      <div className="split">
        <section className="card">
          <h2 className="card-title">Appearance</h2>

          <div className="preview" style={{ '--c': '#8b5cf6', '--op': op }}>
            <div className="pv-card">
              <div className="pv-head"><i /> <b>Preview</b></div>
              <div className="pv-icons">{sample.map((i) => <img key={i.key} src={i.icon} alt="" />)}</div>
            </div>
          </div>

          <label className="slider">
            <span><strong>Transparency</strong><small>{Math.round(op * 100)}% solid</small></span>
            <input
              type="range" min="0.3" max="1" step="0.05" value={op}
              onChange={(e) => setOp(parseFloat(e.target.value))}
              onPointerUp={() => setPref({ panelOpacity: op })}
              onKeyUp={() => setPref({ panelOpacity: op })}
            />
          </label>

          <div className="switch-list">
            <Switch on={prefs.snap} onChange={(v) => setPref({ snap: v })} label="Snap while dragging" hint="Panels snap to each other and to the screen edges" />
            <Switch on={prefs.panelsLocked} onChange={(v) => setPref({ panelsLocked: v })} label="Lock layout" hint="Stops panels being dragged by accident" />
            <Switch on={prefs.showQuick} onChange={(v) => setPref({ showQuick: v })} label="Quick access panel" hint="Your most launched apps, learned as you use them" />
            <Switch on={prefs.showRunning} onChange={(v) => setPref({ showRunning: v })} label="Running indicators" hint="Green dot on apps that are open right now" />
          </div>

          <button className="btn-ghost wide" onClick={async () => { await api.resetPanels(); say('Panels re-arranged'); }}>
            <RotateCcw size={15} /> Auto-arrange all panels
          </button>
        </section>

        <section className="card">
          <h2 className="card-title">Each panel</h2>
          <div className="panel-rows">
            {rows.map((r) => {
              const p = pp[r.id] || {};
              const color = p.color || r.color;
              return (
                <div className="prow" key={r.id} style={{ '--c': color }}>
                  <button className="prow-chip" title="Accent colour" onClick={() => setColorFor(colorFor === r.id ? null : r.id)}>
                    <CatIcon name={r.icon} size={16} />
                  </button>
                  <input
                    className="prow-name"
                    defaultValue={p.name || ''}
                    placeholder={r.name}
                    maxLength={24}
                    key={r.id + (p.name || '')}
                    onBlur={(e) => { if (e.target.value.trim() !== (p.name || '')) setPanel(r.id, { name: e.target.value.trim() || null }); }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <span className="prow-n">{r.n}</span>
                  <div className="seg" role="group" aria-label="View">
                    <button className={p.view !== 'list' ? 'on' : ''} title="Icons" onClick={() => setPanel(r.id, { view: null })}><LayoutGrid size={14} /></button>
                    <button className={p.view === 'list' ? 'on' : ''} title="List" onClick={() => setPanel(r.id, { view: 'list' })}><List size={14} /></button>
                  </div>
                  <button className="icon-btn round sm" title={p.collapsed ? 'Expand' : 'Collapse'} onClick={() => setPanel(r.id, { collapsed: p.collapsed ? null : true })}>
                    {p.collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                  </button>
                  {colorFor === r.id && (
                    <div className="prow-colors">
                      {SWATCHES.map((c) => (
                        <button key={c} className={'swatch' + (c === color ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => { setPanel(r.id, { color: c }); setColorFor(null); }} />
                      ))}
                      <button className="link-btn" onClick={() => { setPanel(r.id, { color: null }); setColorFor(null); }}>Reset</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="fine"><Magnet size={13} /> Tip: double-click a panel header on the desktop to fold it.</p>
        </section>
      </div>

      <div className="split">
        <section className="card">
          <h2 className="card-title">Widgets</h2>
          <div className="switch-list">
            {(state.widgetDefs || []).map((w) => (
              <Switch
                key={w.id}
                on={!!(prefs.widgets || {})[w.id]}
                onChange={(v) => setPref({ widgets: { ...(prefs.widgets || {}), [w.id]: v } })}
                label={w.name}
                hint={w.blurb}
              />
            ))}
          </div>
          {state.scene && state.scene.show !== 'all' && (
            <p className="fine">The “{state.scene.name}” scene is active, so it decides which widgets show. Switch to “No scene” to use these.</p>
          )}
          <div className="inline-field">
            <input
              defaultValue={prefs.weatherCity || ''}
              placeholder="City for the clock's weather (optional)"
              maxLength={60}
              aria-label="Weather city"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.nextSibling.click()}
            />
            <button className="btn-small" onClick={async (e) => { setState(await api.setWeatherCity(e.currentTarget.previousSibling.value)); say('Weather updated'); }}>Set</button>
          </div>
          <p className="fine">Weather comes from open-meteo.com and is only requested if you enter a city.{state.weather && state.weather.error ? ` (${state.weather.error})` : ''}</p>
        </section>

        <section className="card">
          <h2 className="card-title">General</h2>
          <div className="switch-list">
            <Switch on={prefs.background} onChange={(v) => setPref({ background: v })} label="Keep running in the tray" hint="Closing the window leaves search, scenes and panels running" />
          </div>
          <div className="field hk">
            <span>Search shortcut</span>
            <select
              value={prefs.searchHotkey || 'Alt+Space'}
              onChange={async (e) => { await setPref({ searchHotkey: e.target.value }); say('Search shortcut updated'); }}
              aria-label="Search shortcut"
            >
              {['Alt+Space', 'Control+Alt+Space', 'Control+Shift+Space', 'Alt+Shift+Space', 'Control+Alt+K', 'Control+Alt+D'].map((h) => (
                <option key={h} value={h}>{h.replace('Control', 'Ctrl')}</option>
              ))}
            </select>
          </div>
          <p className="kbd-note">
            {state.hotkey
              ? <>Search anywhere with <kbd>{state.hotkey.replace('Control', 'Ctrl')}</kbd>{state.hotkey !== (prefs.searchHotkey || 'Alt+Space') ? ' (your first choice is used by another app)' : ''}</>
              : 'No free shortcut was found for search. Pick another one above.'}
            {' · '}switch scenes with <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>…<kbd>9</kbd>
          </p>
          {(state.displays || []).length > 1 && (
            <>
              <div className="field hk">
                <span>Show panels and dock on</span>
                <select
                  value={prefs.panelsDisplay && state.displays.some((d) => d.id === String(prefs.panelsDisplay)) ? String(prefs.panelsDisplay) : state.displays.find((d) => d.primary).id}
                  onChange={async (e) => {
                    const main = state.displays.find((d) => d.primary);
                    await setPref({ panelsDisplay: e.target.value === main.id ? null : e.target.value });
                    say('Panels moved to that screen. Their layout starts fresh there.');
                  }}
                  aria-label="Screen for panels"
                >
                  {state.displays.map((d) => <option key={d.id} value={d.id}>{d.name}{d.primary ? ' (main)' : ''} · {d.width}×{d.height}</option>)}
                </select>
              </div>
              <p className="fine">Search and the folder peek open on the screen where your mouse is. If that screen is unplugged, panels move to your main screen and return when it is back.</p>
            </>
          )}
        </section>
      </div>

      <UpdateCard say={say} />
      <SetupCard state={state} setState={setState} say={say} />
    </div>
  );
}
