import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Gauge, Server, Rocket, HardDrive, Cpu, MemoryStick, MonitorPlay, ExternalLink, Copy, Square, ScanSearch, Trash2, Lock, Check, RefreshCw, Eraser, CalendarDays,
} from 'lucide-react';
import { api } from '../api.js';
import CleanupTab from './CleanupTab.jsx';
import ReportTab from './ReportTab.jsx';
import ManagedServers from './ManagedServers.jsx';
import { Spark, Bar, Ring } from './charts.jsx';
import { useSys } from '../lib/useSys.js';
import { fmtBytes, fmtUptime, describeServer } from '../lib/format.js';

const TABS = [
  ['overview', 'Overview', Gauge],
  ['dev', 'Dev servers', Server],
  ['cleanup', 'Cleanup', Eraser],
  ['startup', 'Startup', Rocket],
  ['storage', 'Storage', HardDrive],
  ['week', 'This week', CalendarDays],
];

// Same list the app enforces on its side; here it only hides buttons that could never work.
const PROTECTED = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm', 'fontdrvhost', 'explorer', 'sihost', 'ctfmon', 'audiodg', 'memory compression', 'secure system', 'msmpeng', 'searchhost', 'deskly']);

export default function PerformancePage({ state, say }) {
  const [tab, setTab] = useState('overview');
  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">Performance</span></h1>
          <p>What is using your PC right now, and how to get it back.</p>
        </div>
      </section>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview say={say} />}
      {tab === 'dev' && (
        <>
          <ManagedServers say={say} />
          <DevServers say={say} />
        </>
      )}
      {tab === 'cleanup' && <CleanupTab say={say} />}
      {tab === 'startup' && <Startup say={say} />}
      {tab === 'storage' && <Storage say={say} />}
      {tab === 'week' && <ReportTab say={say} />}
    </div>
  );
}

/* ---------- shared: an "End" button that asks twice ---------- */
function EndButton({ group, say }) {
  const [armed, setArmed] = useState(false);
  const blocked = PROTECTED.has(String(group.name).toLowerCase());
  if (blocked) return <span className="end-lock" title="Windows needs this program"><Lock size={13} /></span>;
  const run = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3500);
      return;
    }
    const r = await api.killProcs(group.pids);
    setArmed(false);
    say(r.ok ? `Ended ${group.name}${group.count > 1 ? ` (${group.count} processes)` : ''}` : r.error || `Couldn't end ${group.name}`);
  };
  return (
    <button className={'end-btn' + (armed ? ' arm' : '')} onClick={run} title={armed ? 'Click again to end it' : `End ${group.name}`}>
      {armed ? (group.count > 1 ? `End all ${group.count}?` : 'End it?') : 'End'}
    </button>
  );
}

function HogList({ title, icon: Icon, rows, value, say }) {
  return (
    <section className="card hogs">
      <h2 className="card-title"><Icon size={15} /> {title}</h2>
      {rows.length === 0 && <p className="fine">Nothing significant right now.</p>}
      {rows.map((h) => (
        <div className="hog" key={h.name}>
          <span className="hog-name">{h.name}{h.count > 1 && <em> ×{h.count}</em>}</span>
          <b>{value(h)}</b>
          <EndButton group={h} say={say} />
        </div>
      ))}
    </section>
  );
}

/* ---------- overview ---------- */
function Overview({ say }) {
  const { sample: s, hist } = useSys(true);
  if (!s) return <div className="card"><p className="fine">Reading sensors…</p></div>;
  const ramPct = (s.ram.used / s.ram.total) * 100;
  const gpuRows = (s.hogs.gpu || []).map((g) => ({ ...g, count: g.pids.length }));
  return (
    <>
      <div className="gauges">
        <section className="card gauge">
          <Ring value={s.cpu} label={Math.round(s.cpu) + '%'} sub="CPU" color="#38bdf8" />
          <div className="gauge-body">
            <h3><Cpu size={14} /> Processor</h3>
            <small>{s.cores} threads · {s.procCount} processes</small>
            <Spark data={hist.cpu} color="#38bdf8" />
          </div>
        </section>
        <section className="card gauge">
          <Ring value={ramPct} label={Math.round(ramPct) + '%'} sub="RAM" color="#a78bfa" />
          <div className="gauge-body">
            <h3><MemoryStick size={14} /> Memory</h3>
            <small>{fmtBytes(s.ram.used)} of {fmtBytes(s.ram.total, 0)} · {fmtBytes(s.ram.total - s.ram.used)} free</small>
            <Spark data={hist.ram} color="#a78bfa" />
          </div>
        </section>
        {s.gpu && (
          <section className="card gauge">
            <Ring value={s.gpu.util} label={Math.round(s.gpu.util) + '%'} sub="GPU" color="#34d399" />
            <div className="gauge-body">
              <h3><MonitorPlay size={14} /> Graphics</h3>
              <small>{s.gpu.name.replace('NVIDIA GeForce ', '')} · {s.gpu.temp}°C{s.gpu.power ? ` · ${Math.round(s.gpu.power)} W` : ''}</small>
              <Bar value={s.gpu.memUsed} max={s.gpu.memTotal} color="#34d399" />
              <small>{fmtBytes(s.gpu.memUsed)} / {fmtBytes(s.gpu.memTotal, 0)} VRAM</small>
            </div>
          </section>
        )}
        <section className="card gauge disks">
          <div className="gauge-body">
            <h3><HardDrive size={14} /> Storage</h3>
            {(s.disks || []).map((d) => (
              <div key={d.drive} className="disk">
                <div><b>{d.drive}</b> {d.label && <em>{d.label}</em>}<span>{fmtBytes(d.free, 0)} free of {fmtBytes(d.total, 0)}</span></div>
                <Bar value={d.total - d.free} max={d.total} color="#fbbf24" warn={92} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="hog-cols">
        <HogList title="Most CPU" icon={Cpu} rows={(s.hogs.cpu || []).filter((h) => h.cpu >= 0.1).slice(0, 6)} value={(h) => h.cpu.toFixed(1) + '%'} say={say} />
        <HogList title="Most memory" icon={MemoryStick} rows={(s.hogs.ram || []).slice(0, 6)} value={(h) => fmtBytes(h.ram)} say={say} />
        <HogList title="Most GPU" icon={MonitorPlay} rows={gpuRows.slice(0, 6)} value={(h) => h.gpu.toFixed(1) + '%'} say={say} />
      </div>
      <p className="fine">A program with ×N has N processes (a browser has one per tab). "End" closes all of them. Windows system programs are locked.</p>
    </>
  );
}

/* ---------- dev servers ---------- */
function DevServers({ say }) {
  const { sample: s } = useSys(false);
  const [armed, setArmed] = useState(null);
  const [own, setOwn] = useState(new Set()); // ports of servers Deskly started (shown in their own card)
  useEffect(() => {
    const set = (l) => setOwn(new Set(l.filter((m) => m.port && (m.status === 'running' || m.status === 'starting')).map((m) => m.port)));
    api.mgdList().then(set);
    return api.onMgd?.(set);
  }, []);
  if (!s) return <div className="card"><p className="fine">Looking for servers…</p></div>;
  const servers = (s.servers || []).filter((v) => !own.has(v.port)).sort((a, b) => a.port - b.port);
  const stop = async (sv) => {
    if (armed !== sv.pid) {
      setArmed(sv.pid);
      setTimeout(() => setArmed((a) => (a === sv.pid ? null : a)), 3500);
      return;
    }
    const r = await api.killProcs([sv.pid]);
    setArmed(null);
    say(r.ok ? `Stopped :${sv.port}` : r.error || 'Could not stop it');
  };
  if (!servers.length) {
    return (
      <div className="card empty-card">
        <Server size={30} />
        <h3>No dev servers running</h3>
        <p>When you start Vite, Next, Node, Python and friends, they appear here with their port, project and memory use.</p>
      </div>
    );
  }
  return (
    <div className="servers">
      {servers.map((sv) => {
        const d = describeServer(sv);
        const old = sv.start && Date.now() - sv.start > 6 * 3600 * 1000;
        return (
          <section className="card server" key={sv.pid + ':' + sv.port}>
            <div className="server-port">:{sv.port}</div>
            <div className="server-main">
              <h3>{d.title}</h3>
              <small>{sv.name} · pid {sv.pid} · {fmtBytes(sv.ram, 0)} · up {fmtUptime(sv.start)}{old && <b className="old"> · running for a long time</b>}</small>
              <code title={sv.cmd}>{sv.cmd}</code>
            </div>
            <div className="server-actions">
              <button className="btn-ghost" onClick={() => api.openPort(sv.port)}><ExternalLink size={14} /> Open</button>
              <button className="btn-ghost" onClick={() => { api.copyText(`http://localhost:${sv.port}`); say('Copied the URL'); }}><Copy size={14} /> Copy URL</button>
              <button className={'btn-ghost danger' + (armed === sv.pid ? ' arm' : '')} onClick={() => stop(sv)}>
                <Square size={13} fill="currentColor" /> {armed === sv.pid ? 'Click again to stop' : 'Stop'}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- startup apps ---------- */
// An estimate from what the program has used since it started, not a stopwatch measurement.
function Impact({ i }) {
  if (!i || i.level === 'off') return null;
  const label = { high: 'High', medium: 'Medium', low: 'Low', unknown: 'Unknown' }[i.level];
  const tip = i.level === 'unknown'
    ? `Cannot estimate: ${i.reason}`
    : `Estimate from what it has used since it started: ${fmtBytes(i.ram, 0)} of memory${i.atBoot ? `, ${i.cpu} s of processor time since boot` : ' (it did not start with Windows, so processor time is not counted)'}${i.note ? `. ${i.note}` : ''}.`;
  return <span className={'impact ' + i.level} title={tip}>{label}{i.level !== 'unknown' && <small>{fmtBytes(i.ram, 0)}</small>}</span>;
}

function Startup({ say }) {
  const [list, setList] = useState(null);
  const [sortImpact, setSortImpact] = useState(true);
  const load = useCallback(() => api.startupList().then(setList), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <div className="card"><p className="fine">Reading your startup list…</p></div>;
  const on = list.filter((x) => x.enabled).length;
  const heavy = list.filter((x) => x.enabled && x.impact && x.impact.level === 'high');
  const heavyRam = heavy.reduce((a, x) => a + (x.impact.ram || 0), 0);
  const rank = { high: 0, medium: 1, low: 2, unknown: 3, off: 4 };
  const rows = sortImpact ? [...list].sort((a, b) => (rank[a.impact ? a.impact.level : 'unknown'] - rank[b.impact ? b.impact.level : 'unknown']) || (b.impact?.cpu || 0) - (a.impact?.cpu || 0)) : list;
  const toggle = async (item) => {
    const r = await api.startupSet(item.id, !item.enabled);
    if (!r.ok) return say(r.error || 'Could not change that entry');
    setList((l) => l.map((x) => (x.id === item.id ? { ...x, enabled: !x.enabled } : x)));
    say(`${item.name} will ${item.enabled ? 'no longer' : 'now'} start with Windows`);
  };
  return (
    <section className="card">
      <div className="files-head">
        <h2 className="card-title">Starts with Windows <em>{on} on · {list.length - on} off</em></h2>
        <div className="files-tools">
          <button className={'btn-ghost' + (sortImpact ? ' on' : '')} onClick={() => setSortImpact((v) => !v)}>{sortImpact ? 'Sorted by impact' : 'Sort by impact'}</button>
          <button className="btn-ghost" onClick={() => { setList(null); load(); }}><RefreshCw size={14} /></button>
        </div>
      </div>
      {heavy.length > 0 ? (
        <p className="impact-sum"><b>{heavy.length} heavy {heavy.length === 1 ? 'program starts' : 'programs start'} with Windows</b>: {heavy.map((x) => x.name).join(', ')}. Together they hold about {fmtBytes(heavyRam, 0)} right now. Turning one off only stops it launching at sign-in.</p>
      ) : (
        <p className="impact-sum ok">Nothing heavy starts with Windows. Nice and lean.</p>
      )}
      <div className="startup">
        {rows.map((x) => (
          <div className={'su-row' + (x.enabled ? '' : ' off')} key={x.id}>
            <span className="p-icon sm">{x.icon ? <img src={x.icon} alt="" /> : <span className="p-fallback">{x.name[0]}</span>}</span>
            <div className="su-text"><strong>{x.name}</strong><small title={x.command}>{x.scope}{x.editable ? '' : ' · system-wide'} · {x.command}</small></div>
            <Impact i={x.enabled ? x.impact : { level: 'off' }} />
            <button
              className={'mini-switch' + (x.enabled ? ' on' : '')}
              role="switch" aria-checked={x.enabled} disabled={!x.editable}
              title={x.editable ? (x.enabled ? 'Turn off at startup' : 'Turn on at startup') : 'System-wide entries need administrator rights'}
              onClick={() => toggle(x)}
            ><i /></button>
          </div>
        ))}
      </div>
      <p className="fine">Turning an entry off only stops it launching at sign-in. Nothing is uninstalled and you can turn it back on any time.</p>
    </section>
  );
}

/* ---------- storage cleaner ---------- */
function Storage({ say }) {
  const { sample: s } = useSys(false);
  const [phase, setPhase] = useState('idle'); // idle | scanning | done
  const [prog, setProg] = useState(null);
  const [found, setFound] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => api.onCleanProgress?.(setProg), []);

  const scan = async () => {
    setPhase('scanning');
    setProg(null);
    const r = await api.cleanScan();
    if (!r) return setPhase('idle');
    setFound(r);
    setSel(new Set(r.filter((x) => x.safe).map((x) => x.id)));
    setPhase('done');
  };

  const total = useMemo(() => found.filter((f) => sel.has(f.id)).reduce((a, f) => a + f.size, 0), [found, sel]);
  const flip = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const clean = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    setBusy(true);
    const r = await api.cleanRemove([...sel]);
    setBusy(false);
    setArmed(false);
    const failedIds = new Set(r.failed.map((f) => f.id));
    setFound((f) => f.filter((x) => !sel.has(x.id) || failedIds.has(x.id)));
    setSel(new Set());
    say(`Freed ${fmtBytes(r.freed)}${r.failed.length ? ` · ${r.failed.length} item(s) could not be removed (in use?)` : ''}`);
  };

  const groups = [
    ['projects', 'Project folders you can rebuild', 'Moved to the Recycle Bin, so you can restore them.'],
    ['caches', 'Tool caches', 'Downloaded again automatically when needed. Removed permanently.'],
  ];

  return (
    <>
      <section className="card">
        <h2 className="card-title"><HardDrive size={15} /> Drives</h2>
        <div className="drives">
          {(s ? s.disks : []).map((d) => (
            <div key={d.drive} className="disk big">
              <div><b>{d.drive}</b> {d.label && <em>{d.label}</em>}<span>{fmtBytes(d.free, 0)} free of {fmtBytes(d.total, 0)}</span></div>
              <Bar value={d.total - d.free} max={d.total} color="#fbbf24" warn={92} />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title"><ScanSearch size={15} /> Reclaim space</h2>
        {phase === 'idle' && (
          <div className="scan-intro">
            <p>Finds <b>node_modules</b>, build output and tool caches (npm, pip, Electron) across your projects. Nothing is removed until you choose.</p>
            <button className="btn-primary" onClick={scan}><ScanSearch size={16} /> Scan for reclaimable space</button>
          </div>
        )}
        {phase === 'scanning' && (
          <div className="scan-run">
            <div className="spinner" />
            <div>
              <strong>Scanning… {prog ? `${prog.done} / ${prog.total}` : ''}</strong>
              <small>{prog ? prog.current : 'Looking through your projects'} · big caches take a minute</small>
              {prog && <Bar value={prog.done} max={prog.total} color="#a78bfa" />}
            </div>
          </div>
        )}
        {phase === 'done' && (
          <>
            {found.length === 0 && <p className="fine">Nothing to clean up. Your projects are already lean.</p>}
            {groups.map(([g, title, note]) => {
              const rows = found.filter((f) => f.group === g);
              if (!rows.length) return null;
              return (
                <div className="clean-group" key={g}>
                  <h3>{title} <small>{fmtBytes(rows.reduce((a, r) => a + r.size, 0))}</small></h3>
                  <p className="fine">{note}</p>
                  {rows.map((r) => (
                    <label className={'clean-row' + (sel.has(r.id) ? ' on' : '')} key={r.id} title={r.path}>
                      <input type="checkbox" checked={sel.has(r.id)} onChange={() => flip(r.id)} />
                      <span className="cr-check"><Check size={13} /></span>
                      <span className="cr-name"><strong>{r.project}</strong> <em>{r.label}</em>{!r.safe && <i className="check-tag">check first</i>}</span>
                      <span className="cr-size">{fmtBytes(r.size)}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {found.length > 0 && (
              <div className="clean-foot">
                <button className="btn-ghost" onClick={scan}><RefreshCw size={14} /> Rescan</button>
                <span className="clean-total">{fmtBytes(total)} selected</span>
                <button className={'btn-primary' + (armed ? ' arm' : '')} disabled={!sel.size || busy} onClick={clean}>
                  <Trash2 size={15} /> {busy ? 'Cleaning…' : armed ? `Confirm: free ${fmtBytes(total)}` : `Clean ${sel.size} item${sel.size === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
