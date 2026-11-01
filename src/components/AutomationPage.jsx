import { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Bell, History, Zap, BatteryLow, Plug, Clock, Cpu, Workflow, Thermometer } from 'lucide-react';
import { api } from '../api.js';
import { CatIcon } from '../icons.jsx';
import Switch from './Switch.jsx';
import { fmtAgo } from '../lib/format.js';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const KINDS = [
  ['app', 'An app is running', Cpu],
  ['battery', 'I am on battery', BatteryLow],
  ['plugged', 'I am plugged in', Plug],
  ['time', 'It is a certain time', Clock],
  ['lowbat', 'The battery is low', BatteryLow],
  ['hot', 'The graphics card runs hot', Thermometer],
];

function sentence(r, sceneName) {
  const w = r.when;
  const when =
    w.kind === 'app' ? <><b>{w.label || w.exe}</b> is running</>
    : w.kind === 'power' ? <>you are <b>{w.state === 'battery' ? 'on battery' : 'plugged in'}</b></>
    : w.kind === 'lowbat' ? <>the battery is at <b>{w.below}%</b> or less</>
    : w.kind === 'hot' ? <>the graphics card is at <b>{w.above}°C</b> or more</>
    : <>it is <b>{w.from}–{w.to}</b>{w.days && w.days.length < 7 ? ` (${w.days.map((d) => 'SMTWTFS'[d]).join(' ')})` : ''}</>;
  return <>When {when} → <b>{sceneName}</b></>;
}

export default function AutomationPage({ state, setState, say }) {
  const prefs = state.prefs;
  const scenes = state.scenes || [];
  const auto = state.automation || { rules: [], log: [] };
  const [kind, setKind] = useState('app');
  const [exe, setExe] = useState('');
  const [from, setFrom] = useState('22:00');
  const [to, setTo] = useState('06:00');
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [scene, setScene] = useState(scenes[0] ? scenes[0].id : '');
  const [restore, setRestore] = useState(true);
  const [running, setRunning] = useState([]);
  const [below, setBelow] = useState(20);
  const [above, setAbove] = useState(80);
  const [hs, setHs] = useState(state.health || {}); // does this PC have a battery / a readable GPU temperature?

  useEffect(() => { api.runningNames().then(setRunning); api.healthProbe?.().then((h) => h && setHs(h)); }, []);
  useEffect(() => { if (!scenes.some((s) => s.id === scene) && scenes[0]) setScene(scenes[0].id); }, [scenes, scene]);

  // friendly suggestions: your desktop apps (with their program name) and what is open now
  const suggestions = useMemo(() => {
    const m = new Map();
    for (const i of state.items) if (i.exe) m.set(i.exe, i.name);
    for (const r of running) if (!m.has(r)) m.set(r, r.replace(/\.exe$/i, ''));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [state.items, running]);

  const setPref = async (patch) => {
    const p = await api.setPrefs(patch);
    setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));
  };

  const add = async () => {
    let when;
    if (kind === 'app') {
      const typed = exe.trim();
      const name = /\.exe$/i.test(typed) ? typed : typed + '.exe';
      const match = suggestions.find(([e]) => e.toLowerCase() === name.toLowerCase());
      when = { kind: 'app', exe: name, label: match ? match[1] : typed };
    } else if (kind === 'time') when = { kind: 'time', from, to, days };
    else if (kind === 'lowbat') when = { kind: 'lowbat', below: Number(below) };
    else if (kind === 'hot') when = { kind: 'hot', above: Number(above) };
    else when = { kind: 'power', state: kind };
    const before = (state.automation?.rules || []).length;
    const next = await api.addAutoRule({ when, scene, restore });
    setState(next);
    if ((next.automation?.rules || []).length > before) {
      setExe('');
      say('Rule added. It reacts the next time the condition becomes true.');
    } else say('That rule was not valid. Check the program name and times.');
  };

  const canAdd = scene && (kind !== 'app' || exe.trim()) && (kind !== 'time' || (from && to && days.length))
    && (kind !== 'lowbat' || (below >= 5 && below <= 90)) && (kind !== 'hot' || (above >= 50 && above <= 95));
  const unavailable = (kind === 'lowbat' && hs.hasBattery === false) ? 'This PC reports no battery, so this rule would never fire.'
    : (kind === 'hot' && hs.hasGpuTemp === false) ? 'Deskly can only read the temperature of NVIDIA graphics cards, and none was found, so this rule would never fire.' : '';
  const sceneName = (id) => (scenes.find((s) => s.id === id) || {}).name || 'a scene that was deleted';

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">Automation</span></h1>
          <p>Let your desktop follow what you are doing, and tell you quietly when something needs attention.</p>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title"><Workflow size={16} /> Auto-scenes <em>{auto.rules.length}</em></h2>

        {auto.rules.length === 0 ? (
          <p className="fine">No automatic scenes yet. For example: when <b>Steam</b> is running, switch to <b>Gaming</b>; on battery, switch to a light scene.</p>
        ) : (
          <div className="rules">
            {auto.rules.map((r) => {
              const sc = scenes.find((s) => s.id === r.scene);
              return (
                <div className={'rule' + (r.enabled === false ? ' off' : '')} key={r.id} style={{ '--c': sc ? sc.color : '#8b5cf6' }}>
                  <span className="rule-n">{sc ? <CatIcon name={sc.icon} size={14} /> : '?'}</span>
                  <span className="rule-text">{sentence(r, sceneName(r.scene))}{r.restore !== false && <small className="muted-note"> · switches back afterwards</small>}</span>
                  <button className={'mini-switch' + (r.enabled === false ? '' : ' on')} role="switch" aria-checked={r.enabled !== false} aria-label="Enabled" onClick={async () => setState(await api.toggleAutoRule(r.id))}><i /></button>
                  <button className="icon-btn danger" aria-label="Delete rule" onClick={async () => { setState(await api.deleteAutoRule(r.id)); say('Rule deleted'); }}><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        )}

        <div className="auto-form">
          <span className="rf-word">When</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Trigger">
            {KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>

          {kind === 'app' && (
            <>
              <input list="running-apps" value={exe} onChange={(e) => setExe(e.target.value)} placeholder="steam.exe" aria-label="Program" spellCheck={false} />
              <datalist id="running-apps">
                {suggestions.map(([e, name]) => <option key={e} value={e}>{name}</option>)}
              </datalist>
            </>
          )}

          {kind === 'time' && (
            <>
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <span className="rf-word">to</span>
              <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              <span className="days">
                {DAY_LABELS.map((d, i) => (
                  <button key={i} className={days.includes(i) ? 'on' : ''} onClick={() => setDays((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} aria-label={'Day ' + i}>{d}</button>
                ))}
              </span>
            </>
          )}

          {kind === 'lowbat' && (
            <>
              <span className="rf-word">at</span>
              <input type="number" min={5} max={90} value={below} onChange={(e) => setBelow(e.target.value)} aria-label="Battery percent" style={{ width: 70 }} />
              <span className="rf-word">% or less (on battery)</span>
            </>
          )}

          {kind === 'hot' && (
            <>
              <span className="rf-word">at</span>
              <input type="number" min={50} max={95} value={above} onChange={(e) => setAbove(e.target.value)} aria-label="Temperature" style={{ width: 70 }} />
              <span className="rf-word">°C or more</span>
            </>
          )}

          <span className="rf-word">→ switch to</span>
          <select value={scene} onChange={(e) => setScene(e.target.value)} aria-label="Scene">
            {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-small add" onClick={add} disabled={!canAdd}><Plus size={15} /> Add</button>
        </div>
        <div className="switch-list">
          <Switch on={restore} onChange={setRestore} label="Switch back afterwards" hint="When the condition ends, return to the scene you had before" />
        </div>
        {unavailable && <p className="fine warn">{unavailable}</p>}
        {(kind === 'lowbat' || kind === 'hot') && !unavailable && (
          <p className="fine">
            {kind === 'lowbat' ? 'Uses the battery level Windows reports, checked every 30 seconds. Plugging in ends it.' : 'Starts after three hot readings in a row (about 90 seconds) and ends once it is 5° under the limit, so it does not flip back and forth.'}
            {' '}The <b>Light mode</b> scene (quiet desktop, just the clock) suits both.
          </p>
        )}
        <p className="fine">Rules react the moment a condition becomes true, so you can still change the scene by hand afterwards. Program names are the ones you see in Task Manager.</p>
      </section>

      <div className="split">
        <section className="card">
          <h2 className="card-title"><Bell size={16} /> Quiet alerts</h2>
          <div className="switch-list">
            <Switch on={prefs.alerts?.ram !== false} onChange={(v) => setPref({ alerts: { ...prefs.alerts, ram: v } })} label="Memory almost full" hint="Over 90% for about 90 seconds. At most once every 2 hours." />
            <Switch on={prefs.alerts?.disk !== false} onChange={(v) => setPref({ alerts: { ...prefs.alerts, disk: v } })} label="A drive is almost full" hint="Under 10% free. Once a day per drive." />
            <Switch on={prefs.alerts?.servers !== false} onChange={(v) => setPref({ alerts: { ...prefs.alerts, servers: v } })} label="A dev server runs for hours" hint="Still running after 8 hours. Once per server." />
            <Switch on={prefs.alerts?.leftovers !== false} onChange={(v) => setPref({ alerts: { ...prefs.alerts, leftovers: v } })} label="Leftover helper processes" hint="2 GB or more held by apps that closed. Once a day." />
            <Switch on={prefs.alerts?.weekly !== false} onChange={(v) => setPref({ alerts: { ...prefs.alerts, weekly: v } })} label="Weekly PC report" hint="One notification a week once there are 3 days of data. See Performance → This week." />
          </div>
          <p className="fine">Alerts are silent notifications. Click one to open the right page. Deskly checks only every few minutes, so it costs nothing while you work.</p>
        </section>

        <section className="card">
          <h2 className="card-title"><Zap size={16} /> Smart Quick access</h2>
          <div className="switch-list">
            <Switch on={prefs.smartQuick !== false} onChange={(v) => setPref({ smartQuick: v })} label="Learn by time of day" hint="Apps you open in the morning rank higher in the morning, games higher in the evening." />
          </div>
          <h2 className="card-title" style={{ marginTop: 20 }}><History size={16} /> Recent activity</h2>
          {auto.log.length === 0 ? (
            <p className="fine">Nothing has fired yet.</p>
          ) : (
            <div className="actlog">
              {auto.log.slice(0, 8).map((l, i) => <div key={i}><span>{fmtAgo(l.t)}</span>{l.text}</div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
